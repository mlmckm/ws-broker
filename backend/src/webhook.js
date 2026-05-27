const axios = require('axios');
const crypto = require('crypto');
const { pool } = require('./db');
const { topicMatchesPattern } = require('./acl');

// ── Şablon Motoru ──────────────────────────────────────────────────────────
// Kullanılabilir değişkenler:
//   {{topic}}              → "ev/salon/sicaklik"
//   {{topic_parts.0}}      → "ev"
//   {{topic_parts.1}}      → "salon"
//   {{payload}}            → ham payload string
//   {{payload.field}}      → JSON payload içindeki alan (ör: {{payload.temperature}})
//   {{payload.nested.key}} → iç içe JSON (ör: {{payload.sensor.value}})
//   {{sender}}             → gönderen kullanıcı adı
//   {{client_id}}          → gönderen client UUID
//   {{timestamp}}          → ISO timestamp
//   {{event}}              → "message" | "client_connect" | "client_disconnect"

function buildTemplateContext(data) {
  const { topic, payload, senderUsername, senderClientId, eventType, timestamp } = data;
  const ctx = {
    topic:     topic || '',
    payload:   payload || '',
    sender:    senderUsername || '',
    client_id: senderClientId || '',
    timestamp: timestamp || new Date().toISOString(),
    event:     eventType || 'message',
  };

  // topic_parts
  if (topic) {
    topic.split('/').forEach((part, i) => {
      ctx[`topic_parts.${i}`] = part;
    });
  }

  // payload JSON alanları (iç içe destek)
  if (payload) {
    try {
      const parsed = JSON.parse(payload);
      flattenObject(parsed, 'payload', ctx);
    } catch {}
  }

  return ctx;
}

function flattenObject(obj, prefix, result) {
  if (obj === null || obj === undefined) return;
  if (typeof obj !== 'object') {
    result[prefix] = String(obj);
    return;
  }
  for (const [key, val] of Object.entries(obj)) {
    const path = `${prefix}.${key}`;
    result[path] = val !== null && val !== undefined ? String(val) : '';
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      flattenObject(val, path, result);
    }
  }
}

function renderTemplate(template, ctx) {
  if (!template) return template;
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const trimmed = key.trim();
    return Object.prototype.hasOwnProperty.call(ctx, trimmed)
      ? ctx[trimmed]
      : match; // bulunamazsa olduğu gibi bırak
  });
}

let webhookCache = [];

async function loadWebhookCache() {
  const result = await pool.query('SELECT * FROM webhooks WHERE active = TRUE');
  webhookCache = result.rows;
  console.log(`[${new Date().toISOString()}] [WEBHOOK] Loaded ${webhookCache.length} active webhooks`);
}

async function triggerWebhooks(topic, payload, payloadType, senderUsername, senderClientId) {
  const matches = webhookCache.filter(wh =>
    (wh.trigger_on === 'message' || !wh.trigger_on) && wh.topic_pattern &&
    topicMatchesPattern(topic, wh.topic_pattern)
  );
  for (const webhook of matches) {
    fireWebhook(webhook, { topic, payload, payloadType, senderUsername, senderClientId }).catch(() => {});
  }
}

async function triggerEventWebhooks(event, clientData) {
  // 'client_connect' or 'client_disconnect'
  const matches = webhookCache.filter(wh => wh.trigger_on === event);
  for (const webhook of matches) {
    const delayMs = (parseInt(webhook.delay_seconds) || 0) * 1000;
    const fire = () => fireWebhook(webhook, {
      topic: null,
      payload: JSON.stringify(clientData),
      payloadType: 'json',
      senderUsername: clientData.username || null,
      senderClientId: clientData.client_id || null,
      eventType: event,
    }).catch(() => {});

    if (delayMs > 0) {
      setTimeout(fire, delayMs);
    } else {
      fire();
    }
  }
}

async function fireWebhook(webhook, { topic, payload, payloadType, senderUsername, senderClientId, eventType }, attempt = 1) {
  const timestamp = new Date().toISOString();

  // ── Şablon context oluştur ─────────────────────────────────────────────────
  const ctx = buildTemplateContext({ topic, payload, senderUsername, senderClientId, eventType, timestamp });

  // ── URL şablonu ────────────────────────────────────────────────────────────
  const finalUrl = renderTemplate(webhook.url_template || webhook.url, ctx);

  // ── Body oluştur ───────────────────────────────────────────────────────────
  let body;
  if (webhook.body_template) {
    // Özel body şablonu var — render et
    const rendered = renderTemplate(webhook.body_template, ctx);
    try {
      body = JSON.parse(rendered); // JSON ise parse et
    } catch {
      body = rendered; // plain text gönder
    }
  } else {
    // Varsayılan body
    body = {
      event: eventType || 'message',
      topic: topic || undefined,
      payload,
      payload_type: payloadType,
      sender_username: senderUsername,
      sender_client_id: senderClientId,
      timestamp,
    };
  }

  // ── Headers oluştur ────────────────────────────────────────────────────────
  const baseHeaders = { 'Content-Type': 'application/json', ...(webhook.headers || {}) };

  // Header şablonları varsa uygula
  const headerTemplates = webhook.header_templates || {};
  const renderedHeaders = {};
  for (const [k, v] of Object.entries(headerTemplates)) {
    renderedHeaders[k] = renderTemplate(v, ctx);
  }

  const headers = { ...baseHeaders, ...renderedHeaders };

  if (webhook.secret) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const sig = crypto.createHmac('sha256', webhook.secret).update(bodyStr).digest('hex');
    headers['X-Broker-Signature'] = `sha256=${sig}`;
  }

  const start = Date.now();
  let statusCode = null;
  let responseBody = null;
  let success = false;

  try {
    const res = await axios({
      method: webhook.method || 'POST',
      url: finalUrl,
      data: body,
      headers,
      timeout: webhook.timeout_ms || 5000,
    });
    statusCode = res.status;
    responseBody = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    success = statusCode >= 200 && statusCode < 300;
  } catch (err) {
    statusCode = err.response?.status || 0;
    responseBody = err.message;
    success = false;
  }

  const duration = Date.now() - start;

  await pool.query(
    `INSERT INTO webhook_logs (webhook_id, topic, payload, status_code, response_body, duration_ms, success)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [webhook.id, topic, payload, statusCode, responseBody?.substring(0, 2000), duration, success]
  );

  if (success) {
    await pool.query(
      `UPDATE webhooks SET last_triggered_at = NOW(), last_status_code = $1,
       total_triggers = total_triggers + 1 WHERE id = $2`,
      [statusCode, webhook.id]
    );
  } else {
    await pool.query(
      `UPDATE webhooks SET last_triggered_at = NOW(), last_status_code = $1,
       total_triggers = total_triggers + 1, failed_triggers = failed_triggers + 1 WHERE id = $2`,
      [statusCode, webhook.id]
    );

    const maxRetries = webhook.retry_count || 3;
    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      setTimeout(() => {
        fireWebhook(webhook, { topic, payload: payload, payloadType: body.payload_type, senderUsername: body.sender_username, senderClientId: body.sender_client_id }, attempt + 1).catch(() => {});
      }, delay);
    }
  }

  console.log(`[${new Date().toISOString()}] [WEBHOOK] ${webhook.name} → ${statusCode} (${duration}ms) attempt=${attempt}`);
}

module.exports = { loadWebhookCache, triggerWebhooks, triggerEventWebhooks };

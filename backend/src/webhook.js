const axios = require('axios');
const crypto = require('crypto');
const { pool } = require('./db');
const { topicMatchesPattern } = require('./acl');

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
  const body = {
    event: eventType || 'message',
    topic: topic || undefined,
    payload,
    payload_type: payloadType,
    sender_username: senderUsername,
    sender_client_id: senderClientId,
    timestamp: new Date().toISOString(),
  };

  const headers = { 'Content-Type': 'application/json', ...(webhook.headers || {}) };

  if (webhook.secret) {
    const sig = crypto.createHmac('sha256', webhook.secret).update(JSON.stringify(body)).digest('hex');
    headers['X-Broker-Signature'] = `sha256=${sig}`;
  }

  const start = Date.now();
  let statusCode = null;
  let responseBody = null;
  let success = false;

  try {
    const res = await axios({
      method: webhook.method || 'POST',
      url: webhook.url,
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

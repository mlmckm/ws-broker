const express = require('express');
const { pool, getSettings, setSetting } = require('./db');
const { hashPassword, verifyPassword, signToken } = require('./auth');
const { authMiddleware, requireAdmin, requireAdminOrViewer, loginLimiter, apiLimiter } = require('./middleware');

// Tüm API rotalarına genel rate limiter uygula
const router = express.Router();
router.use(apiLimiter);
const { writeAudit } = require('./audit');
const { loadAclCache, testAcl } = require('./acl');
const { loadWebhookCache } = require('./webhook');
const {
  publishFromApi, kickClient, getActiveClients, getActiveTopics, deleteRetain,
  clients, subscriptions, retainedMessages, startTime,
} = require('./broker');

// ─── AUTH ────────────────────────────────────────────────────────────────────

router.post('/auth/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

  if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      await writeAudit({ actor: username, action: 'auth.login_failed', ip, result: 'failure' });
      return res.status(401).json({ error: 'Geçersiz kullanıcı adı veya şifre' });
    }

    if (user.role === 'client') {
      return res.status(403).json({ error: 'Bu kullanıcı dashboard\'a erişemez' });
    }

    const token = signToken({ username: user.username, role: user.role });
    await pool.query('UPDATE users SET last_seen = NOW() WHERE username = $1', [username]);
    await writeAudit({ actor: username, action: 'auth.login', ip });

    res.json({ token, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auth/logout', authMiddleware, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  await writeAudit({ actor: req.user.username, action: 'auth.logout', ip });
  res.json({ success: true });
});

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

router.get('/clients', authMiddleware, requireAdminOrViewer, (req, res) => {
  const active = getActiveClients();
  res.json({ clients: active, total: active.length });
});

router.delete('/clients/:clientId', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { clientId } = req.params;
  const kicked = kickClient(clientId);
  if (!kicked) return res.status(404).json({ error: 'Client bulunamadı' });
  await writeAudit({ actor: req.user.username, action: 'client.kick', targetType: 'client', targetId: clientId, ip });
  res.json({ success: true });
});

router.delete('/clients', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  let count = 0;
  for (const [cid] of clients.entries()) {
    if (kickClient(cid)) count++;
  }
  await writeAudit({ actor: req.user.username, action: 'client.kick_all', ip, details: { count } });
  res.json({ success: true, kicked: count });
});

router.get('/clients/history', authMiddleware, requireAdminOrViewer, async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const result = await pool.query(
    `SELECT * FROM client_sessions ORDER BY connected_at DESC LIMIT $1 OFFSET $2`,
    [parseInt(limit), parseInt(offset)]
  );
  const count = await pool.query('SELECT COUNT(*) FROM client_sessions');
  res.json({ sessions: result.rows, total: parseInt(count.rows[0].count) });
});

// ─── TOPICS ──────────────────────────────────────────────────────────────────

router.get('/topics', authMiddleware, requireAdminOrViewer, async (req, res) => {
  const active = getActiveTopics();
  const topicsWithStats = await Promise.all(active.map(async (t) => {
    const msgResult = await pool.query(`SELECT COUNT(*), MAX(created_at) FROM messages WHERE topic = $1`, [t.topic]);
    const recentResult = await pool.query(
      `SELECT COUNT(*) FROM messages WHERE topic = $1 AND created_at >= NOW() - INTERVAL '1 minute'`,
      [t.topic]
    );
    return {
      ...t,
      last_message_at: msgResult.rows[0].max,
      message_count: parseInt(msgResult.rows[0].count),
      messages_per_minute: parseFloat(recentResult.rows[0].count),
    };
  }));
  res.json({ topics: topicsWithStats });
});

router.get('/topics/:topic/metrics', authMiddleware, requireAdminOrViewer, async (req, res) => {
  const { topic } = req.params;
  const { period = '1h' } = req.query;

  const intervals = { '1h': '1 hour', '6h': '6 hours', '24h': '24 hours', '7d': '7 days' };
  // '5 minutes' is not a valid date_trunc unit in PostgreSQL — use epoch bucketing instead
  const bucketSql = {
    '1h':  `date_trunc('minute', created_at)`,
    '6h':  `to_timestamp(floor(extract(epoch from created_at) / 300) * 300)`,
    '24h': `date_trunc('hour', created_at)`,
    '7d':  `date_trunc('day', created_at)`,
  };
  const interval = intervals[period] || '1 hour';
  const bucket = bucketSql[period] || bucketSql['1h'];

  const result = await pool.query(
    `SELECT ${bucket} AS time, COUNT(*) as count
     FROM messages WHERE topic = $1 AND created_at >= NOW() - INTERVAL '${interval}'
     GROUP BY 1 ORDER BY 1`,
    [topic]
  );
  res.json({ topic, period, data: result.rows });
});

router.delete('/topics/:topic/retain', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { topic } = req.params;
  const decodedTopic = decodeURIComponent(topic);
  deleteRetain(decodedTopic);
  await writeAudit({ actor: req.user.username, action: 'topic.retain_delete', targetType: 'topic', targetId: decodedTopic, ip });
  res.json({ success: true });
});

// ─── MESSAGES ────────────────────────────────────────────────────────────────

router.post('/messages/publish', authMiddleware, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { topic, payload, retain = false } = req.body;
  if (!topic || payload === undefined) return res.status(400).json({ error: 'topic ve payload gerekli' });

  const payloadStr = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
  const delivered = await publishFromApi(topic, payloadStr, retain, req.user.username);
  await writeAudit({ actor: req.user.username, action: 'message.publish', targetType: 'topic', targetId: topic, ip });
  res.json({ success: true, delivered_to: delivered });
});

router.get('/messages', authMiddleware, requireAdminOrViewer, async (req, res) => {
  const { topic, limit = 50, offset = 0, from, to, sender, payload_type } = req.query;
  const conditions = [];
  const params = [];
  let idx = 1;

  if (topic) { conditions.push(`topic = $${idx++}`); params.push(topic); }
  if (from) { conditions.push(`created_at >= $${idx++}`); params.push(from); }
  if (to) { conditions.push(`created_at <= $${idx++}`); params.push(to); }
  if (sender) { conditions.push(`sender_username = $${idx++}`); params.push(sender); }
  if (payload_type) { conditions.push(`payload_type = $${idx++}`); params.push(payload_type); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const lim = Math.min(parseInt(limit), 500);

  const result = await pool.query(
    `SELECT * FROM messages ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
    [...params, lim, parseInt(offset)]
  );
  const count = await pool.query(`SELECT COUNT(*) FROM messages ${where}`, params);
  res.json({ messages: result.rows, total: parseInt(count.rows[0].count) });
});

router.delete('/messages', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { topic } = req.query;
  if (topic) {
    await pool.query('DELETE FROM messages WHERE topic = $1', [topic]);
    await writeAudit({ actor: req.user.username, action: 'message.clear', targetType: 'topic', targetId: topic, ip });
  } else {
    await pool.query('DELETE FROM messages');
    await writeAudit({ actor: req.user.username, action: 'message.clear', ip });
  }
  res.json({ success: true });
});

// ─── USERS ───────────────────────────────────────────────────────────────────

router.get('/users', authMiddleware, requireAdminOrViewer, async (req, res) => {
  const result = await pool.query('SELECT id, username, role, created_at, last_seen FROM users ORDER BY created_at');
  const activeClients = getActiveClients();
  const users = result.rows.map(u => ({
    ...u,
    active_connections: activeClients.filter(c => c.username === u.username).length,
  }));
  res.json({ users });
});

router.post('/users', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { username, password, role = 'client' } = req.body;

  if (!username || !password) return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
  if (!['admin', 'viewer', 'client'].includes(role)) return res.status(400).json({ error: 'Geçersiz rol' });

  try {
    const hash = await hashPassword(password);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
      [username, hash, role]
    );
    await writeAudit({ actor: req.user.username, action: 'user.create', targetType: 'user', targetId: username, details: { role }, ip });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Bu kullanıcı adı zaten kullanılıyor' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { id } = req.params;
  const { password, role } = req.body;
  const updates = [];
  const params = [];
  let idx = 1;

  if (password) { updates.push(`password_hash = $${idx++}`); params.push(await hashPassword(password)); }
  if (role) {
    if (!['admin', 'viewer', 'client'].includes(role)) return res.status(400).json({ error: 'Geçersiz rol' });
    updates.push(`role = $${idx++}`);
    params.push(role);
  }

  if (!updates.length) return res.status(400).json({ error: 'Güncellenecek alan belirtilmedi' });

  params.push(id);
  const result = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, role`,
    params
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  await writeAudit({ actor: req.user.username, action: 'user.update', targetType: 'user', targetId: id, details: { role }, ip });
  res.json(result.rows[0]);
});

router.delete('/users/:id', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { id } = req.params;

  const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING username', [id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

  const username = result.rows[0].username;
  // Kick all active connections
  for (const [cid, client] of clients.entries()) {
    if (client.username === username) kickClient(cid);
  }

  await writeAudit({ actor: req.user.username, action: 'user.delete', targetType: 'user', targetId: username, ip });
  res.json({ success: true });
});

// ─── ACL ─────────────────────────────────────────────────────────────────────

router.get('/acl', authMiddleware, requireAdminOrViewer, async (req, res) => {
  const result = await pool.query('SELECT * FROM acl_rules ORDER BY priority DESC');
  res.json({ rules: result.rows });
});

router.post('/acl', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { username, topic_pattern, action, permission, priority = 0 } = req.body;

  if (!topic_pattern || !action || !permission) return res.status(400).json({ error: 'Zorunlu alanlar eksik' });
  if (!['publish', 'subscribe', 'both'].includes(action)) return res.status(400).json({ error: 'Geçersiz action' });
  if (!['allow', 'deny'].includes(permission)) return res.status(400).json({ error: 'Geçersiz permission' });

  const result = await pool.query(
    `INSERT INTO acl_rules (username, topic_pattern, action, permission, priority)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [username || null, topic_pattern, action, permission, priority]
  );
  await loadAclCache();
  await writeAudit({ actor: req.user.username, action: 'acl.create', targetType: 'acl', targetId: result.rows[0].id, ip });
  res.status(201).json(result.rows[0]);
});

router.put('/acl/:id', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { id } = req.params;
  const { username, topic_pattern, action, permission, priority } = req.body;

  const result = await pool.query(
    `UPDATE acl_rules SET username = $1, topic_pattern = $2, action = $3, permission = $4, priority = $5
     WHERE id = $6 RETURNING *`,
    [username || null, topic_pattern, action, permission, priority, id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Kural bulunamadı' });
  await loadAclCache();
  await writeAudit({ actor: req.user.username, action: 'acl.update', targetType: 'acl', targetId: id, ip });
  res.json(result.rows[0]);
});

router.delete('/acl/:id', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { id } = req.params;
  const result = await pool.query('DELETE FROM acl_rules WHERE id = $1 RETURNING id', [id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Kural bulunamadı' });
  await loadAclCache();
  await writeAudit({ actor: req.user.username, action: 'acl.delete', targetType: 'acl', targetId: id, ip });
  res.json({ success: true });
});

router.post('/acl/test', authMiddleware, requireAdminOrViewer, (req, res) => {
  const { username, topic, action } = req.body;
  if (!username || !topic || !action) return res.status(400).json({ error: 'username, topic ve action gerekli' });
  const result = testAcl(username, topic, action);
  res.json(result);
});

// ─── WEBHOOKS ────────────────────────────────────────────────────────────────

router.get('/webhooks', authMiddleware, requireAdminOrViewer, async (req, res) => {
  const result = await pool.query('SELECT * FROM webhooks ORDER BY created_at DESC');
  res.json({ webhooks: result.rows });
});

router.post('/webhooks', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { name, topic_pattern, url, method = 'POST', headers = {}, secret,
          retry_count = 3, timeout_ms = 5000, trigger_on = 'message', delay_seconds = 0,
          body_template, url_template, header_templates } = req.body;

  if (!name || !url) return res.status(400).json({ error: 'name ve url gerekli' });
  if (!['message', 'client_connect', 'client_disconnect'].includes(trigger_on))
    return res.status(400).json({ error: 'Geçersiz trigger_on değeri' });
  if (trigger_on === 'message' && !topic_pattern)
    return res.status(400).json({ error: 'message tipinde topic_pattern gerekli' });

  const result = await pool.query(
    `INSERT INTO webhooks (name, topic_pattern, url, method, headers, secret, retry_count, timeout_ms,
     trigger_on, delay_seconds, body_template, url_template, header_templates)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [name, topic_pattern || null, url, method, JSON.stringify(headers), secret || null,
     retry_count, timeout_ms, trigger_on, delay_seconds,
     body_template || null, url_template || null, JSON.stringify(header_templates || {})]
  );
  await loadWebhookCache();
  await writeAudit({ actor: req.user.username, action: 'webhook.create', targetType: 'webhook', targetId: result.rows[0].id, ip });
  res.status(201).json(result.rows[0]);
});

router.put('/webhooks/:id', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { id } = req.params;
  const { name, topic_pattern, url, method, headers, secret, retry_count, timeout_ms,
          trigger_on = 'message', delay_seconds = 0,
          body_template, url_template, header_templates } = req.body;

  const result = await pool.query(
    `UPDATE webhooks SET name=$1, topic_pattern=$2, url=$3, method=$4, headers=$5, secret=$6,
     retry_count=$7, timeout_ms=$8, trigger_on=$9, delay_seconds=$10,
     body_template=$11, url_template=$12, header_templates=$13 WHERE id=$14 RETURNING *`,
    [name, topic_pattern || null, url, method, JSON.stringify(headers || {}), secret || null,
     retry_count, timeout_ms, trigger_on, delay_seconds,
     body_template || null, url_template || null, JSON.stringify(header_templates || {}), id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Webhook bulunamadı' });
  await loadWebhookCache();
  await writeAudit({ actor: req.user.username, action: 'webhook.update', targetType: 'webhook', targetId: id, ip });
  res.json(result.rows[0]);
});

router.delete('/webhooks/:id', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { id } = req.params;
  const result = await pool.query('DELETE FROM webhooks WHERE id = $1 RETURNING id', [id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Webhook bulunamadı' });
  await loadWebhookCache();
  await writeAudit({ actor: req.user.username, action: 'webhook.delete', targetType: 'webhook', targetId: id, ip });
  res.json({ success: true });
});

router.patch('/webhooks/:id/toggle', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { id } = req.params;
  const result = await pool.query(
    'UPDATE webhooks SET active = NOT active WHERE id = $1 RETURNING id, active',
    [id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Webhook bulunamadı' });
  await loadWebhookCache();
  await writeAudit({ actor: req.user.username, action: 'webhook.toggle', targetType: 'webhook', targetId: id, details: { active: result.rows[0].active }, ip });
  res.json(result.rows[0]);
});

router.get('/webhooks/:id/logs', authMiddleware, requireAdminOrViewer, async (req, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;
  const result = await pool.query(
    'SELECT * FROM webhook_logs WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT $2',
    [id, parseInt(limit)]
  );
  res.json({ logs: result.rows });
});

router.post('/webhooks/:id/test', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const wh = await pool.query('SELECT * FROM webhooks WHERE id = $1', [id]);
  if (!wh.rows.length) return res.status(404).json({ error: 'Webhook bulunamadı' });

  const axios = require('axios');
  const crypto = require('crypto');

  const webhook = wh.rows[0];
  const body = {
    topic: webhook.topic_pattern,
    payload: 'test',
    payload_type: 'string',
    sender_username: req.user.username,
    sender_client_id: null,
    timestamp: new Date().toISOString(),
  };

  const headers = { 'Content-Type': 'application/json', ...(webhook.headers || {}) };
  if (webhook.secret) {
    const sig = crypto.createHmac('sha256', webhook.secret).update(JSON.stringify(body)).digest('hex');
    headers['X-Broker-Signature'] = `sha256=${sig}`;
  }

  const start = Date.now();
  try {
    const r = await axios({ method: webhook.method, url: webhook.url, data: body, headers, timeout: webhook.timeout_ms });
    res.json({ success: true, status_code: r.status, duration_ms: Date.now() - start });
  } catch (err) {
    res.json({ success: false, status_code: err.response?.status || 0, error: err.message, duration_ms: Date.now() - start });
  }
});

// ─── AUDIT ───────────────────────────────────────────────────────────────────

router.get('/audit', authMiddleware, requireAdminOrViewer, async (req, res) => {
  const { limit = 50, offset = 0, actor, action, from, to } = req.query;
  const conditions = [];
  const params = [];
  let idx = 1;

  if (actor) { conditions.push(`actor_username = $${idx++}`); params.push(actor); }
  if (action) { conditions.push(`action = $${idx++}`); params.push(action); }
  if (from) { conditions.push(`created_at >= $${idx++}`); params.push(from); }
  if (to) { conditions.push(`created_at <= $${idx++}`); params.push(to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
    [...params, parseInt(limit), parseInt(offset)]
  );
  const count = await pool.query(`SELECT COUNT(*) FROM audit_logs ${where}`, params);
  res.json({ logs: result.rows, total: parseInt(count.rows[0].count) });
});

// ─── STATS ───────────────────────────────────────────────────────────────────

router.get('/stats', authMiddleware, requireAdminOrViewer, async (req, res) => {
  const [todayCount, totalCount, dbSize] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM messages WHERE created_at >= NOW() - INTERVAL '1 day'`),
    pool.query('SELECT COUNT(*) FROM messages'),
    pool.query(`SELECT pg_database_size(current_database()) as size`),
  ]);

  const recentResult = await pool.query(
    `SELECT COUNT(*) FROM messages WHERE created_at >= NOW() - INTERVAL '1 minute'`
  );

  const sessionsCount = await pool.query(`SELECT COUNT(*) FROM client_sessions`);
  const activeWebhooks = await pool.query(`SELECT COUNT(*) FROM webhooks WHERE active = TRUE`);

  res.json({
    uptime_seconds: Math.floor((Date.now() - startTime()) / 1000),
    total_clients_ever: parseInt(sessionsCount.rows[0].count),
    active_clients: clients.size,
    total_messages_today: parseInt(todayCount.rows[0].count),
    total_messages_all: parseInt(totalCount.rows[0].count),
    messages_per_minute: parseInt(recentResult.rows[0].count),
    active_topics: subscriptions.size,
    broker_version: '1.0.0',
    db_size_mb: parseFloat((parseInt(dbSize.rows[0].size) / 1024 / 1024).toFixed(2)),
    active_webhooks: parseInt(activeWebhooks.rows[0].count),
    alarms: [],
  });
});

router.get('/stats/timeseries', authMiddleware, requireAdminOrViewer, async (req, res) => {
  const { period = '1h' } = req.query;
  const intervals = { '1h': '1 hour', '6h': '6 hours', '24h': '24 hours', '7d': '7 days' };
  const bucketSql = {
    '1h':  `date_trunc('minute', created_at)`,
    '6h':  `to_timestamp(floor(extract(epoch from created_at) / 300) * 300)`,
    '24h': `date_trunc('hour', created_at)`,
    '7d':  `date_trunc('day', created_at)`,
  };
  const interval = intervals[period] || '1 hour';
  const bucket = bucketSql[period] || bucketSql['1h'];

  const result = await pool.query(
    `SELECT ${bucket} AS time, COUNT(*) as count
     FROM messages WHERE created_at >= NOW() - INTERVAL '${interval}'
     GROUP BY 1 ORDER BY 1`
  );
  res.json({ period, data: result.rows });
});

// ─── SETTINGS ────────────────────────────────────────────────────────────────

router.get('/settings', authMiddleware, requireAdminOrViewer, async (req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

router.patch('/settings', authMiddleware, requireAdmin, async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const allowed = [
    'max_messages_stored', 'ws_ping_interval', 'ws_ping_timeout',
    'max_connections_per_user', 'max_payload_size_kb',
    'rate_limit_messages_per_second', 'ip_blacklist', 'ip_whitelist', 'ip_whitelist_enabled',
  ];

  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const val = Array.isArray(req.body[key]) ? JSON.stringify(req.body[key]) : String(req.body[key]);
      await setSetting(key, val, req.user.username);
      updates[key] = val;
    }
  }

  await writeAudit({ actor: req.user.username, action: 'settings.update', details: updates, ip });
  res.json({ success: true, updated: updates });
});

module.exports = router;

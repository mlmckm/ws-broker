const { v4: uuidv4 } = require('uuid');
const { pool, getSetting } = require('./db');
const { verifyPassword, signToken } = require('./auth');
const { checkAcl, topicMatchesPattern } = require('./acl');
const { triggerWebhooks, triggerEventWebhooks } = require('./webhook');

// clientId -> { ws, username, role, clientId, connectedAt, ip, userAgent, subscriptions, messageCount, bytesSent, bytesReceived, authenticated, pingTimer, sessionId, rateLimitTokens, rateLimitLast }
const clients = new Map();

// topic -> Set of clientIds
const subscriptions = new Map();

// topic -> last message (retain)
const retainedMessages = new Map();

// username -> count of active connections
const userConnectionCount = new Map();

// rate limit per user: username -> { count, resetAt }
const rateLimitMap = new Map();

let pingInterval = null;
let sysInterval = null;
let startTime = Date.now();

function log(msg) {
  console.log(`[${new Date().toISOString()}] [BROKER] ${msg}`);
}

function send(ws, obj) {
  try {
    const data = JSON.stringify(obj);
    ws.send(data);
    const client = getClientByWs(ws);
    if (client) client.bytesSent += Buffer.byteLength(data);
  } catch {}
}

function getClientByWs(ws) {
  for (const c of clients.values()) {
    if (c.ws === ws) return c;
  }
  return null;
}

function isTopicReserved(topic) {
  return topic.startsWith('$SYS');
}

function validateTopic(topic) {
  if (!topic || typeof topic !== 'string') return false;
  if (topic.length > 500) return false;
  const parts = topic.split('/');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '#' && i !== parts.length - 1) return false;
  }
  return true;
}

async function handleConnection(ws, req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  const clientId = uuidv4();

  // IP blacklist / whitelist check
  try {
    const blacklistRaw = await getSetting('ip_blacklist');
    const blacklist = JSON.parse(blacklistRaw || '[]');
    if (blacklist.includes(ip)) {
      send(ws, { type: 'ip_blocked', message: 'IP adresiniz engellenmiştir' });
      ws.close();
      return;
    }

    const whitelistEnabled = await getSetting('ip_whitelist_enabled');
    if (whitelistEnabled === 'true') {
      const whitelist = JSON.parse(await getSetting('ip_whitelist') || '[]');
      if (!ipInList(ip, whitelist)) {
        send(ws, { type: 'ip_blocked', message: 'IP adresiniz whitelist\'te değil' });
        ws.close();
        return;
      }
    }
  } catch {}

  const client = {
    ws,
    clientId,
    username: null,
    role: null,
    connectedAt: new Date(),
    ip,
    userAgent,
    subscriptions: new Set(),
    messageCount: 0,
    bytesSent: 0,
    bytesReceived: 0,
    authenticated: false,
    sessionId: null,
    pingTimer: null,
  };

  clients.set(clientId, client);

  // ── URL query param auth (opsiyonel, Postman kolaylığı için) ────────────────
  // wss://broker.myensim.com/ws?username=admin&password=xxx
  try {
    const url = new URL(req.url, 'http://localhost');
    const qUser = url.searchParams.get('username');
    const qPass = url.searchParams.get('password');
    if (qUser && qPass) {
      // Kimlik doğrulamayı hemen yap, hello+auth adımlarını atlat
      await handleAuth(client, { username: qUser, password: qPass });
      // Auth başarısıysa hello'yu göndermiyoruz (zaten auth_ok gönderildi)
      if (!client.authenticated) return; // auth_error gönderildi ve ws kapandı
      log(`Query-param auth: ${qUser} (${clientId})`);
    } else {
      send(ws, { type: 'hello', client_id: clientId });
    }
  } catch {
    send(ws, { type: 'hello', client_id: clientId });
  }

  log(`Client connected: ${clientId} from ${ip}`);

  ws.on('message', async (rawData) => {
    try {
      const data = rawData.toString();
      client.bytesReceived += Buffer.byteLength(data);
      const msg = JSON.parse(data);
      await handleMessage(client, msg);
    } catch (err) {
      send(ws, { type: 'error', code: 'INVALID_JSON', message: 'Geçersiz JSON' });
    }
  });

  ws.on('close', () => handleDisconnect(client));
  ws.on('error', (err) => {
    log(`WS error for ${clientId}: ${err.message}`);
    handleDisconnect(client);
  });
}

async function handleMessage(client, msg) {
  if (!msg.type) {
    send(client.ws, { type: 'error', code: 'NO_TYPE', message: 'Mesaj tipi belirtilmemiş' });
    return;
  }

  if (!client.authenticated && msg.type !== 'auth') {
    send(client.ws, { type: 'error', code: 'UNAUTHORIZED', message: 'Önce kimlik doğrulaması yapın' });
    return;
  }

  switch (msg.type) {
    case 'auth': return handleAuth(client, msg);
    case 'subscribe': return handleSubscribe(client, msg);
    case 'unsubscribe': return handleUnsubscribe(client, msg);
    case 'publish': return handlePublish(client, msg);
    case 'pong': return; // reset ping timer handled elsewhere
    default:
      send(client.ws, { type: 'error', code: 'UNKNOWN_TYPE', message: `Bilinmeyen mesaj tipi: ${msg.type}` });
  }
}

async function handleAuth(client, msg) {
  if (client.authenticated) {
    send(client.ws, { type: 'error', code: 'ALREADY_AUTHENTICATED', message: 'Zaten kimlik doğrulaması yapıldı' });
    return;
  }

  const { username, password } = msg;
  if (!username || !password) {
    send(client.ws, { type: 'auth_error', message: 'Kullanıcı adı ve şifre gerekli' });
    client.ws.close();
    return;
  }

  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = result.rows[0];

  if (!user) {
    send(client.ws, { type: 'auth_error', message: 'Geçersiz kullanıcı adı veya şifre' });
    client.ws.close();
    return;
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    send(client.ws, { type: 'auth_error', message: 'Geçersiz kullanıcı adı veya şifre' });
    client.ws.close();
    return;
  }

  // Check max connections per user
  const maxConns = parseInt(await getSetting('max_connections_per_user') || '10');
  const currentConns = userConnectionCount.get(username) || 0;
  if (currentConns >= maxConns) {
    send(client.ws, { type: 'auth_error', message: 'Maksimum bağlantı sayısına ulaşıldı' });
    client.ws.close();
    return;
  }

  client.username = username;
  client.role = user.role;
  client.authenticated = true;
  userConnectionCount.set(username, (userConnectionCount.get(username) || 0) + 1);

  // Store session
  const sessionResult = await pool.query(
    `INSERT INTO client_sessions (client_id, username, ip_address, user_agent)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [client.clientId, username, client.ip, client.userAgent]
  );
  client.sessionId = sessionResult.rows[0].id;

  // Update last_seen
  await pool.query('UPDATE users SET last_seen = NOW() WHERE username = $1', [username]);

  const token = signToken({ username, role: user.role, clientId: client.clientId });
  send(client.ws, { type: 'auth_ok', token, username, role: user.role });
  log(`Auth OK: ${username} (${client.clientId})`);

  // Start ping
  startPing(client);

  const connectedPayload = {
    client_id: client.clientId,
    username,
    ip: client.ip,
    connected_at: new Date().toISOString(),
  };

  // Notify dashboard
  publishSys('$SYS/clients/connected', connectedPayload);

  // Trigger connect webhooks
  triggerEventWebhooks('client_connect', connectedPayload).catch(() => {});
}

async function startPing(client) {
  // Read from settings — allows runtime tuning without restart
  const intervalMs = parseInt(await getSetting('ws_ping_interval') || '30000');
  const timeoutMs  = parseInt(await getSetting('ws_ping_timeout')  || '60000');
  const PING_INTERVAL = intervalMs;
  const PONG_TIMEOUT  = timeoutMs;

  // Track active pong timer to cancel it on disconnect/reconnect
  let pongTimer = null;
  let pongHandler = null;

  const cleanupPongHandler = () => {
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
    if (pongHandler) { client.ws.off('message', pongHandler); pongHandler = null; }
  };

  const sendPing = () => {
    if (client.ws.readyState !== 1) return;

    // Remove any previous pong handler before attaching a new one
    cleanupPongHandler();

    send(client.ws, { type: 'ping', timestamp: Date.now() });

    pongTimer = setTimeout(() => {
      log(`Ping timeout: ${client.clientId}`);
      pongHandler = null;
      client.ws.close();
    }, PONG_TIMEOUT);

    pongHandler = (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());
        if (msg.type === 'pong') {
          cleanupPongHandler();
        }
      } catch {}
    };

    client.ws.on('message', pongHandler);
  };

  client.pingTimer = setInterval(sendPing, PING_INTERVAL);
  // Expose cleanup so handleDisconnect can remove the pong listener
  client.cleanupPing = () => { clearInterval(client.pingTimer); cleanupPongHandler(); };
}

async function handleSubscribe(client, msg) {
  const { topic } = msg;
  if (!validateTopic(topic)) {
    send(client.ws, { type: 'error', code: 'INVALID_TOPIC', message: 'Geçersiz topic' });
    return;
  }

  if (!checkAcl(client.username, topic, 'subscribe')) {
    send(client.ws, { type: 'error', code: 'ACL_DENIED', message: 'Bu topic\'e abone olma izniniz yok' });
    return;
  }

  client.subscriptions.add(topic);
  if (!subscriptions.has(topic)) subscriptions.set(topic, new Set());
  subscriptions.get(topic).add(client.clientId);

  send(client.ws, { type: 'subscribed', topic });

  // Send retained message if exists
  if (retainedMessages.has(topic)) {
    send(client.ws, { type: 'message', ...retainedMessages.get(topic) });
  }
  // Also check wildcard retained
  for (const [retTopic, retMsg] of retainedMessages.entries()) {
    if (retTopic !== topic && topicMatchesPattern(retTopic, topic)) {
      send(client.ws, { type: 'message', ...retMsg });
    }
  }
}

async function handleUnsubscribe(client, msg) {
  const { topic } = msg;
  client.subscriptions.delete(topic);
  subscriptions.get(topic)?.delete(client.clientId);
  send(client.ws, { type: 'unsubscribed', topic });
}

async function handlePublish(client, msg) {
  const { topic, payload, retain = false } = msg;

  if (!validateTopic(topic)) {
    send(client.ws, { type: 'error', code: 'INVALID_TOPIC', message: 'Geçersiz topic' });
    return;
  }

  if (isTopicReserved(topic)) {
    send(client.ws, { type: 'error', code: 'RESERVED_TOPIC', message: '$SYS topic\'leri reserved' });
    return;
  }

  if (!checkAcl(client.username, topic, 'publish')) {
    send(client.ws, { type: 'error', code: 'ACL_DENIED', message: 'Bu topic\'e yayın yapma izniniz yok' });
    return;
  }

  // Rate limit check
  const maxRate = parseInt(await getSetting('rate_limit_messages_per_second') || '100');
  if (!checkRateLimit(client.username, maxRate)) {
    send(client.ws, { type: 'error', code: 'RATE_LIMITED', message: 'Mesaj gönderme limiti aşıldı' });
    return;
  }

  // Payload size check
  const maxSizeKb = parseInt(await getSetting('max_payload_size_kb') || '256');
  const payloadStr = typeof payload === 'object' ? JSON.stringify(payload) : String(payload || '');
  if (Buffer.byteLength(payloadStr) > maxSizeKb * 1024) {
    send(client.ws, { type: 'error', code: 'PAYLOAD_TOO_LARGE', message: 'Payload boyutu limitini aştı' });
    return;
  }

  let payloadType = 'string';
  try {
    if (typeof payload === 'object') payloadType = 'json';
    else { JSON.parse(payloadStr); payloadType = 'json'; }
  } catch {}

  const payloadSize = Buffer.byteLength(payloadStr);
  const messageData = {
    topic,
    payload: payloadStr,
    payload_type: payloadType,
    payload_size: payloadSize,
    sender_username: client.username,
    sender_client_id: client.clientId,
    timestamp: new Date().toISOString(),
  };

  client.messageCount++;

  if (retain) retainedMessages.set(topic, messageData);

  // Deliver to subscribers
  deliverMessage(topic, messageData);

  // Persist
  persistMessage(messageData).catch(() => {});

  // Webhooks
  triggerWebhooks(topic, payloadStr, payloadType, client.username, client.clientId).catch(() => {});

  // Notify dashboard
  publishSys('$SYS/messages/new', {
    topic,
    payload: payloadStr.substring(0, 200),
    sender: client.username,
    size: payloadSize,
  });
}

function deliverMessage(topic, messageData) {
  let deliveredCount = 0;
  for (const [subTopic, clientIds] of subscriptions.entries()) {
    if (topic === subTopic || topicMatchesPattern(topic, subTopic)) {
      for (const clientId of clientIds) {
        const c = clients.get(clientId);
        if (c && c.ws.readyState === 1) {
          send(c.ws, { type: 'message', ...messageData });
          deliveredCount++;
        }
      }
    }
  }
  return deliveredCount;
}

async function persistMessage(messageData) {
  const maxStored = parseInt(await getSetting('max_messages_stored') || '10000');

  await pool.query(
    `INSERT INTO messages (topic, payload, payload_type, payload_size, sender_username, sender_client_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [messageData.topic, messageData.payload, messageData.payload_type, messageData.payload_size,
     messageData.sender_username, messageData.sender_client_id]
  );

  // Prune old messages
  await pool.query(
    `DELETE FROM messages WHERE id IN (
       SELECT id FROM messages ORDER BY created_at DESC OFFSET $1
     )`,
    [maxStored]
  );
}

function checkRateLimit(username, maxPerSecond) {
  const now = Date.now();
  const entry = rateLimitMap.get(username) || { count: 0, resetAt: now + 1000 };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 1000;
  }

  entry.count++;
  rateLimitMap.set(username, entry);

  return entry.count <= maxPerSecond;
}

function handleDisconnect(client) {
  if (!client.clientId || !clients.has(client.clientId)) return;

  clients.delete(client.clientId);
  if (client.cleanupPing) client.cleanupPing(); else clearInterval(client.pingTimer);

  for (const topic of client.subscriptions) {
    subscriptions.get(topic)?.delete(client.clientId);
  }

  if (client.username) {
    const count = (userConnectionCount.get(client.username) || 1) - 1;
    if (count <= 0) userConnectionCount.delete(client.username);
    else userConnectionCount.set(client.username, count);
  }

  if (client.sessionId) {
    pool.query('UPDATE client_sessions SET disconnected_at = NOW() WHERE id = $1', [client.sessionId]).catch(() => {});
  }

  if (client.authenticated) {
    const disconnectedPayload = {
      client_id: client.clientId,
      username: client.username,
      connected_at: client.connectedAt?.toISOString?.() || null,
      disconnected_at: new Date().toISOString(),
    };

    publishSys('$SYS/clients/disconnected', disconnectedPayload);

    // Trigger disconnect webhooks (supports delay_seconds)
    triggerEventWebhooks('client_disconnect', disconnectedPayload).catch(() => {});
  }

  log(`Client disconnected: ${client.clientId} (${client.username || 'unauthenticated'})`);
}

function publishSys(topic, payload) {
  const messageData = {
    topic,
    payload: JSON.stringify(payload),
    payload_type: 'json',
    payload_size: JSON.stringify(payload).length,
    sender_username: '$SYS',
    sender_client_id: null,
    timestamp: new Date().toISOString(),
  };
  deliverMessage(topic, messageData);
}

function startSysBroadcast() {
  sysInterval = setInterval(async () => {
    try {
      const countResult = await pool.query(`SELECT COUNT(*) FROM messages WHERE created_at >= NOW() - INTERVAL '1 day'`);
      const totalResult = await pool.query(`SELECT COUNT(*) FROM messages`);
      publishSys('$SYS/stats', {
        active_clients: clients.size,
        messages_today: parseInt(countResult.rows[0].count),
        total_messages: parseInt(totalResult.rows[0].count),
        active_topics: subscriptions.size,
        uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
        alarms: [],
      });
    } catch {}
  }, 5000);
}

async function publishFromApi(topic, payloadStr, retain, actorUsername) {
  let payloadType = 'string';
  try { JSON.parse(payloadStr); payloadType = 'json'; } catch {}

  const payloadSize = Buffer.byteLength(payloadStr);
  const messageData = {
    topic,
    payload: payloadStr,
    payload_type: payloadType,
    payload_size: payloadSize,
    sender_username: actorUsername || 'api',
    sender_client_id: null,
    timestamp: new Date().toISOString(),
  };

  if (retain) retainedMessages.set(topic, messageData);

  const count = deliverMessage(topic, messageData);
  await persistMessage(messageData);
  triggerWebhooks(topic, payloadStr, payloadType, actorUsername || 'api', null).catch(() => {});
  publishSys('$SYS/messages/new', { topic, payload: payloadStr.substring(0, 200), sender: actorUsername, size: payloadSize });

  return count;
}

function kickClient(clientId) {
  const client = clients.get(clientId);
  if (!client) return false;
  send(client.ws, { type: 'error', code: 'KICKED', message: 'Bağlantınız yönetici tarafından sonlandırıldı' });
  client.ws.close();
  return true;
}

function getActiveClients() {
  return Array.from(clients.values())
    .filter(c => c.authenticated)
    .map(c => ({
      client_id: c.clientId,
      username: c.username,
      role: c.role,
      connected_at: c.connectedAt,
      ip_address: c.ip,
      user_agent: c.userAgent,
      subscriptions: Array.from(c.subscriptions),
      message_count: c.messageCount,
      bytes_sent: c.bytesSent,
      bytes_received: c.bytesReceived,
    }));
}

function getActiveTopics() {
  const topics = [];
  for (const [topic, clientIds] of subscriptions.entries()) {
    if (clientIds.size > 0) {
      topics.push({
        topic,
        subscribers: clientIds.size,
        retained: retainedMessages.has(topic),
      });
    }
  }
  return topics;
}

function deleteRetain(topic) {
  return retainedMessages.delete(topic);
}

function ipInList(ip, list) {
  for (const entry of list) {
    if (entry === ip) return true;
    if (entry.includes('/')) {
      if (ipInCidr(ip, entry)) return true;
    }
  }
  return false;
}

function ipInCidr(ip, cidr) {
  try {
    const [range, bitsStr] = cidr.split('/');
    const bits = parseInt(bitsStr);
    // Use >>> 0 to force unsigned 32-bit integer — prevents sign errors for IPs >= 128.x.x.x
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    const ipInt = ip.split('.').reduce((acc, oct) => ((acc << 8) >>> 0) + parseInt(oct), 0) >>> 0;
    const rangeInt = range.split('.').reduce((acc, oct) => ((acc << 8) >>> 0) + parseInt(oct), 0) >>> 0;
    return (ipInt & mask) === (rangeInt & mask);
  } catch {
    return false;
  }
}

async function gracefulShutdown() {
  log('Graceful shutdown initiated');
  clearInterval(pingInterval);
  clearInterval(sysInterval);

  for (const client of clients.values()) {
    if (client.cleanupPing) client.cleanupPing();
    send(client.ws, { type: 'server_shutdown', message: 'Sunucu kapanıyor' });
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  for (const client of clients.values()) {
    client.ws.close();
  }
}

module.exports = {
  handleConnection,
  publishFromApi,
  kickClient,
  getActiveClients,
  getActiveTopics,
  deleteRetain,
  startSysBroadcast,
  gracefulShutdown,
  clients,
  subscriptions,
  retainedMessages,
  startTime: () => startTime,
};

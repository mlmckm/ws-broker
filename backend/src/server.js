require('dotenv').config();
require('express-async-errors');
const http = require('http');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const { migrate } = require('./db');
const { loadAclCache } = require('./acl');
const { loadWebhookCache } = require('./webhook');
const { handleConnection, startSysBroadcast, gracefulShutdown } = require('./broker');
const apiRouter = require('./api');

const PORT = process.env.PORT || 8883;
const app = express();

// ── Güvenlik başlıkları ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      fontSrc:    ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Same-origin veya origin yoksa (mobil, curl) izin ver
    if (!origin) return cb(null, true);
    // Eğer ALLOWED_ORIGINS tanımlandıysa kısıtla, yoksa herkese izin ver
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error('CORS: Bu origin izinli değil'));
  },
  credentials: true,
}));

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// API routes
app.use('/api', apiRouter);

// Serve React frontend
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Global error handler — must be last middleware
// express-async-errors routes uncaught async errors here
app.use((err, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] [API ERROR] ${req.method} ${req.path}:`, err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', handleConnection);

async function start() {
  try {
    await migrate();
    await loadAclCache();
    await loadWebhookCache();
    startSysBroadcast();

    server.listen(PORT, () => {
      console.log(`[${new Date().toISOString()}] [SERVER] WS Broker running on port ${PORT}`);
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [SERVER] Startup error:`, err);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log(`[${new Date().toISOString()}] [SERVER] SIGTERM received`);
  await gracefulShutdown();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log(`[${new Date().toISOString()}] [SERVER] SIGINT received`);
  await gracefulShutdown();
  server.close(() => process.exit(0));
});

process.on('uncaughtException', (err) => {
  console.error(`[${new Date().toISOString()}] [SERVER] Uncaught exception:`, err);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[${new Date().toISOString()}] [SERVER] Unhandled rejection:`, reason);
});

start();

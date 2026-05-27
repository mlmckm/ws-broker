require('dotenv').config();
require('express-async-errors'); // Must be required before express routes — patches Express 4 async error handling
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const { migrate } = require('./db');
const { loadAclCache } = require('./acl');
const { loadWebhookCache } = require('./webhook');
const { handleConnection, startSysBroadcast, gracefulShutdown } = require('./broker');
const apiRouter = require('./api');

const PORT = process.env.PORT || 8883;
const app = express();

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

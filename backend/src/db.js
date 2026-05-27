const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'client',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_seen TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        topic VARCHAR(500) NOT NULL,
        payload TEXT NOT NULL,
        payload_type VARCHAR(10) DEFAULT 'string',
        payload_size INTEGER,
        sender_username VARCHAR(100),
        sender_client_id VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_username);

      CREATE TABLE IF NOT EXISTS client_sessions (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(100) NOT NULL,
        username VARCHAR(100) NOT NULL,
        connected_at TIMESTAMPTZ DEFAULT NOW(),
        disconnected_at TIMESTAMPTZ,
        ip_address VARCHAR(45),
        user_agent TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_username ON client_sessions(username);
      CREATE INDEX IF NOT EXISTS idx_sessions_connected_at ON client_sessions(connected_at DESC);

      CREATE TABLE IF NOT EXISTS acl_rules (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100),
        topic_pattern VARCHAR(500) NOT NULL,
        action VARCHAR(10) NOT NULL,
        permission VARCHAR(10) NOT NULL,
        priority INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_acl_username ON acl_rules(username);

      CREATE TABLE IF NOT EXISTS webhooks (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        topic_pattern VARCHAR(500) NOT NULL,
        url TEXT NOT NULL,
        method VARCHAR(10) DEFAULT 'POST',
        headers JSONB DEFAULT '{}',
        secret VARCHAR(200),
        active BOOLEAN DEFAULT TRUE,
        retry_count INTEGER DEFAULT 3,
        timeout_ms INTEGER DEFAULT 5000,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_triggered_at TIMESTAMPTZ,
        last_status_code INTEGER,
        total_triggers INTEGER DEFAULT 0,
        failed_triggers INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS webhook_logs (
        id SERIAL PRIMARY KEY,
        webhook_id INTEGER REFERENCES webhooks(id) ON DELETE CASCADE,
        topic VARCHAR(500),
        payload TEXT,
        status_code INTEGER,
        response_body TEXT,
        duration_ms INTEGER,
        success BOOLEAN,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook_id ON webhook_logs(webhook_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        actor_username VARCHAR(100),
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(50),
        target_id VARCHAR(100),
        details JSONB,
        ip_address VARCHAR(45),
        result VARCHAR(10) DEFAULT 'success',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_username);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by VARCHAR(100)
      );
    `);

    await client.query(`
      INSERT INTO settings (key, value) VALUES
        ('max_messages_stored', '10000'),
        ('ws_ping_interval', '30000'),
        ('ws_ping_timeout', '10000'),
        ('max_connections_per_user', '10'),
        ('max_payload_size_kb', '256'),
        ('rate_limit_messages_per_second', '100'),
        ('ip_blacklist', '[]'),
        ('ip_whitelist', '[]'),
        ('ip_whitelist_enabled', 'false')
      ON CONFLICT (key) DO NOTHING;
    `);

    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = await bcrypt.hash(adminPassword, 10);
    await client.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ('admin', $1, 'admin')
       ON CONFLICT (username) DO NOTHING`,
      [hash]
    );

    console.log(`[${new Date().toISOString()}] [DB] Migration complete`);
  } finally {
    client.release();
  }
}

async function getSettings() {
  const result = await pool.query('SELECT key, value FROM settings');
  const settings = {};
  result.rows.forEach(r => { settings[r.key] = r.value; });
  return settings;
}

async function getSetting(key) {
  const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return result.rows[0]?.value;
}

async function setSetting(key, value, updatedBy = 'system') {
  await pool.query(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW(), updated_by = $3`,
    [key, value, updatedBy]
  );
}

module.exports = { pool, migrate, getSettings, getSetting, setSetting };

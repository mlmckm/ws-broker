const { pool } = require('./db');

async function writeAudit({ actor, action, targetType, targetId, details, ip, result = 'success' }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_username, action, target_type, target_id, details, ip_address, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [actor, action, targetType, targetId ? String(targetId) : null, details ? JSON.stringify(details) : null, ip, result]
    );
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [AUDIT] Write error:`, err.message);
  }
}

module.exports = { writeAudit };

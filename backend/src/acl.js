const { pool } = require('./db');

let aclCache = [];

async function loadAclCache() {
  const result = await pool.query('SELECT * FROM acl_rules ORDER BY priority DESC');
  aclCache = result.rows;
  console.log(`[${new Date().toISOString()}] [ACL] Loaded ${aclCache.length} rules into cache`);
}

function topicMatchesPattern(topic, pattern) {
  if (pattern === '#') return true;
  const topicParts = topic.split('/');
  const patternParts = pattern.split('/');

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '#') return true;
    if (patternParts[i] === '+') continue;
    if (patternParts[i] !== topicParts[i]) return false;
  }
  return topicParts.length === patternParts.length;
}

function checkAcl(username, topic, action) {
  if (aclCache.length === 0) return true;

  const applicable = aclCache.filter(rule => {
    const usernameMatch = rule.username === null || rule.username === username;
    const topicMatch = topicMatchesPattern(topic, rule.topic_pattern);
    const actionMatch = rule.action === 'both' || rule.action === action;
    return usernameMatch && topicMatch && actionMatch;
  });

  if (applicable.length === 0) return true;
  return applicable[0].permission === 'allow';
}

function testAcl(username, topic, action) {
  const applicable = aclCache.filter(rule => {
    const usernameMatch = rule.username === null || rule.username === username;
    const topicMatch = topicMatchesPattern(topic, rule.topic_pattern);
    const actionMatch = rule.action === 'both' || rule.action === action;
    return usernameMatch && topicMatch && actionMatch;
  });

  if (applicable.length === 0) {
    return { allowed: true, reason: 'Kural bulunamadı, varsayılan: izin ver' };
  }

  const rule = applicable[0];
  return {
    allowed: rule.permission === 'allow',
    reason: `Kural ID ${rule.id}: priority=${rule.priority}, permission=${rule.permission}`,
    rule,
  };
}

module.exports = { loadAclCache, checkAcl, testAcl, topicMatchesPattern };

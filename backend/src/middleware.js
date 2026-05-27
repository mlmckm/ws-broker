const rateLimit = require('express-rate-limit');
const { verifyToken } = require('./auth');
const { writeAudit } = require('./audit');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Yetkilendirme gerekli' });

  const token = authHeader.replace('Bearer ', '');

  // API key check for external systems
  if (token === process.env.API_KEY) {
    req.user = { username: 'api', role: 'admin' };
    return next();
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Bu işlem için admin yetkisi gerekli' });
  }
  next();
}

function requireAdminOrViewer(req, res, next) {
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'viewer') {
    return res.status(403).json({ error: 'Erişim reddedildi' });
  }
  next();
}

// Login endpoint rate limiter
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Çok fazla giriş denemesi, lütfen bekleyin' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Genel API rate limiter (tüm /api/* endpoint'leri)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,  // dakikada 300 istek
  message: { error: 'API rate limit aşıldı, lütfen bekleyin' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // API key ile gelen istekleri sınırlama
    const token = req.headers.authorization?.replace('Bearer ', '');
    return token === process.env.API_KEY;
  },
});

module.exports = { authMiddleware, requireAdmin, requireAdminOrViewer, loginLimiter, apiLimiter };

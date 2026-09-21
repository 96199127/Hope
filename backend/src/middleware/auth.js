const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito ao DP/administrador' });
  next();
}

// O terminal de ponto (login por CNPJ) e o DP (login por e-mail) podem bater ponto/consultar status
function requireKioskOrAdmin(req, res, next) {
  if (req.user?.role !== 'kiosk' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito ao terminal de ponto' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireKioskOrAdmin };

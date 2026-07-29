function requireAuth(req, res, next) {
  if (!req.session || !req.session.cashierId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
}

function requireManager(req, res, next) {
  if (!req.session || !req.session.cashierId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  if (req.session.role !== 'manager') {
    return res.status(403).json({ error: 'Accès réservé au gérant' });
  }
  next();
}

module.exports = { requireAuth, requireManager };

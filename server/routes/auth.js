const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');

const router = express.Router();

const PIN_REGEX = /^\d{4}$/;

function getOpenShift(db, cashierId) {
  return db.prepare("SELECT * FROM shifts WHERE cashier_id = ? AND status = 'open'").get(cashierId);
}

// GET /api/auth/bootstrap-needed — is this a fresh install with no cashiers yet?
router.get('/bootstrap-needed', (req, res, next) => {
  try {
    const db = getDb();
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM cashiers').get();
    res.json({ needed: count === 0 });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/bootstrap — create the first manager account (only when no cashiers exist)
router.post('/bootstrap', (req, res, next) => {
  try {
    const db = getDb();
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM cashiers').get();
    if (count > 0) {
      return res.status(403).json({ error: 'La configuration initiale a déjà été faite' });
    }

    const { name, pin } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Le nom ne peut pas être vide' });
    }
    if (!pin || !PIN_REGEX.test(pin)) {
      return res.status(400).json({ error: 'Le code PIN doit contenir exactement 4 chiffres' });
    }

    const pinHash = bcrypt.hashSync(pin, 10);
    const info = db.prepare(
      'INSERT INTO cashiers (name, pin_hash, role) VALUES (?, ?, ?)'
    ).run(name.trim(), pinHash, 'manager');

    const cashierId = Number(info.lastInsertRowid);
    req.session.cashierId = cashierId;
    req.session.role = 'manager';
    req.session.shiftId = null;

    res.status(201).json({ cashier: { id: cashierId, name: name.trim(), role: 'manager' }, shift: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/cashiers-public — active cashier names for the login picker (no PINs)
router.get('/cashiers-public', (req, res, next) => {
  try {
    const db = getDb();
    const cashiers = db.prepare(
      'SELECT id, name, role FROM cashiers WHERE active = 1 ORDER BY name'
    ).all();
    res.json(cashiers);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login — { cashier_id, pin }
router.post('/login', (req, res, next) => {
  try {
    const { cashier_id, pin } = req.body || {};
    if (!cashier_id || !pin) {
      return res.status(400).json({ error: 'Sélectionnez un caissier et entrez le code PIN' });
    }

    const db = getDb();
    const cashier = db.prepare('SELECT * FROM cashiers WHERE id = ? AND active = 1').get(cashier_id);
    if (!cashier || !bcrypt.compareSync(String(pin), cashier.pin_hash)) {
      return res.status(401).json({ error: 'Code PIN incorrect' });
    }

    const openShift = getOpenShift(db, cashier.id);

    req.session.cashierId = cashier.id;
    req.session.role = cashier.role;
    req.session.shiftId = openShift ? openShift.id : null;

    res.json({
      cashier: { id: cashier.id, name: cashier.name, role: cashier.role },
      shift: openShift || null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ message: 'Déconnecté' });
  });
});

// GET /api/auth/me — current session info, refreshed from DB
router.get('/me', (req, res, next) => {
  try {
    if (!req.session || !req.session.cashierId) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const db = getDb();
    const cashier = db.prepare('SELECT * FROM cashiers WHERE id = ? AND active = 1').get(req.session.cashierId);
    if (!cashier) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Compte introuvable ou désactivé' });
    }

    const openShift = getOpenShift(db, cashier.id);
    req.session.shiftId = openShift ? openShift.id : null;

    res.json({
      cashier: { id: cashier.id, name: cashier.name, role: cashier.role },
      shift: openShift || null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

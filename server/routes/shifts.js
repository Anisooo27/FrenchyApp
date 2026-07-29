const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireManager } = require('../middleware/auth');

const router = express.Router();

function getShiftTotals(db, shiftId) {
  return db.prepare(`
    SELECT
      COUNT(*)        AS order_count,
      COALESCE(SUM(total), 0) AS total_revenue,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) AS cash_total,
      COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) AS card_total
    FROM orders
    WHERE shift_id = ?
  `).get(shiftId);
}

// POST /api/shifts — open a new shift for the logged-in cashier
router.post('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();

    const existing = db.prepare("SELECT * FROM shifts WHERE cashier_id = ? AND status = 'open'").get(req.session.cashierId);
    if (existing) {
      return res.status(400).json({ error: 'Une caisse est déjà ouverte pour ce compte' });
    }

    const startingCash = Number(req.body && req.body.starting_cash);
    if (!Number.isFinite(startingCash) || startingCash < 0) {
      return res.status(400).json({ error: 'Le fond de caisse de départ doit être un nombre positif ou nul' });
    }

    const info = db.prepare(
      'INSERT INTO shifts (cashier_id, starting_cash) VALUES (?, ?)'
    ).run(req.session.cashierId, Math.round(startingCash));

    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(info.lastInsertRowid);
    req.session.shiftId = shift.id;

    res.status(201).json(shift);
  } catch (err) {
    next(err);
  }
});

// GET /api/shifts/current — the logged-in cashier's open shift, with running totals
router.get('/current', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const shift = db.prepare("SELECT * FROM shifts WHERE cashier_id = ? AND status = 'open'").get(req.session.cashierId);
    if (!shift) return res.json(null);

    const totals = getShiftTotals(db, shift.id);
    res.json({ ...shift, totals });
  } catch (err) {
    next(err);
  }
});

// POST /api/shifts/:id/close — { counted_cash }
router.post('/:id/close', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id);
    if (!shift) return res.status(404).json({ error: 'Caisse introuvable' });
    if (shift.status !== 'open') return res.status(400).json({ error: 'Cette caisse est déjà fermée' });
    if (shift.cashier_id !== req.session.cashierId && req.session.role !== 'manager') {
      return res.status(403).json({ error: "Vous ne pouvez fermer que votre propre caisse" });
    }

    const countedCash = Number(req.body && req.body.counted_cash);
    if (!Number.isFinite(countedCash) || countedCash < 0) {
      return res.status(400).json({ error: 'Le montant compté doit être un nombre positif ou nul' });
    }

    const totals = getShiftTotals(db, shift.id);
    const expectedCash = Math.round(shift.starting_cash + totals.cash_total);
    const roundedCounted = Math.round(countedCash);

    db.prepare(
      "UPDATE shifts SET status = 'closed', closed_at = datetime('now','localtime'), counted_cash = ?, expected_cash = ? WHERE id = ?"
    ).run(roundedCounted, expectedCash, shift.id);

    if (req.session.cashierId === shift.cashier_id) {
      req.session.shiftId = null;
    }

    const closedShift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shift.id);
    res.json({ ...closedShift, totals, difference: roundedCounted - expectedCash });
  } catch (err) {
    next(err);
  }
});

// GET /api/shifts — manager: list all shifts (most recent first)
router.get('/', requireManager, (req, res, next) => {
  try {
    const db = getDb();
    const shifts = db.prepare(`
      SELECT s.*, c.name AS cashier_name
      FROM shifts s
      JOIN cashiers c ON c.id = s.cashier_id
      ORDER BY s.opened_at DESC
      LIMIT 100
    `).all();
    res.json(shifts);
  } catch (err) {
    next(err);
  }
});

// GET /api/shifts/:id — detail with orders (own shift, or manager for any)
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.params.id);
    if (!shift) return res.status(404).json({ error: 'Caisse introuvable' });
    if (shift.cashier_id !== req.session.cashierId && req.session.role !== 'manager') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const totals = getShiftTotals(db, shift.id);
    const orders = db.prepare('SELECT * FROM orders WHERE shift_id = ? ORDER BY created_at DESC').all(shift.id);

    res.json({ ...shift, totals, orders });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

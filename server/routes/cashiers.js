const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { requireManager } = require('../middleware/auth');

const router = express.Router();
const PIN_REGEX = /^\d{4}$/;

function validate({ name, pin, role }, { requirePin }) {
  const errors = [];
  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push('Le nom ne peut pas être vide');
  }
  if (role !== undefined && !['manager', 'cashier'].includes(role)) {
    errors.push('Le rôle doit être "manager" ou "cashier"');
  }
  if (requirePin || pin !== undefined) {
    if (!pin || !PIN_REGEX.test(pin)) {
      errors.push('Le code PIN doit contenir exactement 4 chiffres');
    }
  }
  return errors;
}

// GET /api/cashiers — list all (including inactive), no PIN hashes exposed
router.get('/', requireManager, (req, res, next) => {
  try {
    const db = getDb();
    const cashiers = db.prepare(
      'SELECT id, name, role, active, created_at FROM cashiers ORDER BY active DESC, name'
    ).all();

    const countOrders = db.prepare('SELECT COUNT(*) AS count FROM orders WHERE cashier_id = ?');
    const countShifts = db.prepare('SELECT COUNT(*) AS count FROM shifts WHERE cashier_id = ?');
    const withHistory = cashiers.map(c => ({
      ...c,
      hasHistory: countOrders.get(c.id).count > 0 || countShifts.get(c.id).count > 0,
    }));

    res.json(withHistory);
  } catch (err) {
    next(err);
  }
});

// POST /api/cashiers — create
router.post('/', requireManager, (req, res, next) => {
  try {
    const { name, pin, role } = req.body || {};
    const errors = validate({ name, pin, role }, { requirePin: true });
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });

    const db = getDb();
    const pinHash = bcrypt.hashSync(String(pin), 10);
    const info = db.prepare(
      'INSERT INTO cashiers (name, pin_hash, role) VALUES (?, ?, ?)'
    ).run(name.trim(), pinHash, role);

    res.status(201).json({ id: Number(info.lastInsertRowid), name: name.trim(), role, active: 1 });
  } catch (err) {
    next(err);
  }
});

// PUT /api/cashiers/:id — update name/role/active/pin
router.put('/:id', requireManager, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM cashiers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Caissier introuvable' });

    const { name, pin, role, active } = req.body || {};
    const errors = validate({ name: name ?? existing.name, pin, role: role ?? existing.role }, { requirePin: false });
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });

    // Guard against locking everyone out by deactivating/demoting the last active manager
    if ((active === false || (role && role !== 'manager')) && existing.role === 'manager' && existing.active) {
      const { count } = db.prepare(
        "SELECT COUNT(*) AS count FROM cashiers WHERE role = 'manager' AND active = 1 AND id != ?"
      ).get(existing.id);
      if (count === 0) {
        return res.status(400).json({ error: 'Impossible de retirer le dernier compte gérant actif' });
      }
    }

    const finalName = name !== undefined ? name.trim() : existing.name;
    const finalRole = role !== undefined ? role : existing.role;
    const finalActive = active !== undefined ? (active ? 1 : 0) : existing.active;
    const finalPinHash = pin !== undefined ? bcrypt.hashSync(String(pin), 10) : existing.pin_hash;

    db.prepare(
      'UPDATE cashiers SET name = ?, role = ?, active = ?, pin_hash = ? WHERE id = ?'
    ).run(finalName, finalRole, finalActive, finalPinHash, req.params.id);

    res.json({ id: Number(req.params.id), name: finalName, role: finalRole, active: finalActive });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cashiers/:id — permanent deletion, only when the account has
// zero orders and zero shifts. Accounts with any history can only be
// deactivated (PUT { active: false }) so past sales stay attributable.
router.delete('/:id', requireManager, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM cashiers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Caissier introuvable' });

    const { count: orderCount } = db.prepare('SELECT COUNT(*) AS count FROM orders WHERE cashier_id = ?').get(existing.id);
    const { count: shiftCount } = db.prepare('SELECT COUNT(*) AS count FROM shifts WHERE cashier_id = ?').get(existing.id);
    if (orderCount > 0 || shiftCount > 0) {
      return res.status(400).json({ error: 'Ce compte a un historique de ventes — vous pouvez seulement le désactiver.' });
    }

    if (existing.role === 'manager' && existing.active) {
      const { count } = db.prepare(
        "SELECT COUNT(*) AS count FROM cashiers WHERE role = 'manager' AND active = 1 AND id != ?"
      ).get(existing.id);
      if (count === 0) {
        return res.status(400).json({ error: 'Impossible de supprimer le dernier compte gérant actif' });
      }
    }

    db.prepare('DELETE FROM cashiers WHERE id = ?').run(existing.id);
    res.json({ message: 'Caissier supprimé' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

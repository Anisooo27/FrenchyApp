const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireManager } = require('../middleware/auth');

const router = express.Router();

// ===== Validation helper =====
function validateProduct({ name, price, category }, partial = false) {
  const errors = [];

  if (!partial || name !== undefined) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      errors.push('Le nom du produit ne peut pas être vide');
    }
  }

  if (!partial || price !== undefined) {
    const p = Number(price);
    if (price == null || isNaN(p)) {
      errors.push('Le prix doit être un nombre valide');
    } else if (p <= 0) {
      errors.push('Le prix doit être un nombre positif');
    }
  }

  if (!partial || category !== undefined) {
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      errors.push('La catégorie ne peut pas être vide');
    }
  }

  return errors;
}

// GET /api/products — list products. Only active ones by default (the till
// always calls it this way); pass ?includeArchived=1 to also get archived
// ones (used by the admin page's "show archived" toggle).
router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true';
    const products = includeArchived
      ? db.prepare('SELECT * FROM products ORDER BY category, name').all()
      : db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY category, name').all();

    const countOrderItems = db.prepare('SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?');
    for (const p of products) p.hasHistory = countOrderItems.get(p.id).count > 0;

    res.json(products);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id — get one product
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// POST /api/products — create a product
router.post('/', requireManager, (req, res, next) => {
  try {
    const { name, price, category } = req.body || {};
    const errors = validateProduct({ name, price, category });
    if (errors.length) {
      return res.status(400).json({ error: errors.join('. ') });
    }

    const db = getDb();
    const cleanName = name.trim();
    const cleanCategory = category.trim();
    const cleanPrice = Math.round(Number(price));

    const info = db.prepare(
      'INSERT INTO products (name, price, category) VALUES (?, ?, ?)'
    ).run(cleanName, cleanPrice, cleanCategory);

    res.status(201).json({ id: Number(info.lastInsertRowid), name: cleanName, price: cleanPrice, category: cleanCategory });
  } catch (err) {
    next(err);
  }
});

// PUT /api/products/:id — update a product (name/price/category/active)
router.put('/:id', requireManager, (req, res, next) => {
  try {
    const { name, price, category, active } = req.body || {};
    const db = getDb();
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Produit introuvable' });

    // Partial validation — only validate fields that are provided
    const errors = validateProduct({ name, price, category }, true);
    if (errors.length) {
      return res.status(400).json({ error: errors.join('. ') });
    }

    const finalName     = name     !== undefined ? name.trim()                       : existing.name;
    const finalPrice    = price    !== undefined ? Math.round(Number(price))          : existing.price;
    const finalCategory = category !== undefined ? category.trim()                    : existing.category;
    const finalActive   = active   !== undefined ? (active ? 1 : 0)                   : existing.active;

    db.prepare(
      'UPDATE products SET name = ?, price = ?, category = ?, active = ? WHERE id = ?'
    ).run(finalName, finalPrice, finalCategory, finalActive, req.params.id);

    res.json({ id: Number(req.params.id), name: finalName, price: finalPrice, category: finalCategory, active: finalActive });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id — permanent deletion, only when the product has
// never been sold (zero order_items). A product with any sales history can
// only be archived (PUT { active: false }) — hard-deleting it would leave
// past orders referencing a product that no longer exists.
router.delete('/:id', requireManager, (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Produit introuvable' });

    const { count } = db.prepare('SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?').get(existing.id);
    if (count > 0) {
      return res.status(400).json({ error: 'Ce produit a été vendu par le passé — vous pouvez seulement l\'archiver.' });
    }

    db.prepare('DELETE FROM products WHERE id = ?').run(existing.id);
    res.json({ message: 'Produit supprimé' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

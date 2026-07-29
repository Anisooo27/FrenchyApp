const express = require('express');
const { getDb } = require('../db');

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

// GET /api/products — list all products
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const products = db.prepare('SELECT * FROM products ORDER BY category, name').all();
    res.json(products);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id — get one product
router.get('/:id', (req, res, next) => {
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
router.post('/', (req, res, next) => {
  try {
    const { name, price, category } = req.body || {};
    const errors = validateProduct({ name, price, category });
    if (errors.length) {
      return res.status(400).json({ error: errors.join('. ') });
    }

    const db = getDb();
    const cleanName = name.trim();
    const cleanCategory = category.trim();
    const cleanPrice = Math.round(Number(price) * 100) / 100;

    const info = db.prepare(
      'INSERT INTO products (name, price, category) VALUES (?, ?, ?)'
    ).run(cleanName, cleanPrice, cleanCategory);

    res.status(201).json({ id: Number(info.lastInsertRowid), name: cleanName, price: cleanPrice, category: cleanCategory });
  } catch (err) {
    next(err);
  }
});

// PUT /api/products/:id — update a product
router.put('/:id', (req, res, next) => {
  try {
    const { name, price, category } = req.body || {};
    const db = getDb();
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Produit introuvable' });

    // Partial validation — only validate fields that are provided
    const errors = validateProduct({ name, price, category }, true);
    if (errors.length) {
      return res.status(400).json({ error: errors.join('. ') });
    }

    const finalName     = name     !== undefined ? name.trim()                         : existing.name;
    const finalPrice    = price    !== undefined ? Math.round(Number(price) * 100) / 100 : existing.price;
    const finalCategory = category !== undefined ? category.trim()                      : existing.category;

    db.prepare(
      'UPDATE products SET name = ?, price = ?, category = ? WHERE id = ?'
    ).run(finalName, finalPrice, finalCategory, req.params.id);

    res.json({ id: Number(req.params.id), name: finalName, price: finalPrice, category: finalCategory });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id — delete a product
router.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Produit introuvable' });
    res.json({ message: 'Produit supprimé' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

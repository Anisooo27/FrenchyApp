const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireManager } = require('../middleware/auth');

const router = express.Router();

// POST /api/orders — create a new order
router.post('/', requireAuth, (req, res, next) => {
  try {
    if (!req.session.shiftId) {
      return res.status(400).json({ error: 'Ouvrez votre caisse avant d\'encaisser une vente' });
    }

    const { items, payment_method } = req.body || {};
    // items = [{ product_id, quantity }]

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Le panier est vide' });
    }
    if (!['cash', 'card'].includes(payment_method)) {
      return res.status(400).json({ error: 'payment_method doit être "cash" ou "card"' });
    }
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ error: `Quantité invalide pour le produit id=${item.product_id}` });
      }
    }

    const db = getDb();

    // Make sure the shift is still open (it may have been closed from
    // another tab/device since this session last checked).
    const shift = db.prepare("SELECT * FROM shifts WHERE id = ? AND status = 'open'").get(req.session.shiftId);
    if (!shift) {
      req.session.shiftId = null;
      return res.status(400).json({ error: 'Votre caisse a été fermée. Ouvrez-en une nouvelle avant d\'encaisser.' });
    }

    // Look up current prices and compute total
    const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
    let total = 0;
    const enrichedItems = [];

    for (const item of items) {
      const product = getProduct.get(item.product_id);
      if (!product) {
        return res.status(400).json({ error: `Produit id=${item.product_id} introuvable` });
      }
      const unitPrice = product.price;
      total += unitPrice * item.quantity;
      enrichedItems.push({ ...item, unit_price: unitPrice });
    }

    total = Math.round(total); // whole dinars

    const insertOrder = db.prepare(
      'INSERT INTO orders (total, payment_method, cashier_id, shift_id) VALUES (?, ?, ?, ?)'
    );
    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
    );

    const createOrder = db.transaction(() => {
      const orderInfo = insertOrder.run(total, payment_method, req.session.cashierId, req.session.shiftId);
      const orderId = orderInfo.lastInsertRowid;

      for (const item of enrichedItems) {
        insertItem.run(orderId, item.product_id, item.quantity, item.unit_price);
      }

      return orderId;
    });

    const orderId = createOrder();

    res.status(201).json({ id: orderId, total, payment_method });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/today — sales summary for today (all cashiers)
router.get('/today', requireManager, (req, res, next) => {
  try {
    const db = getDb();

    const summary = db.prepare(`
      SELECT
        COUNT(*)        AS order_count,
        COALESCE(SUM(total), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) AS cash_total,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) AS card_total
      FROM orders
      WHERE date(created_at) = date('now','localtime')
    `).get();

    const orders = db.prepare(`
      SELECT * FROM orders
      WHERE date(created_at) = date('now','localtime')
      ORDER BY created_at DESC
    `).all();

    res.json({ summary, orders });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/:id — get order detail
router.get('/:id', requireManager, (req, res, next) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });

    const items = db.prepare(`
      SELECT oi.*, p.name AS product_name
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ?
    `).all(req.params.id);

    res.json({ ...order, items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

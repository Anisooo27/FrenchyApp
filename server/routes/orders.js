const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// POST /api/orders — create a new order
router.post('/', (req, res) => {
  const { items, payment_method } = req.body;
  // items = [{ product_id, quantity }]

  if (!items || !items.length) {
    return res.status(400).json({ error: 'Le panier est vide' });
  }
  if (!['cash', 'card'].includes(payment_method)) {
    return res.status(400).json({ error: 'payment_method doit être "cash" ou "card"' });
  }

  const db = getDb();

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

  total = Math.round(total * 100) / 100; // avoid floating-point drift

  const insertOrder = db.prepare(
    'INSERT INTO orders (total, payment_method) VALUES (?, ?)'
  );
  const insertItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
  );

  const createOrder = db.transaction(() => {
    const orderInfo = insertOrder.run(total, payment_method);
    const orderId = orderInfo.lastInsertRowid;

    for (const item of enrichedItems) {
      insertItem.run(orderId, item.product_id, item.quantity, item.unit_price);
    }

    return orderId;
  });

  const orderId = createOrder();

  res.status(201).json({ id: orderId, total, payment_method });
});

// GET /api/orders/today — sales summary for today
router.get('/today', (req, res) => {
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
});

// GET /api/orders/:id — get order detail
router.get('/:id', (req, res) => {
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
});

module.exports = router;

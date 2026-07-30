const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireManager } = require('../middleware/auth');
const { printReceipt } = require('../printer');

const router = express.Router();
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/orders — create a new order
router.post('/', requireAuth, async (req, res, next) => {
  try {
    if (!req.session.shiftId) {
      return res.status(400).json({ error: 'Ouvrez votre caisse avant d\'encaisser une vente' });
    }

    const { items, payment_method, cash_received } = req.body || {};
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

    let cashReceived = null;
    if (payment_method === 'cash' && cash_received !== undefined) {
      cashReceived = Number(cash_received);
      if (!Number.isFinite(cashReceived) || cashReceived < 0) {
        return res.status(400).json({ error: 'Montant reçu invalide' });
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

    const cashier = db.prepare('SELECT name FROM cashiers WHERE id = ?').get(req.session.cashierId);

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
      enrichedItems.push({ ...item, unit_price: unitPrice, name: product.name });
    }

    total = Math.round(total); // whole dinars
    if (cashReceived !== null && cashReceived < total) {
      return res.status(400).json({ error: 'Le montant reçu est inférieur au total' });
    }

    const insertOrder = db.prepare(
      'INSERT INTO orders (total, payment_method, cashier_id, shift_id, cash_received) VALUES (?, ?, ?, ?, ?)'
    );
    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
    );

    const createOrder = db.transaction(() => {
      const orderInfo = insertOrder.run(total, payment_method, req.session.cashierId, req.session.shiftId, cashReceived);
      const orderId = orderInfo.lastInsertRowid;

      for (const item of enrichedItems) {
        insertItem.run(orderId, item.product_id, item.quantity, item.unit_price);
      }

      return orderId;
    });

    const orderId = createOrder();

    // Printing never blocks or fails the sale — the order is already saved.
    const printResult = await printReceipt({
      id: orderId,
      createdAt: new Date().toISOString(),
      cashierName: cashier ? cashier.name : 'Inconnu',
      items: enrichedItems,
      total,
      paymentMethod: payment_method,
      cashReceived,
    });

    const response = { id: orderId, total, payment_method };
    if (!printResult.printed) response.print_warning = printResult.warning;

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/history?date=YYYY-MM-DD — sales for a given day (all cashiers), defaults to today
router.get('/history', requireManager, (req, res, next) => {
  try {
    const date = req.query.date || null;
    if (date && !DATE_REGEX.test(date)) {
      return res.status(400).json({ error: 'Format de date invalide (attendu AAAA-MM-JJ)' });
    }

    const db = getDb();
    // dateExpr is never derived from user input directly — it's a fixed SQL
    // fragment chosen by this branch, with the actual date value bound below.
    const dateExpr = date ? '?' : "date('now','localtime')";
    const params = date ? [date] : [];

    const summary = db.prepare(`
      SELECT
        COUNT(*)        AS order_count,
        COALESCE(SUM(total), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) AS cash_total,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) AS card_total
      FROM orders
      WHERE date(created_at) = ${dateExpr}
    `).get(...params);

    const byCashier = db.prepare(`
      SELECT
        c.id   AS cashier_id,
        c.name AS cashier_name,
        COUNT(*) AS order_count,
        COALESCE(SUM(o.total), 0) AS total_revenue
      FROM orders o
      LEFT JOIN cashiers c ON c.id = o.cashier_id
      WHERE date(o.created_at) = ${dateExpr}
      GROUP BY o.cashier_id
      ORDER BY total_revenue DESC
    `).all(...params);

    const orders = db.prepare(`
      SELECT o.*, c.name AS cashier_name
      FROM orders o
      LEFT JOIN cashiers c ON c.id = o.cashier_id
      WHERE date(o.created_at) = ${dateExpr}
      ORDER BY o.created_at DESC
    `).all(...params);

    res.json({ date: date || null, summary, byCashier, orders });
  } catch (err) {
    next(err);
  }
});

// GET /api/orders/days — list of past days that have sales, most recent first
router.get('/days', requireManager, (req, res, next) => {
  try {
    const db = getDb();
    const days = db.prepare(`
      SELECT
        date(created_at) AS date,
        COUNT(*) AS order_count,
        COALESCE(SUM(total), 0) AS total_revenue
      FROM orders
      GROUP BY date(created_at)
      ORDER BY date DESC
      LIMIT 90
    `).all();
    res.json(days);
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

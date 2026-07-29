const express = require('express');
const path = require('path');

const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Unknown API route
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

// ===== ERROR HANDLING =====
// Malformed JSON body, DB errors thrown inside routes, or anything else
// that reaches here — respond with clear JSON instead of a blank page
// or an HTML stack trace, and never crash the process.
app.use((err, req, res, _next) => {
  console.error('Erreur serveur:', err);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Requête invalide (JSON malformé)' });
  }

  if (err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED') {
    return res.status(503).json({ error: 'Base de données occupée, réessayez dans un instant' });
  }

  res.status(500).json({ error: 'Une erreur interne est survenue. Réessayez.' });
});

// Keep the till running even if something unexpected slips through —
// a crashed process mid-service is worse than a logged error.
process.on('uncaughtException', (err) => {
  console.error('Exception non interceptée:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Promesse rejetée non gérée:', err);
});

// Start server
app.listen(PORT, () => {
  console.log(`🍞 Frenchy POS démarré sur http://localhost:${PORT}`);
});

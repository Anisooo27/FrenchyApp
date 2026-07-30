// One-off script: archive or delete the 16 pre-menu-switch products.
// Zero order history -> hard delete. Any order history -> active=0 (archived),
// never deleted, so past orders referencing it still resolve correctly.
const { getDb } = require('./db');

const db = getDb();

const oldProductNames = [
  'Baguette tradition', 'Pain de campagne', 'Croissant', 'Pain au chocolat',
  'Chausson aux pommes', 'Éclair au chocolat', 'Tarte aux fraises', 'Mille-feuille',
  'Macaron (lot de 6)', 'Café', 'Thé', 'Sandwich jambon-beurre', 'Croque-monsieur',
  'Tarte au citron', 'cheese cake lotus', 'cheese cake strawberies',
];

const getByName = db.prepare('SELECT * FROM products WHERE name = ?');
const countOrderItems = db.prepare('SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?');
const deleteProduct = db.prepare('DELETE FROM products WHERE id = ?');
const archiveProduct = db.prepare('UPDATE products SET active = 0 WHERE id = ?');

const deleted = [];
const archived = [];
const notFound = [];

const apply = db.transaction(() => {
  for (const name of oldProductNames) {
    const product = getByName.get(name);
    if (!product) {
      notFound.push(name);
      continue;
    }
    const { count } = countOrderItems.get(product.id);
    if (count === 0) {
      deleteProduct.run(product.id);
      deleted.push(`#${product.id} ${product.name}`);
    } else {
      archiveProduct.run(product.id);
      archived.push(`#${product.id} ${product.name} (${count} vente(s) passée(s))`);
    }
  }
});

apply();

console.log(`Deleted (no order history) — ${deleted.length}:`);
deleted.forEach(l => console.log('  ' + l));
console.log(`\nArchived (has order history, active=0) — ${archived.length}:`);
archived.forEach(l => console.log('  ' + l));
if (notFound.length) {
  console.log(`\nNot found in DB — ${notFound.length}:`);
  notFound.forEach(l => console.log('  ' + l));
}

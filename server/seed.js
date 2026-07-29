const { getDb } = require('./db');

const db = getDb();

// Clear existing products to avoid duplicates on re-run
db.exec('DELETE FROM products');

const insert = db.prepare(
  'INSERT INTO products (name, price, category) VALUES (@name, @price, @category)'
);

const sampleProducts = [
  // Boulangerie / Viennoiseries
  { name: 'Baguette tradition',    price: 1.30,  category: 'Boulangerie' },
  { name: 'Pain de campagne',      price: 2.50,  category: 'Boulangerie' },
  { name: 'Croissant',             price: 1.20,  category: 'Viennoiserie' },
  { name: 'Pain au chocolat',      price: 1.40,  category: 'Viennoiserie' },
  { name: 'Chausson aux pommes',   price: 1.60,  category: 'Viennoiserie' },

  // Pâtisseries
  { name: 'Éclair au chocolat',    price: 3.50,  category: 'Pâtisserie' },
  { name: 'Tarte aux fraises',     price: 4.00,  category: 'Pâtisserie' },
  { name: 'Mille-feuille',         price: 4.50,  category: 'Pâtisserie' },
  { name: 'Macaron (lot de 6)',    price: 9.00,  category: 'Pâtisserie' },

  // Boissons
  { name: 'Café',                  price: 1.50,  category: 'Boisson' },
  { name: 'Thé',                   price: 1.50,  category: 'Boisson' },
  { name: 'Jus d\'orange frais',   price: 3.00,  category: 'Boisson' },
  { name: 'Eau minérale',          price: 1.00,  category: 'Boisson' },

  // Sandwiches
  { name: 'Sandwich jambon-beurre', price: 4.50, category: 'Sandwich' },
  { name: 'Croque-monsieur',       price: 5.00,  category: 'Sandwich' },
];

const insertMany = db.transaction((products) => {
  for (const p of products) {
    insert.run(p);
  }
});

insertMany(sampleProducts);

console.log(`✅ ${sampleProducts.length} produits insérés avec succès !`);
process.exit(0);

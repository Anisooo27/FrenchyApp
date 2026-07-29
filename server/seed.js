const { getDb } = require('./db');

const db = getDb();

// Clear existing products to avoid duplicates on re-run
db.exec('DELETE FROM products');

const insert = db.prepare(
  'INSERT INTO products (name, price, category) VALUES (@name, @price, @category)'
);

const sampleProducts = [
  // Boulangerie / Viennoiseries
  { name: 'Baguette tradition',    price: 20,   category: 'Boulangerie' },
  { name: 'Pain de campagne',      price: 80,   category: 'Boulangerie' },
  { name: 'Croissant',             price: 50,   category: 'Viennoiserie' },
  { name: 'Pain au chocolat',      price: 60,   category: 'Viennoiserie' },
  { name: 'Chausson aux pommes',   price: 70,   category: 'Viennoiserie' },

  // Pâtisseries
  { name: 'Éclair au chocolat',    price: 150,  category: 'Pâtisserie' },
  { name: 'Tarte aux fraises',     price: 180,  category: 'Pâtisserie' },
  { name: 'Mille-feuille',         price: 180,  category: 'Pâtisserie' },
  { name: 'Macaron (lot de 6)',    price: 350,  category: 'Pâtisserie' },

  // Boissons
  { name: 'Café',                  price: 100,  category: 'Boisson' },
  { name: 'Thé',                   price: 80,   category: 'Boisson' },
  { name: 'Jus d\'orange frais',   price: 150,  category: 'Boisson' },
  { name: 'Eau minérale',          price: 40,   category: 'Boisson' },

  // Sandwiches
  { name: 'Sandwich jambon-beurre', price: 200, category: 'Sandwich' },
  { name: 'Croque-monsieur',       price: 250,  category: 'Sandwich' },
];

const insertMany = db.transaction((products) => {
  for (const p of products) {
    insert.run(p);
  }
});

insertMany(sampleProducts);

console.log(`✅ ${sampleProducts.length} produits insérés avec succès !`);
process.exit(0);

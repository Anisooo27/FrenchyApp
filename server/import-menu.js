// One-off script: reconcile the products table against the real Frenchy
// menu (images/menu2_0.png). Updates close name-matches, inserts everything
// new, and never deletes — prints a report of existing products that no
// longer appear on the menu for manual review.
const { getDb } = require('./db');

const db = getDb();

// ===== 1. Existing products to UPDATE (close name match to a menu item) =====
const updates = [
  { name: 'Jus d\'orange frais', price: 350, category: 'Fresh Juices' }, // = "Orange" under Fresh Juices
  { name: 'Eau minérale', price: 250, category: 'Soft Drinks' },        // = "Water" under Soft Drinks (250-300 DA range, see note)
];

// ===== 2. New products from the menu =====
const TEA_PLACEHOLDER = 150; // price hidden behind the cup photo on the menu itself — placeholder, needs confirming
const SOFT_DRINK_PLACEHOLDER = 250; // menu shows a "250-300 DA" range, not per-item — placeholder, needs confirming

const newProducts = [
  // Signature Cups
  ...[
    ['Pistachio', 550], ['Choco Bomb', 650], ['Caramel Speculoos', 500],
    ['Crispy Rosa X Pistachio', 750], ['Tropical', 650], ['Bueno Explosion', 650],
    ['Rocher Deluxe', 700], ['Oreo Madness', 600], ['Lotus Dream', 650], ['Berry Bliss', 600],
  ].map(([name, price]) => ({ name, price, category: 'Signature Cups' })),

  // Crêpes
  ...[
    ['Crêpe Nocciolata', 450], ['Nocciolata Banana', 550], ['Nocciolata Pistachio & Sundae', 700],
    ['Nocciolata Banana & Strawberry', 650], ['Oreo Crêpe', 600], ['Bueno Crêpe', 650],
    ['Rocher Crêpe', 700], ['Lotus Crêpe', 650], ['Triple Chocolate', 700], ['Fruits des Bois', 650],
  ].map(([name, price]) => ({ name, price, category: 'Crêpes' })),

  // Waffles
  ...[
    ['Classic Waffle', 450], ['Nocciolata', 550], ['Oreo', 600], ['Bueno', 650],
    ['Pistachio', 700], ['Rocher', 700], ['Lotus Speculoos', 650],
    ['Strawberry & Banana', 650], ['Mango Paradise', 650], ['Triple Chocolate', 700],
  ].map(([name, price]) => ({ name, price, category: 'Waffles' })),

  // Cookies & Cream (all boxes 750 DA)
  ...[
    'Nocciolata Pistachio', 'Tropical', 'Rochero', 'Caramel Speculoos', 'Gold Billionaire',
    'Framboise', 'Raffolino', 'Crispy Rosa', 'Pistachio', 'Crok-Kat', 'Bueno Nocciolata', 'Fruits des Bois',
  ].map((name) => ({ name, price: 750, category: 'Cookies & Cream' })),

  // Frenchy Sundae — build-your-own (base x size), no modifier system in this app,
  // so each base/size combo is its own product.
  ...['Vanille', 'Chocolat-Noisette'].flatMap((base) =>
    [['S', 150], ['M', 250], ['L', 350]].map(([size, price]) => ({
      name: `Sundae ${base} ${size}`, price, category: 'Frenchy Sundae',
    }))
  ),

  // Sundae crunchy add-ons (+100 DA) — separate category from toppings below
  // so identically-named items (Oreo, Speculoos) don't collide.
  ...['Pistachio', 'Oreo', 'Speculoos', 'Cookie Crumble', 'Almonds', 'Cashews', 'Hazelnuts', 'Peanuts']
    .map((name) => ({ name, price: 100, category: 'Sundae - Croustillant' })),

  // Sundae premium toppings (+150 DA)
  ...[
    'Bueno', 'Rocher', 'Crok-Kat', 'Nocciolata', 'Raffolino', 'Snicky', 'Oreo', 'Speculoos',
    'Gold Billionaire', 'Salted Caramel', 'Crispy Rosa', 'Mango', 'Strawberry', 'Raspberry', 'Fruits des Bois',
  ].map((name) => ({ name, price: 150, category: 'Sundae - Topping' })),

  // Milkshakes
  ...[
    ['Chocolate', 500], ['Vanilla', 500], ['Strawberry', 500], ['Oreo', 550], ['Bueno', 600],
    ['Pistachio', 650], ['Lotus', 600], ['Rocher', 650], ['Banana', 500], ['Mango', 500],
  ].map(([name, price]) => ({ name, price, category: 'Milkshakes' })),

  // Frappés
  ...[
    ['Pistachio', 600], ['Raffolino', 500], ['Oro Nero', 500], ['Nocciolata', 500], ['Bueno', 500],
    ['Speculoos', 500], ['Gold Billionaire', 500], ['Fruits des Bois', 500], ['Framboise', 500],
    ['Mango', 500], ['Strawberry', 500], ['Café Chocolat', 600], ['Café Caramel', 600],
  ].map(([name, price]) => ({ name, price, category: 'Frappés' })),

  // Hot Drinks
  ...[
    ['Espresso', 180], ['Double Espresso', 250], ['Espresso Macchiato', 220],
    ['Americano', 250], ['Café Latte', 350], ['Cappuccino', 350], ['Flat White', 400], ['Mocha', 450],
    ['Classic Hot Chocolate', 450], ['White Hot Chocolate', 500],
  ].map(([name, price]) => ({ name, price, category: 'Hot Drinks' })),
  ...['Green Tea', 'Black Tea', 'Mint Tea', 'Lemon Tea']
    .map((name) => ({ name, price: TEA_PLACEHOLDER, category: 'Hot Drinks', flaggedPrice: true })),

  // Iced Drinks
  ...[
    ['Iced Americano', 350], ['Iced Latte', 450], ['Iced Mocha', 500],
    ['Iced Caramel Latte', 500], ['Iced Vanilla Latte', 500], ['Iced Chocolate', 500],
  ].map(([name, price]) => ({ name, price, category: 'Iced Drinks' })),

  // Mojitos
  ...[
    ['Classic Mint', 450], ['Strawberry', 500], ['Blue Lagoon', 500], ['Mango', 500],
    ['Passion Fruit', 500], ['Raspberry', 500], ['Watermelon', 500], ['Tropical Mix', 550],
  ].map(([name, price]) => ({ name, price, category: 'Mojitos' })),

  // Fresh Juices
  ...[
    ['Orange', 350], ['Lemon', 350], ['Strawberry', 450],
    ['Mango', 450], ['Pineapple', 450], ['Mixed Fruits', 500],
  ].map(([name, price]) => ({ name, price, category: 'Fresh Juices' })),

  // Smoothies
  ...[
    ['Strawberry', 500], ['Mango', 500], ['Berry Mix', 550], ['Tropical', 550], ['Banana Peanut', 550],
  ].map(([name, price]) => ({ name, price, category: 'Smoothies' })),

  // Soft Drinks — menu shows "250-300 DA" as a range, not per-item
  ...['Coca-Cola', 'Coca-Cola Zero', 'Sprite', 'Fanta', 'Schweppes', 'Hamoud Boualem']
    .map((name) => ({ name, price: SOFT_DRINK_PLACEHOLDER, category: 'Soft Drinks', flaggedPrice: true })),

  // Extras
  ...[
    ['Extra Sauce', 100], ['Extra Fruit', 150], ['Extra Ice Cream Scoop', 150],
    ['Whipped Cream', 100], ['Extra Cookie', 100], ['Extra Nuts', 100],
  ].map(([name, price]) => ({ name, price, category: 'Extras' })),
];

// ===== APPLY =====
const getByName = db.prepare('SELECT * FROM products WHERE name = ?');
const updateStmt = db.prepare('UPDATE products SET price = ?, category = ? WHERE id = ?');
const insertStmt = db.prepare('INSERT INTO products (name, price, category) VALUES (?, ?, ?)');
const allProducts = db.prepare('SELECT * FROM products').all();

const report = { updated: [], inserted: [], flaggedPrices: [] };

const apply = db.transaction(() => {
  for (const u of updates) {
    const existing = getByName.get(u.name);
    if (existing) {
      updateStmt.run(u.price, u.category, existing.id);
      report.updated.push(`${u.name}: ${existing.price} DA (${existing.category}) -> ${u.price} DA (${u.category})`);
    }
  }

  for (const p of newProducts) {
    insertStmt.run(p.name, p.price, p.category);
    report.inserted.push(`${p.name} — ${p.price} DA (${p.category})`);
    if (p.flaggedPrice) report.flaggedPrices.push(`${p.name} (${p.category}) — placeholder ${p.price} DA`);
  }
});

apply();

// Products matched (updated) — exclude from the "no longer on menu" list
const matchedNames = new Set(updates.map(u => u.name));
const menuNamesByCategory = newProducts.map(p => p.name);
const flaggedForReview = allProducts
  .filter(p => !matchedNames.has(p.name) && !menuNamesByCategory.includes(p.name))
  .map(p => `#${p.id} ${p.name} — ${p.price} DA (${p.category})`);

console.log(`Updated ${report.updated.length} existing product(s):`);
report.updated.forEach(l => console.log('  ' + l));
console.log(`\nInserted ${report.inserted.length} new product(s) from the menu.`);
console.log(`\nPrices needing manual confirmation (${report.flaggedPrices.length}):`);
report.flaggedPrices.forEach(l => console.log('  ' + l));
console.log(`\nExisting products NOT on the new menu — flagged for your review, NOT deleted (${flaggedForReview.length}):`);
flaggedForReview.forEach(l => console.log('  ' + l));

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'pos.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    // Enable WAL mode for better performance
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT    NOT NULL,
      price REAL    NOT NULL,
      category TEXT NOT NULL DEFAULT 'Général'
    );

    CREATE TABLE IF NOT EXISTS cashiers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      pin_hash   TEXT    NOT NULL,
      role       TEXT    NOT NULL CHECK (role IN ('manager','cashier')),
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      cashier_id    INTEGER NOT NULL,
      opened_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      closed_at     TEXT,
      starting_cash REAL    NOT NULL,
      counted_cash  REAL,
      expected_cash REAL,
      status        TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
      FOREIGN KEY (cashier_id) REFERENCES cashiers(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      total          REAL    NOT NULL,
      payment_method TEXT    NOT NULL CHECK (payment_method IN ('cash','card')),
      cashier_id     INTEGER,
      shift_id       INTEGER,
      FOREIGN KEY (cashier_id) REFERENCES cashiers(id),
      FOREIGN KEY (shift_id)   REFERENCES shifts(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity   INTEGER NOT NULL DEFAULT 1,
      unit_price REAL    NOT NULL,
      FOREIGN KEY (order_id)   REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  migrateOrdersTable();
}

// orders existed before cashier_id/shift_id were introduced — add the
// columns for installs upgrading from an earlier version of the DB.
function migrateOrdersTable() {
  const columns = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
  if (!columns.includes('cashier_id')) {
    db.exec('ALTER TABLE orders ADD COLUMN cashier_id INTEGER REFERENCES cashiers(id)');
  }
  if (!columns.includes('shift_id')) {
    db.exec('ALTER TABLE orders ADD COLUMN shift_id INTEGER REFERENCES shifts(id)');
  }
}

module.exports = { getDb };

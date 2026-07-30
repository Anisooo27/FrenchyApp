const { printer: ThermalPrinter, types: PrinterTypes, characterSet: CharacterSet } = require('node-thermal-printer');

// The printer connects to the till's PC over USB, but Windows exposes a
// USB thermal printer as a normal print queue once its driver is installed
// and the queue is shared. We write raw ESC/POS bytes straight to that
// shared queue's UNC path — no extra native npm packages required (the
// obvious alternatives, the `printer` and `usb` packages, need a C++
// build toolchain that a shop PC won't have).
//
// One-time setup on the till's PC:
//   1. Install the printer's Windows driver (comes with any USB thermal printer).
//   2. Right-click the printer in "Devices and Printers" > Printer properties
//      > Sharing tab > check "Share this printer" > note the share name.
//   3. Set PRINTER_INTERFACE below (or the env var) to \\localhost\<share name>.
const PRINTER_INTERFACE = process.env.PRINTER_INTERFACE || '\\\\localhost\\POS-80';
const SHOP_NAME = 'Frenchy';
const RECEIPT_WIDTH = 42; // characters per line on an 80mm printer, standard font

// Plain ASCII formatting on purpose — thermal printer codepages are limited,
// and locale thousand-separators (e.g. fr-FR's narrow no-break space) don't
// encode reliably. A simple regex-based grouping avoids that entirely.
const fmt = (n) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} DA`;

// leftRight() pads with spaces based on plain string length and does not
// truncate — if left+right overflow the line width it prints them jammed
// together with no separator. Truncate the left side ourselves so there's
// always at least one space before the price.
function truncateLeft(text, rightText) {
  const maxLeft = RECEIPT_WIDTH - rightText.length - 1;
  if (text.length <= maxLeft) return text;
  // Plain ASCII "..." rather than a unicode ellipsis — thermal printer
  // codepages are extended-ASCII, not full unicode, and won't reliably encode it.
  return `${text.slice(0, Math.max(maxLeft - 3, 0))}...`;
}

function buildReceipt(order) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: PRINTER_INTERFACE,
    width: RECEIPT_WIDTH,
    characterSet: CharacterSet.PC858_EURO, // supports accented French characters
    removeSpecialCharacters: false,
    lineCharacter: '-',
  });

  printer.alignCenter();
  printer.bold(true);
  printer.setTextDoubleHeight();
  printer.println(SHOP_NAME);
  printer.setTextNormal();
  printer.bold(false);
  printer.println(new Date(order.createdAt).toLocaleString('fr-FR'));
  printer.drawLine();

  printer.alignLeft();
  printer.println(`Commande #${order.id}`);
  printer.println(`Caissier : ${order.cashierName}`);
  printer.drawLine();

  for (const item of order.items) {
    const lineTotal = fmt(item.unit_price * item.quantity);
    const label = truncateLeft(`${item.quantity} x ${item.name}`, lineTotal);
    printer.leftRight(label, lineTotal);
  }
  printer.drawLine();

  printer.bold(true);
  printer.leftRight('TOTAL', fmt(order.total));
  printer.bold(false);
  printer.leftRight('Paiement', order.paymentMethod === 'cash' ? 'Especes' : 'Carte');

  if (order.paymentMethod === 'cash' && order.cashReceived != null) {
    printer.leftRight('Recu', fmt(order.cashReceived));
    printer.leftRight('Monnaie', fmt(order.cashReceived - order.total));
  }

  printer.drawLine();
  printer.alignCenter();
  printer.println('Merci de votre visite !');
  printer.cut();

  return printer;
}

// The underlying file-write interface has its own ~5s internal timeout before
// it reports failure — too slow to make a cashier wait on during checkout.
// Race it down to 2.5s; a genuinely connected printer replies in well under
// that, so this only ever kicks in on the already-failing path.
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Délai d\'impression dépassé')), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function doPrint(order) {
  try {
    const printer = buildReceipt(order);
    await withTimeout(printer.execute(), 2500);
    return { printed: true };
  } catch (err) {
    const message = (err && err.message) || String(err);
    console.error('Impression du ticket échouée:', message);
    return { printed: false, warning: `Ticket non imprimé : ${message}` };
  }
}

// Print jobs are serialized through a single queue so two sales placed back
// to back can never interleave their output on the physical printer.
let printQueue = Promise.resolve();

function printReceipt(order) {
  const job = printQueue.then(() => doPrint(order));
  printQueue = job;
  return job;
}

// Exposed for testing/previewing receipt formatting without a physical printer.
function renderReceiptText(order) {
  return buildReceipt(order).getText();
}

module.exports = { printReceipt, renderReceiptText };

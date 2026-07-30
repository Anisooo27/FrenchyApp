/* ============================================
   FRENCHY POS — CLIENT APP
   ============================================ */

// ===== STATE =====
let products = [];
let cart = []; // { product_id, name, price, quantity }
let activeCategory = 'Tout';
let isSubmittingOrder = false;

// ===== DOM REFS =====
const $productGrid    = document.getElementById('product-grid');
const $categoryFilters= document.getElementById('category-filters');
const $cartItems      = document.getElementById('cart-items');
const $cartEmpty      = document.getElementById('cart-empty');
const $cartTotal      = document.getElementById('cart-total');
const $btnClear       = document.getElementById('btn-clear');
const $btnPayCash     = document.getElementById('btn-pay-cash');
const $btnPayCard     = document.getElementById('btn-pay-card');
const $clock          = document.getElementById('clock');

// Modal
const $modalOverlay   = document.getElementById('modal-overlay');
const $modalTitle     = document.getElementById('modal-title');
const $modalBody      = document.getElementById('modal-body');
const $modalCancel    = document.getElementById('modal-cancel');
const $modalConfirm   = document.getElementById('modal-confirm');

// ===== HELPERS =====
const fmt = (n) => `${Math.round(n).toLocaleString('fr-FR')} DA`;
const $toastContainer = document.getElementById('toast-container');

function showToast(message, type = 'error') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  $toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3200);
}

function updateClock() {
  const now = new Date();
  $clock.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// ===== API =====
async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('Le serveur a répondu avec une erreur');
    products = await res.json();
    renderCategories();
    renderProducts();
  } catch (err) {
    renderLoadError();
  }
}

async function submitOrder(paymentMethod, cashReceived) {
  const items = cart.map(c => ({ product_id: c.product_id, quantity: c.quantity }));
  const body = { items, payment_method: paymentMethod };
  if (paymentMethod === 'cash' && cashReceived != null) body.cash_received = cashReceived;

  let res;
  try {
    res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error('Serveur injoignable. Le panier est conservé, réessayez.');
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Impossible d\'enregistrer la commande');
  return json;
}

function renderLoadError() {
  $categoryFilters.innerHTML = '';
  $productGrid.innerHTML = `
    <div class="load-error">
      <div class="load-error__icon">⚠️</div>
      <div class="load-error__text">Impossible de charger les produits. Vérifiez que le serveur est démarré.</div>
      <button class="btn btn--primary" id="btn-retry-load" style="flex:none;">Réessayer</button>
    </div>
  `;
  document.getElementById('btn-retry-load').addEventListener('click', fetchProducts);
}

// ===== ESCAPE HTML (safe for both text content and attribute values) =====
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== RENDER PRODUCTS =====
function renderCategories() {
  const categories = ['Tout', ...new Set(products.map(p => p.category))];
  $categoryFilters.innerHTML = categories.map(c =>
    `<button class="category-btn ${c === activeCategory ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
  ).join('');

  $categoryFilters.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      renderCategories();
      renderProducts();
    });
  });
}

function renderProducts() {
  const filtered = activeCategory === 'Tout'
    ? products
    : products.filter(p => p.category === activeCategory);

  $productGrid.innerHTML = filtered.map(p => `
    <div class="product-card" data-id="${p.id}">
      <span class="product-card__category">${escapeHtml(p.category)}</span>
      <span class="product-card__name">${escapeHtml(p.name)}</span>
      <span class="product-card__price">${fmt(p.price)}</span>
    </div>
  `).join('');

  $productGrid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.id);
      addToCart(id);
    });
  });
}

// ===== CART =====
function addToCart(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const existing = cart.find(c => c.product_id === productId);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ product_id: productId, name: product.name, price: product.price, quantity: 1 });
  }
  renderCart();
}

function updateQty(productId, delta) {
  const item = cart.find(c => c.product_id === productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(c => c.product_id !== productId);
  }
  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter(c => c.product_id !== productId);
  renderCart();
}

function clearCart() {
  cart = [];
  renderCart();
}

function getTotal() {
  return Math.round(cart.reduce((sum, c) => sum + c.price * c.quantity, 0));
}

function renderCart() {
  const hasItems = cart.length > 0;
  $cartEmpty.style.display = hasItems ? 'none' : 'block';
  $btnClear.disabled = !hasItems;
  $btnPayCash.disabled = !hasItems;
  $btnPayCard.disabled = !hasItems;

  if (!hasItems) {
    // Clear all cart items but keep the empty message
    $cartItems.querySelectorAll('.cart-item').forEach(el => el.remove());
    $cartTotal.textContent = fmt(0);
    return;
  }

  const html = cart.map(c => `
    <div class="cart-item" data-id="${c.product_id}">
      <div class="cart-item__info">
        <div class="cart-item__name">${escapeHtml(c.name)}</div>
        <div class="cart-item__unit-price">${fmt(c.price)} / unité</div>
      </div>
      <div class="cart-item__qty">
        <button class="qty-minus" data-id="${c.product_id}">−</button>
        <span>${c.quantity}</span>
        <button class="qty-plus" data-id="${c.product_id}">+</button>
      </div>
      <div class="cart-item__subtotal">${fmt(c.price * c.quantity)}</div>
      <button class="cart-item__remove" data-id="${c.product_id}">✕</button>
    </div>
  `).join('');

  // Replace cart items (keep the empty message element)
  $cartItems.querySelectorAll('.cart-item').forEach(el => el.remove());
  $cartItems.insertAdjacentHTML('beforeend', html);

  $cartTotal.textContent = fmt(getTotal());

  // Attach quantity & remove listeners
  $cartItems.querySelectorAll('.qty-minus').forEach(btn => {
    btn.addEventListener('click', () => updateQty(Number(btn.dataset.id), -1));
  });
  $cartItems.querySelectorAll('.qty-plus').forEach(btn => {
    btn.addEventListener('click', () => updateQty(Number(btn.dataset.id), 1));
  });
  $cartItems.querySelectorAll('.cart-item__remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.id)));
  });
}

// ===== PAYMENT =====
function openPaymentModal(method) {
  if (cart.length === 0) return;
  const total = getTotal();
  $modalOverlay.hidden = false;
  $modalConfirm.disabled = false;
  $modalConfirm.classList.remove('btn--loading');

  if (method === 'card') {
    $modalTitle.textContent = '💳 Paiement par carte';
    $modalBody.innerHTML = `
      <p style="font-size: 15px; margin-bottom: 12px;">Montant à encaisser :</p>
      <p style="font-size: 32px; font-weight: 800; color: var(--color-accent);">${fmt(total)}</p>
    `;
    $modalConfirm.onclick = () => { if (!isSubmittingOrder) confirmPayment(method, null); };
  } else {
    $modalTitle.textContent = '💵 Paiement en espèces';
    $modalBody.innerHTML = `
      <p style="font-size: 15px; margin-bottom: 12px;">Total : <strong>${fmt(total)}</strong></p>
      <label for="cash-given">Montant reçu</label>
      <input type="number" id="cash-given" step="1" min="${total}" placeholder="0" autofocus>
      <div class="change-display" id="change-display" style="display:none">
        <div class="change-display__label">Monnaie à rendre</div>
        <div class="change-display__amount" id="change-amount">0 DA</div>
      </div>
    `;

    const $cashInput = document.getElementById('cash-given');
    const $changeDisplay = document.getElementById('change-display');
    const $changeAmount = document.getElementById('change-amount');

    $cashInput.addEventListener('input', () => {
      const given = parseFloat($cashInput.value) || 0;
      const change = given - total;
      if (given >= total) {
        $changeDisplay.style.display = 'block';
        $changeAmount.textContent = fmt(Math.round(change * 100) / 100);
      } else {
        $changeDisplay.style.display = 'none';
      }
    });

    $modalConfirm.onclick = () => {
      if (isSubmittingOrder) return;
      const given = parseFloat($cashInput.value) || 0;
      if (given < total) {
        $cashInput.style.borderColor = 'var(--color-danger)';
        $cashInput.focus();
        return;
      }
      confirmPayment(method, given);
    };

    // Focus input after modal animation
    setTimeout(() => $cashInput.focus(), 300);
  }
}

async function confirmPayment(method, cashReceived) {
  isSubmittingOrder = true;
  $modalConfirm.disabled = true;
  $modalConfirm.classList.add('btn--loading');

  try {
    const result = await submitOrder(method, cashReceived);
    closeModal();
    showSuccess(result);
    clearCart();
    if (result.print_warning) showToast(result.print_warning, 'error');
  } catch (err) {
    showToast(err.message || 'Impossible d\'enregistrer la commande. Le panier est conservé.');
    $modalConfirm.disabled = false;
    $modalConfirm.classList.remove('btn--loading');
  } finally {
    isSubmittingOrder = false;
  }
}

function closeModal() {
  $modalOverlay.hidden = true;
}

function showSuccess(order) {
  const overlay = document.createElement('div');
  overlay.className = 'success-overlay';
  overlay.innerHTML = `
    <div class="success-card">
      <div class="success-card__icon">✅</div>
      <div class="success-card__text">Commande #${order.id} enregistrée !</div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 1800);
}

// ===== EVENT LISTENERS =====
$btnClear.addEventListener('click', clearCart);
$btnPayCash.addEventListener('click', () => openPaymentModal('cash'));
$btnPayCard.addEventListener('click', () => openPaymentModal('card'));
$modalCancel.addEventListener('click', closeModal);

// Close modal on overlay click
$modalOverlay.addEventListener('click', (e) => { if (e.target === $modalOverlay) closeModal(); });

// ===== INIT =====
// Held back until auth.js confirms the cashier is logged in with an open shift.
document.addEventListener('auth:ready', fetchProducts);

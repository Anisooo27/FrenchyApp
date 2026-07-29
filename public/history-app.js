/* ============================================
   FRENCHY POS — SALES HISTORY APP
   ============================================ */

// ===== STATE =====
let days = [];
let selectedDate = todayStr();

// ===== DOM REFS =====
const $dayList = document.getElementById('day-list');
const $historyTitle = document.getElementById('history-title');
const $historyDetail = document.getElementById('history-detail');
const $toastContainer = document.getElementById('toast-container');

// ===== HELPERS =====
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const fmt = (n) => `${Math.round(Number(n)).toLocaleString('fr-FR')} DA`;

function formatDayLabel(dateStr) {
  if (dateStr === todayStr()) return "Aujourd'hui";
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function apiFetch(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error('Serveur injoignable. Vérifiez que Frenchy POS est bien démarré.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json && json.error) || 'Une erreur est survenue');
  return json;
}

// ===== API =====
async function fetchDays() {
  try {
    days = await apiFetch('/api/orders/days');
    if (!days.some(d => d.date === todayStr())) {
      days.unshift({ date: todayStr(), order_count: 0, total_revenue: 0 });
    }
    renderDayList();
  } catch (err) {
    $dayList.innerHTML = `<p style="color:var(--color-text-dim); font-size:13px;">${escapeHtml(err.message)}</p>`;
  }
}

async function fetchHistory(date) {
  return apiFetch(`/api/orders/history?date=${encodeURIComponent(date)}`);
}

// ===== RENDER =====
function renderDayList() {
  $dayList.innerHTML = days.map(d => `
    <button class="day-item ${d.date === selectedDate ? 'active' : ''}" data-date="${d.date}">
      <span class="day-item__date">${escapeHtml(formatDayLabel(d.date))}</span>
      <span class="day-item__meta">${d.order_count} commande${d.order_count > 1 ? 's' : ''} · ${fmt(d.total_revenue)}</span>
    </button>
  `).join('');

  $dayList.querySelectorAll('.day-item').forEach(btn => {
    btn.addEventListener('click', () => selectDay(btn.dataset.date));
  });
}

async function selectDay(date) {
  selectedDate = date;
  renderDayList();
  $historyTitle.textContent = formatDayLabel(date);
  $historyDetail.innerHTML = `<p style="color:var(--color-text-dim);">Chargement…</p>`;

  let data;
  try {
    data = await fetchHistory(date);
  } catch (err) {
    $historyDetail.innerHTML = `
      <div class="table-empty">
        <div class="table-empty__icon">⚠️</div>
        <div class="table-empty__text">${escapeHtml(err.message)}</div>
      </div>
    `;
    return;
  }

  renderDetail(data);
}

function renderDetail(data) {
  const { summary, byCashier, orders } = data;

  const cashierTable = byCashier.length === 0 ? '' : `
    <h3 class="history-section-title">Par caissier</h3>
    <table class="product-table">
      <thead>
        <tr><th>Caissier</th><th>Commandes</th><th>Chiffre d'affaires</th></tr>
      </thead>
      <tbody>
        ${byCashier.map(c => `
          <tr>
            <td style="font-weight:600;">${escapeHtml(c.cashier_name || 'Ventes antérieures (avant comptes caissiers)')}</td>
            <td>${c.order_count}</td>
            <td class="price-cell">${fmt(c.total_revenue)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const ordersList = orders.length === 0
    ? '<p style="color:var(--color-text-dim); text-align:center; padding:20px;">Aucune vente ce jour-là</p>'
    : `<div class="summary-orders" style="max-height:none;">
        ${orders.map(o => `
          <div class="summary-order-row">
            <span class="summary-order-row__time">${new Date(o.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
            <span>${escapeHtml(o.cashier_name || '—')}</span>
            <span class="summary-order-row__method">${o.payment_method === 'cash' ? '💵' : '💳'} ${o.payment_method}</span>
            <span class="summary-order-row__total">${fmt(o.total)}</span>
          </div>
        `).join('')}
      </div>`;

  $historyDetail.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-card__value">${summary.order_count}</div>
        <div class="summary-card__label">Commandes</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__value">${fmt(summary.total_revenue)}</div>
        <div class="summary-card__label">Chiffre d'affaires</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__value">${fmt(summary.cash_total)}</div>
        <div class="summary-card__label">Espèces</div>
      </div>
      <div class="summary-card">
        <div class="summary-card__value">${fmt(summary.card_total)}</div>
        <div class="summary-card__label">Carte</div>
      </div>
    </div>
    ${cashierTable}
    <h3 class="history-section-title">Historique des commandes</h3>
    ${ordersList}
  `;
}

// ===== INIT =====
async function initHistory() {
  await fetchDays();
  await selectDay(selectedDate);
}
document.addEventListener('auth:ready', initHistory);

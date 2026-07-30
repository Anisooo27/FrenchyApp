/* ============================================
   FRENCHY POS — CASHIER MANAGEMENT APP
   ============================================ */

// ===== STATE =====
let cashiers = [];
let editingId = null;
let deactivateId = null;
let isSubmittingForm = false;

// ===== DOM REFS =====
const $form        = document.getElementById('cashier-form');
const $formTitle    = document.getElementById('form-title');
const $editId       = document.getElementById('edit-id');
const $inputName    = document.getElementById('input-name');
const $inputRole    = document.getElementById('input-role');
const $inputPin     = document.getElementById('input-pin');
const $errorName    = document.getElementById('error-name');
const $errorPin     = document.getElementById('error-pin');
const $errorGlobal  = document.getElementById('error-global');
const $pinHint      = document.getElementById('pin-hint');
const $btnSubmit    = document.getElementById('btn-submit-text');
const $btnCancel    = document.getElementById('btn-cancel');

const $tbody        = document.getElementById('cashier-tbody');
const $cashierCount = document.getElementById('cashier-count');

const $toastContainer = document.getElementById('toast-container');

const $deleteOverlay = document.getElementById('delete-overlay');
const $deleteMessage = document.getElementById('delete-message');
const $deleteCancel  = document.getElementById('delete-cancel');
const $deleteConfirm = document.getElementById('delete-confirm');
let deleteTargetId = null;

// ===== HELPERS =====
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  $toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 2800);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function apiFetch(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    throw new Error('Serveur injoignable. Vérifiez que Frenchy POS est bien démarré.');
  }
  return res;
}

// ===== API =====
async function fetchCashiers() {
  try {
    const res = await apiFetch('/api/cashiers');
    if (!res.ok) throw new Error('Le serveur a répondu avec une erreur');
    cashiers = await res.json();
    renderTable();
  } catch (err) {
    $tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="table-empty">
            <div class="table-empty__icon">⚠️</div>
            <div class="table-empty__text">Impossible de charger les caissiers. Vérifiez que le serveur est démarré.</div>
          </div>
        </td>
      </tr>
    `;
    showToast('Impossible de charger les caissiers', 'error');
  }
}

async function createCashier(data) {
  const res = await apiFetch('/api/cashiers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
}

async function updateCashier(id, data) {
  const res = await apiFetch(`/api/cashiers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
}

async function deleteCashier(id) {
  const res = await apiFetch(`/api/cashiers/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
}

// ===== VALIDATION =====
function validateForm() {
  let valid = true;

  if (!$inputName.value.trim()) {
    $errorName.textContent = 'Le nom ne peut pas être vide';
    $inputName.classList.add('invalid');
    valid = false;
  } else {
    $errorName.textContent = '';
    $inputName.classList.remove('invalid');
  }

  const pin = $inputPin.value;
  const pinRequired = !editingId;
  if (pinRequired || pin) {
    if (!/^\d{4}$/.test(pin)) {
      $errorPin.textContent = 'Le PIN doit contenir exactement 4 chiffres';
      $inputPin.classList.add('invalid');
      valid = false;
    } else {
      $errorPin.textContent = '';
      $inputPin.classList.remove('invalid');
    }
  } else {
    $errorPin.textContent = '';
    $inputPin.classList.remove('invalid');
  }

  return valid;
}

function clearErrors() {
  $errorName.textContent = '';
  $errorPin.textContent = '';
  $errorGlobal.textContent = '';
  $errorGlobal.classList.remove('visible');
  $inputName.classList.remove('invalid');
  $inputPin.classList.remove('invalid');
}

// ===== FORM SUBMIT =====
$form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isSubmittingForm) return;
  clearErrors();

  if (!validateForm()) return;

  const data = {
    name: $inputName.value.trim(),
    role: $inputRole.value,
  };
  if ($inputPin.value) data.pin = $inputPin.value;

  isSubmittingForm = true;
  $btnSubmit.parentElement.classList.add('btn--loading');
  $btnSubmit.parentElement.disabled = true;

  try {
    if (editingId) {
      await updateCashier(editingId, data);
      showToast(`"${data.name}" modifié avec succès`);
      cancelEdit();
    } else {
      await createCashier(data);
      showToast(`"${data.name}" ajouté avec succès`);
      $form.reset();
      $inputRole.value = 'cashier';
    }
    await fetchCashiers();
  } catch (err) {
    $errorGlobal.textContent = err.message;
    $errorGlobal.classList.add('visible');
    showToast(err.message, 'error');
  } finally {
    isSubmittingForm = false;
    $btnSubmit.parentElement.classList.remove('btn--loading');
    $btnSubmit.parentElement.disabled = false;
  }
});

// ===== EDIT MODE =====
function startEdit(cashier) {
  editingId = cashier.id;
  $formTitle.textContent = '✏️ Modifier le caissier';
  $btnSubmit.textContent = 'Enregistrer';
  $btnCancel.hidden = false;
  $pinHint.hidden = false;
  $inputName.value = cashier.name;
  $inputRole.value = cashier.role;
  $inputPin.value = '';
  $inputName.focus();
  clearErrors();
  document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  editingId = null;
  $formTitle.textContent = '➕ Ajouter un caissier';
  $btnSubmit.textContent = 'Ajouter';
  $btnCancel.hidden = true;
  $pinHint.hidden = true;
  $form.reset();
  $inputRole.value = 'cashier';
  clearErrors();
}

$btnCancel.addEventListener('click', cancelEdit);

// ===== DELETE (only when no history) =====
function promptDelete(cashier) {
  deleteTargetId = cashier.id;
  $deleteMessage.textContent = `Êtes-vous sûr de vouloir supprimer définitivement "${cashier.name}" ? Cette action est irréversible.`;
  $deleteOverlay.hidden = false;
}

$deleteCancel.addEventListener('click', () => {
  $deleteOverlay.hidden = true;
  deleteTargetId = null;
});

$deleteOverlay.addEventListener('click', (e) => {
  if (e.target === $deleteOverlay) {
    $deleteOverlay.hidden = true;
    deleteTargetId = null;
  }
});

let isDeletingCashier = false;
$deleteConfirm.addEventListener('click', async () => {
  if (!deleteTargetId || isDeletingCashier) return;
  isDeletingCashier = true;
  $deleteConfirm.disabled = true;
  try {
    await deleteCashier(deleteTargetId);
    showToast('Compte supprimé', 'info');
    $deleteOverlay.hidden = true;
    if (editingId === deleteTargetId) cancelEdit();
    deleteTargetId = null;
    await fetchCashiers();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    isDeletingCashier = false;
    $deleteConfirm.disabled = false;
  }
});

// ===== TOGGLE ACTIVE =====
async function toggleActive(cashier) {
  try {
    await updateCashier(cashier.id, { active: !cashier.active });
    showToast(cashier.active ? 'Caissier désactivé' : 'Caissier réactivé', 'info');
    if (editingId === cashier.id) cancelEdit();
    await fetchCashiers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== RENDER TABLE =====
function renderTable() {
  $cashierCount.textContent = `${cashiers.length} compte${cashiers.length > 1 ? 's' : ''}`;

  if (cashiers.length === 0) {
    $tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="table-empty">
            <div class="table-empty__icon">👥</div>
            <div class="table-empty__text">Aucun caissier — ajoutez-en un !</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  $tbody.innerHTML = cashiers.map(c => `
    <tr data-id="${c.id}">
      <td class="col-id" style="color: var(--color-text-dim); font-size: 12px;">#${c.id}</td>
      <td style="font-weight: 600;">${escapeHtml(c.name)}</td>
      <td><span class="category-badge">${c.role === 'manager' ? 'Gérant' : 'Caissier'}</span></td>
      <td><span class="status-badge ${c.active ? 'status-badge--active' : 'status-badge--inactive'}">${c.active ? 'Actif' : 'Inactif'}</span></td>
      <td class="col-actions">
        <div class="action-btns">
          <button class="action-btn action-btn--edit" data-id="${c.id}" title="Modifier">✏️</button>
          <button class="action-btn action-btn--toggle" data-id="${c.id}" title="${c.active ? 'Désactiver' : 'Réactiver'}">${c.active ? '🔒' : '🔓'}</button>
          <button class="action-btn action-btn--delete" data-id="${c.id}" ${c.hasHistory ? 'disabled' : ''} title="${c.hasHistory ? 'Ce compte a un historique de ventes — vous pouvez seulement le désactiver.' : 'Supprimer définitivement'}">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');

  $tbody.querySelectorAll('.action-btn--edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = cashiers.find(c => c.id === Number(btn.dataset.id));
      if (c) startEdit(c);
    });
  });

  $tbody.querySelectorAll('.action-btn--delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = cashiers.find(c => c.id === Number(btn.dataset.id));
      if (c && !c.hasHistory) promptDelete(c);
    });
  });

  $tbody.querySelectorAll('.action-btn--toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = cashiers.find(c => c.id === Number(btn.dataset.id));
      if (c) toggleActive(c);
    });
  });
}

// ===== CLEAR FIELD ERRORS ON INPUT =====
$inputName.addEventListener('input', () => {
  $errorName.textContent = '';
  $inputName.classList.remove('invalid');
});
$inputPin.addEventListener('input', () => {
  $errorPin.textContent = '';
  $inputPin.classList.remove('invalid');
});

// ===== INIT =====
// Held back until auth.js confirms the logged-in cashier is a manager.
document.addEventListener('auth:ready', fetchCashiers);

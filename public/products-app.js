/* ============================================
   FRENCHY POS — PRODUCT MANAGEMENT APP
   ============================================ */

// ===== STATE =====
let products = [];
let editingId = null;
let deleteId = null;
let sortField = 'name';
let sortDir = 'asc';
let searchQuery = '';
let isSubmittingForm = false;

// ===== DOM REFS =====
const $form          = document.getElementById('product-form');
const $formTitle     = document.getElementById('form-title');
const $editId        = document.getElementById('edit-id');
const $inputName     = document.getElementById('input-name');
const $inputPrice    = document.getElementById('input-price');
const $inputCategory = document.getElementById('input-category');
const $errorName     = document.getElementById('error-name');
const $errorPrice    = document.getElementById('error-price');
const $errorCategory = document.getElementById('error-category');
const $errorGlobal   = document.getElementById('error-global');
const $btnSubmit     = document.getElementById('btn-submit-text');
const $btnCancel     = document.getElementById('btn-cancel');
const $categoryList  = document.getElementById('category-list');

const $tbody         = document.getElementById('product-tbody');
const $productCount  = document.getElementById('product-count');
const $searchInput   = document.getElementById('search-input');

const $deleteOverlay = document.getElementById('delete-overlay');
const $deleteMessage = document.getElementById('delete-message');
const $deleteCancel  = document.getElementById('delete-cancel');
const $deleteConfirm = document.getElementById('delete-confirm');

const $toastContainer = document.getElementById('toast-container');

// ===== HELPERS =====
const fmt = (n) => `${Math.round(Number(n)).toLocaleString('fr-FR')} DA`;

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

// ===== API =====
async function fetchProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('Le serveur a répondu avec une erreur');
    products = await res.json();
    updateCategoryDatalist();
    renderTable();
  } catch (err) {
    $tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="table-empty">
            <div class="table-empty__icon">⚠️</div>
            <div class="table-empty__text">Impossible de charger les produits. Vérifiez que le serveur est démarré.</div>
          </div>
        </td>
      </tr>
    `;
    showToast('Impossible de charger les produits', 'error');
  }
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

async function createProduct(data) {
  const res = await apiFetch('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
}

async function updateProduct(id, data) {
  const res = await apiFetch(`/api/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
}

async function deleteProduct(id) {
  const res = await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json;
}

// ===== CATEGORY AUTOCOMPLETE =====
function updateCategoryDatalist() {
  const categories = [...new Set(products.map(p => p.category))].sort();
  $categoryList.innerHTML = categories.map(c => `<option value="${c}">`).join('');
}

// ===== VALIDATION (client-side) =====
function validateForm() {
  let valid = true;

  // Name
  if (!$inputName.value.trim()) {
    $errorName.textContent = 'Le nom ne peut pas être vide';
    $inputName.classList.add('invalid');
    valid = false;
  } else {
    $errorName.textContent = '';
    $inputName.classList.remove('invalid');
  }

  // Price
  const price = parseFloat($inputPrice.value);
  if (isNaN(price) || $inputPrice.value.trim() === '') {
    $errorPrice.textContent = 'Entrez un prix valide';
    $inputPrice.classList.add('invalid');
    valid = false;
  } else if (price <= 0) {
    $errorPrice.textContent = 'Le prix doit être positif';
    $inputPrice.classList.add('invalid');
    valid = false;
  } else {
    $errorPrice.textContent = '';
    $inputPrice.classList.remove('invalid');
  }

  // Category
  if (!$inputCategory.value.trim()) {
    $errorCategory.textContent = 'La catégorie ne peut pas être vide';
    $inputCategory.classList.add('invalid');
    valid = false;
  } else {
    $errorCategory.textContent = '';
    $inputCategory.classList.remove('invalid');
  }

  return valid;
}

function clearErrors() {
  $errorName.textContent = '';
  $errorPrice.textContent = '';
  $errorCategory.textContent = '';
  $errorGlobal.textContent = '';
  $errorGlobal.classList.remove('visible');
  $inputName.classList.remove('invalid');
  $inputPrice.classList.remove('invalid');
  $inputCategory.classList.remove('invalid');
}

// ===== FORM SUBMIT =====
$form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isSubmittingForm) return;
  clearErrors();

  if (!validateForm()) return;

  const data = {
    name: $inputName.value.trim(),
    price: parseFloat($inputPrice.value),
    category: $inputCategory.value.trim(),
  };

  isSubmittingForm = true;
  $btnSubmit.parentElement.classList.add('btn--loading');
  $btnSubmit.parentElement.disabled = true;

  try {
    if (editingId) {
      await updateProduct(editingId, data);
      showToast(`"${data.name}" modifié avec succès`);
      cancelEdit();
    } else {
      await createProduct(data);
      showToast(`"${data.name}" ajouté avec succès`);
      $form.reset();
    }
    await fetchProducts();
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
function startEdit(product) {
  editingId = product.id;
  $formTitle.textContent = '✏️ Modifier le produit';
  $btnSubmit.textContent = 'Enregistrer';
  $btnCancel.hidden = false;
  $inputName.value = product.name;
  $inputPrice.value = product.price;
  $inputCategory.value = product.category;
  $inputName.focus();
  clearErrors();

  // Scroll form into view on mobile
  document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  editingId = null;
  $formTitle.textContent = '➕ Ajouter un produit';
  $btnSubmit.textContent = 'Ajouter';
  $btnCancel.hidden = true;
  $form.reset();
  clearErrors();
}

$btnCancel.addEventListener('click', cancelEdit);

// ===== DELETE =====
function promptDelete(product) {
  deleteId = product.id;
  $deleteMessage.textContent = `Êtes-vous sûr de vouloir supprimer "${product.name}" ?`;
  $deleteOverlay.hidden = false;
}

$deleteCancel.addEventListener('click', () => {
  $deleteOverlay.hidden = true;
  deleteId = null;
});

$deleteOverlay.addEventListener('click', (e) => {
  if (e.target === $deleteOverlay) {
    $deleteOverlay.hidden = true;
    deleteId = null;
  }
});

let isDeleting = false;
$deleteConfirm.addEventListener('click', async () => {
  if (!deleteId || isDeleting) return;
  isDeleting = true;
  $deleteConfirm.disabled = true;
  try {
    await deleteProduct(deleteId);
    showToast('Produit supprimé', 'info');
    $deleteOverlay.hidden = true;

    // If we were editing this product, cancel the edit
    if (editingId === deleteId) cancelEdit();

    deleteId = null;
    await fetchProducts();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    isDeleting = false;
    $deleteConfirm.disabled = false;
  }
});

// ===== SORTING =====
function setSort(field) {
  if (sortField === field) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortField = field;
    sortDir = 'asc';
  }
  renderTable();
}

document.querySelectorAll('.sortable').forEach(th => {
  th.addEventListener('click', () => setSort(th.dataset.sort));
});

// ===== SEARCH =====
$searchInput.addEventListener('input', () => {
  searchQuery = $searchInput.value.toLowerCase().trim();
  renderTable();
});

// ===== RENDER TABLE =====
function renderTable() {
  // Filter
  let filtered = products;
  if (searchQuery) {
    filtered = products.filter(p =>
      p.name.toLowerCase().includes(searchQuery) ||
      p.category.toLowerCase().includes(searchQuery)
    );
  }

  // Sort
  filtered.sort((a, b) => {
    let va = a[sortField];
    let vb = b[sortField];
    if (typeof va === 'string') {
      va = va.toLowerCase();
      vb = vb.toLowerCase();
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // Update sort indicators
  document.querySelectorAll('.sortable').forEach(th => {
    th.classList.remove('asc', 'desc');
    if (th.dataset.sort === sortField) {
      th.classList.add(sortDir);
      th.textContent = th.dataset.sort === 'name' ? 'Nom' :
                       th.dataset.sort === 'price' ? 'Prix' : 'Catégorie';
      th.textContent += sortDir === 'asc' ? ' ↑' : ' ↓';
    } else {
      th.textContent = th.dataset.sort === 'name' ? 'Nom ↕' :
                       th.dataset.sort === 'price' ? 'Prix ↕' : 'Catégorie ↕';
    }
  });

  // Update count
  $productCount.textContent = `${filtered.length} produit${filtered.length > 1 ? 's' : ''}`;

  // Render rows
  if (filtered.length === 0) {
    $tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="table-empty">
            <div class="table-empty__icon">${searchQuery ? '🔍' : '📦'}</div>
            <div class="table-empty__text">${searchQuery ? 'Aucun produit trouvé' : 'Aucun produit — ajoutez-en un !'}</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  $tbody.innerHTML = filtered.map(p => `
    <tr data-id="${p.id}">
      <td class="col-id" style="color: var(--color-text-dim); font-size: 12px;">#${p.id}</td>
      <td class="col-name" style="font-weight: 600;">${escapeHtml(p.name)}</td>
      <td class="col-price price-cell">${fmt(p.price)}</td>
      <td class="col-category"><span class="category-badge">${escapeHtml(p.category)}</span></td>
      <td class="col-actions">
        <div class="action-btns">
          <button class="action-btn action-btn--edit" data-id="${p.id}" title="Modifier">✏️</button>
          <button class="action-btn action-btn--delete" data-id="${p.id}" title="Supprimer">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Attach action listeners
  $tbody.querySelectorAll('.action-btn--edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = products.find(p => p.id === Number(btn.dataset.id));
      if (p) startEdit(p);
    });
  });

  $tbody.querySelectorAll('.action-btn--delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = products.find(p => p.id === Number(btn.dataset.id));
      if (p) promptDelete(p);
    });
  });
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

// ===== CLEAR FIELD ERRORS ON INPUT =====
$inputName.addEventListener('input', () => {
  $errorName.textContent = '';
  $inputName.classList.remove('invalid');
});
$inputPrice.addEventListener('input', () => {
  $errorPrice.textContent = '';
  $inputPrice.classList.remove('invalid');
});
$inputCategory.addEventListener('input', () => {
  $errorCategory.textContent = '';
  $inputCategory.classList.remove('invalid');
});

// ===== INIT =====
// Held back until auth.js confirms the logged-in cashier is a manager.
document.addEventListener('auth:ready', fetchProducts);

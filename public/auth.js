/* ============================================
   FRENCHY POS — AUTH & SHIFT GATE
   Blocks the page behind a login/shift screen until
   the cashier is authenticated (and has an open shift,
   on the POS page). Dispatches 'auth:ready' once done.
   ============================================ */
(function () {
  const page = document.body.dataset.page; // 'pos' or 'manager'
  const state = { cashier: null, shift: null, pendingCashier: null, pinBuffer: '' };

  // ===== API HELPER =====
  async function apiFetch(url, options) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      throw new Error('Serveur injoignable. Vérifiez que Frenchy POS est bien démarré.');
    }
    let json = null;
    try { json = await res.json(); } catch (_) { /* no body */ }
    if (!res.ok) throw new Error((json && json.error) || 'Une erreur est survenue');
    return json;
  }

  // ===== OVERLAY SCAFFOLDING =====
  const $overlay = document.createElement('div');
  $overlay.className = 'auth-overlay';
  $overlay.id = 'auth-overlay';
  const $card = document.createElement('div');
  $card.className = 'auth-card';
  $card.id = 'auth-card';
  $overlay.appendChild($card);
  document.body.appendChild($overlay);

  function showLoading() {
    $card.innerHTML = `<div class="auth-loading"><span class="auth-logo">🥐</span><p>Chargement…</p></div>`;
  }

  function hideOverlay() {
    $overlay.remove();
  }

  // ===== SCREEN: BOOTSTRAP (first run) =====
  function showBootstrap() {
    $card.innerHTML = `
      <span class="auth-logo">🥐</span>
      <h2>Bienvenue sur Frenchy POS</h2>
      <p class="auth-subtitle">Créez le compte du gérant pour commencer</p>
      <form id="bootstrap-form">
        <div>
          <label for="bootstrap-name">Nom du gérant</label>
          <input type="text" id="bootstrap-name" autocomplete="off" required>
        </div>
        <div>
          <label for="bootstrap-pin">Code PIN (4 chiffres)</label>
          <input type="password" id="bootstrap-pin" inputmode="numeric" maxlength="4" pattern="\\d{4}" required>
        </div>
        <div>
          <label for="bootstrap-pin-confirm">Confirmer le PIN</label>
          <input type="password" id="bootstrap-pin-confirm" inputmode="numeric" maxlength="4" pattern="\\d{4}" required>
        </div>
        <div class="auth-error" id="bootstrap-error"></div>
        <button type="submit" class="btn btn--primary">Créer le compte</button>
      </form>
    `;

    let submitting = false;
    document.getElementById('bootstrap-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitting) return;
      const $error = document.getElementById('bootstrap-error');
      $error.textContent = '';
      const name = document.getElementById('bootstrap-name').value.trim();
      const pin = document.getElementById('bootstrap-pin').value;
      const pinConfirm = document.getElementById('bootstrap-pin-confirm').value;

      if (pin !== pinConfirm) {
        $error.textContent = 'Les deux codes PIN ne correspondent pas';
        return;
      }

      submitting = true;
      try {
        const data = await apiFetch('/api/auth/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, pin }),
        });
        state.cashier = data.cashier;
        state.shift = data.shift;
        afterAuth();
      } catch (err) {
        $error.textContent = err.message;
        submitting = false;
      }
    });
  }

  // ===== SCREEN: LOGIN — cashier picker =====
  async function showLogin() {
    showLoading();
    let cashiers;
    try {
      cashiers = await apiFetch('/api/auth/cashiers-public');
    } catch (err) {
      $card.innerHTML = `<div class="auth-loading"><span class="auth-logo">⚠️</span><p>${escapeHtml(err.message)}</p></div>`;
      return;
    }

    $card.innerHTML = `
      <span class="auth-logo">🥐</span>
      <h2>Qui êtes-vous ?</h2>
      <p class="auth-subtitle">Sélectionnez votre nom pour vous connecter</p>
      <div class="cashier-picker" id="cashier-picker"></div>
    `;

    const $picker = document.getElementById('cashier-picker');
    if (cashiers.length === 0) {
      $picker.innerHTML = `<p class="auth-subtitle">Aucun compte actif. Contactez le gérant.</p>`;
      return;
    }

    cashiers.forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'cashier-btn';
      btn.innerHTML = `<span>${escapeHtml(c.name)}</span><span class="cashier-btn__role">${c.role === 'manager' ? 'Gérant' : 'Caissier'}</span>`;
      btn.addEventListener('click', () => showPinPad(c));
      $picker.appendChild(btn);
    });
  }

  // ===== SCREEN: PIN PAD =====
  function showPinPad(cashier) {
    state.pendingCashier = cashier;
    state.pinBuffer = '';

    $card.innerHTML = `
      <button class="auth-back" id="pin-back">← Retour</button>
      <span class="auth-logo">🔒</span>
      <h2>${escapeHtml(cashier.name)}</h2>
      <p class="auth-subtitle">Entrez votre code PIN</p>
      <div class="pin-dots" id="pin-dots">
        ${[0, 1, 2, 3].map(() => '<span class="pin-dot"></span>').join('')}
      </div>
      <div class="auth-error" id="pin-error"></div>
      <div class="pin-keypad" id="pin-keypad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button type="button" class="pin-key" data-key="${n}">${n}</button>`).join('')}
        <span class="pin-key pin-key--empty"></span>
        <button type="button" class="pin-key" data-key="0">0</button>
        <button type="button" class="pin-key" data-key="back">⌫</button>
      </div>
    `;

    document.getElementById('pin-back').addEventListener('click', showLogin);

    document.getElementById('pin-keypad').addEventListener('click', (e) => {
      const key = e.target.closest('.pin-key');
      if (!key || key.classList.contains('pin-key--empty')) return;
      const k = key.dataset.key;
      if (k === 'back') {
        state.pinBuffer = state.pinBuffer.slice(0, -1);
      } else if (state.pinBuffer.length < 4) {
        state.pinBuffer += k;
      }
      renderPinDots();
      if (state.pinBuffer.length === 4) submitPin();
    });

    function onKeydown(e) {
      if (e.key >= '0' && e.key <= '9' && state.pinBuffer.length < 4) {
        state.pinBuffer += e.key;
        renderPinDots();
        if (state.pinBuffer.length === 4) submitPin();
      } else if (e.key === 'Backspace') {
        state.pinBuffer = state.pinBuffer.slice(0, -1);
        renderPinDots();
      }
    }
    document.addEventListener('keydown', onKeydown);
    // Detach the listener once this screen is left (next render clears it naturally
    // since it's re-bound on a fresh element tree, but the document-level listener
    // needs explicit cleanup to avoid stacking).
    state._detachKeydown = () => document.removeEventListener('keydown', onKeydown);
  }

  function renderPinDots() {
    const dots = document.querySelectorAll('#pin-dots .pin-dot');
    dots.forEach((dot, i) => dot.classList.toggle('filled', i < state.pinBuffer.length));
  }

  async function submitPin() {
    if (state._detachKeydown) state._detachKeydown();
    const $error = document.getElementById('pin-error');
    const $keypad = document.getElementById('pin-keypad');
    $keypad.querySelectorAll('.pin-key').forEach(k => k.disabled = true);

    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashier_id: state.pendingCashier.id, pin: state.pinBuffer }),
      });
      state.cashier = data.cashier;
      state.shift = data.shift;
      afterAuth();
    } catch (err) {
      $error.textContent = err.message;
      state.pinBuffer = '';
      renderPinDots();
      if ($keypad) $keypad.querySelectorAll('.pin-key').forEach(k => k.disabled = false);
    }
  }

  // ===== SCREEN: SHIFT OPEN =====
  function showShiftOpen() {
    $card.innerHTML = `
      <span class="auth-logo">💰</span>
      <h2>Ouverture de caisse</h2>
      <p class="auth-subtitle">Bonjour <strong>${escapeHtml(state.cashier.name)}</strong>, entrez le fond de caisse de départ</p>
      <form id="shift-open-form">
        <div>
          <label for="shift-starting-cash">Fond de caisse (DA)</label>
          <input type="number" id="shift-starting-cash" min="0" step="1" placeholder="0" required autofocus>
        </div>
        <div class="auth-error" id="shift-open-error"></div>
        <button type="submit" class="btn btn--primary">Ouvrir la caisse</button>
      </form>
      <button class="auth-link" id="shift-open-logout">Se déconnecter</button>
    `;

    let submitting = false;
    document.getElementById('shift-open-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitting) return;
      const $error = document.getElementById('shift-open-error');
      $error.textContent = '';
      const startingCash = Number(document.getElementById('shift-starting-cash').value);

      submitting = true;
      try {
        const shift = await apiFetch('/api/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ starting_cash: startingCash }),
        });
        state.shift = shift;
        afterAuth();
      } catch (err) {
        $error.textContent = err.message;
        submitting = false;
      }
    });

    document.getElementById('shift-open-logout').addEventListener('click', logout);
  }

  // ===== SCREEN: ACCESS DENIED =====
  function showAccessDenied() {
    $card.innerHTML = `
      <span class="auth-logo">🚫</span>
      <h2>Accès réservé au gérant</h2>
      <p class="auth-subtitle">Ce compte (${escapeHtml(state.cashier.name)}) n'a pas accès à cette page.</p>
      <a href="/" class="btn btn--primary">Retour à la caisse</a>
      <div><button class="auth-link" id="denied-logout">Se déconnecter</button></div>
    `;
    document.getElementById('denied-logout').addEventListener('click', logout);
  }

  // ===== POST-AUTH ROUTING =====
  function afterAuth() {
    if (page === 'manager' && state.cashier.role !== 'manager') {
      showAccessDenied();
      return;
    }
    if (page === 'pos' && !state.shift) {
      showShiftOpen();
      return;
    }

    hideOverlay();
    applyRoleVisibility();
    renderHeaderChip();
    document.dispatchEvent(new CustomEvent('auth:ready', { detail: state }));
  }

  function applyRoleVisibility() {
    if (state.cashier.role !== 'manager') {
      document.querySelectorAll('[data-role="manager"]').forEach(el => { el.hidden = true; });
    }
  }

  // ===== HEADER ACCOUNT CHIP =====
  function renderHeaderChip() {
    const $actions = document.querySelector('.header__actions');
    if (!$actions) return;

    const $chip = document.createElement('div');
    $chip.className = 'account-chip';
    $chip.innerHTML = `
      <span class="account-chip__name">👤 ${escapeHtml(state.cashier.name)}</span>
      <span class="account-chip__role">${state.cashier.role === 'manager' ? 'Gérant' : 'Caissier'}</span>
      ${state.shift ? '<button class="btn btn--ghost btn--sm" id="btn-close-shift">🔒 Fermer la caisse</button>' : ''}
      <button class="btn btn--ghost btn--sm" id="btn-logout">Déconnexion</button>
    `;
    $actions.insertBefore($chip, $actions.firstChild);

    const $closeBtn = document.getElementById('btn-close-shift');
    if ($closeBtn) $closeBtn.addEventListener('click', openCloseShiftModal);
    document.getElementById('btn-logout').addEventListener('click', logout);
  }

  // ===== CLOSE SHIFT MODAL =====
  async function openCloseShiftModal() {
    let shift;
    try {
      shift = await apiFetch('/api/shifts/current');
    } catch (err) {
      alert(err.message);
      return;
    }
    if (!shift) {
      alert('Aucune caisse ouverte');
      return;
    }

    const expectedHint = shift.starting_cash + shift.totals.cash_total;

    const $modalOverlay = document.createElement('div');
    $modalOverlay.className = 'modal-overlay';
    $modalOverlay.innerHTML = `
      <div class="modal">
        <h3 class="modal__title">🔒 Fermeture de caisse</h3>
        <div class="modal__body">
          <p style="margin-bottom:10px;">Ventes de ce service : <strong>${shift.totals.order_count}</strong> commande(s), <strong>${Math.round(shift.totals.total_revenue)} DA</strong></p>
          <p style="margin-bottom:16px; color: var(--color-text-dim); font-size:13px;">Fond de départ ${Math.round(shift.starting_cash)} DA + espèces encaissées ${Math.round(shift.totals.cash_total)} DA</p>
          <label for="counted-cash">Montant compté en caisse (DA)</label>
          <input type="number" id="counted-cash" min="0" step="1" placeholder="0" autofocus>
          <div class="auth-error" id="close-shift-error"></div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--ghost" id="close-shift-cancel">Annuler</button>
          <button class="btn btn--primary" id="close-shift-confirm">Confirmer</button>
        </div>
      </div>
    `;
    document.body.appendChild($modalOverlay);

    document.getElementById('close-shift-cancel').addEventListener('click', () => $modalOverlay.remove());
    $modalOverlay.addEventListener('click', (e) => { if (e.target === $modalOverlay) $modalOverlay.remove(); });

    let submitting = false;
    const $confirmBtn = document.getElementById('close-shift-confirm');
    $confirmBtn.addEventListener('click', async () => {
      if (submitting) return;
      const $error = document.getElementById('close-shift-error');
      const countedCash = Number(document.getElementById('counted-cash').value);
      if (!Number.isFinite(countedCash) || countedCash < 0) {
        $error.textContent = 'Entrez un montant valide';
        return;
      }
      submitting = true;
      $confirmBtn.disabled = true;
      try {
        const result = await apiFetch(`/api/shifts/${shift.id}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ counted_cash: countedCash }),
        });
        $modalOverlay.remove();
        showCloseShiftReport(result);
      } catch (err) {
        $error.textContent = err.message;
        submitting = false;
        $confirmBtn.disabled = false;
      }
    });
  }

  function showCloseShiftReport(result) {
    const diff = result.difference;
    const diffLabel = diff === 0 ? 'Caisse exacte ✅' : diff > 0 ? `Excédent de ${diff} DA` : `Manque de ${Math.abs(diff)} DA`;
    const diffColor = diff === 0 ? 'var(--color-accent)' : 'var(--color-danger)';

    const $modalOverlay = document.createElement('div');
    $modalOverlay.className = 'modal-overlay';
    $modalOverlay.innerHTML = `
      <div class="modal">
        <h3 class="modal__title">📊 Caisse fermée</h3>
        <div class="modal__body">
          <p>Attendu : <strong>${result.expected_cash} DA</strong></p>
          <p>Compté : <strong>${result.counted_cash} DA</strong></p>
          <p style="margin-top:10px; font-weight:700; color:${diffColor};">${diffLabel}</p>
        </div>
        <div class="modal__footer">
          <button class="btn btn--primary" id="close-report-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild($modalOverlay);
    document.getElementById('close-report-ok').addEventListener('click', () => {
      $modalOverlay.remove();
      logout();
    });
  }

  // ===== LOGOUT =====
  async function logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (_) { /* ignore — reload regardless */ }
    window.location.reload();
  }

  // ===== ESCAPE HTML =====
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ===== INIT =====
  async function init() {
    showLoading();
    try {
      const { needed } = await apiFetch('/api/auth/bootstrap-needed');
      if (needed) {
        showBootstrap();
        return;
      }
    } catch (err) {
      $card.innerHTML = `<div class="auth-loading"><span class="auth-logo">⚠️</span><p>${escapeHtml(err.message)}</p></div>`;
      return;
    }

    try {
      const data = await apiFetch('/api/auth/me');
      state.cashier = data.cashier;
      state.shift = data.shift;
      afterAuth();
    } catch (_) {
      showLogin();
    }
  }

  init();
})();

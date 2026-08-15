// ============================================
//  UI HELPERS
//  - Toasts, Sheets, Sync Status, Loading, Confetti
//  + Haptic feedback, Toast actions
// ============================================

function showToast(msg, isError = false, actionText = null, actionCallback = null) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    let html = escapeHtml(msg);
    if (actionText && actionCallback) {
        html += ` <button class="toast-action" onclick="(${actionCallback.toString()})(); hideToast();">${escapeHtml(actionText)}</button>`;
    }

    toast.innerHTML = html;
    toast.className = 'toast' + (isError ? ' error' : '') + (actionText ? ' has-action' : '');
    toast.classList.add('show');

    // Auto-hide after delay; longer if action present
    const delay = actionText ? 6000 : 2800;
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => hideToast(), delay);
}

function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) toast.classList.remove('show');
}

function setSyncStatus(status, text) {
    const bar = document.getElementById('syncBar');
    const txt = document.getElementById('syncText');
    if (!bar || !txt) return;
    bar.className = 'sync-bar ' + status;
    txt.textContent = text;
}

function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.classList.add('hidden');
}

function openSheet(sheetId = 'bottomSheet') {
    const sheet = document.getElementById(sheetId);
    if (sheet) sheet.classList.add('show');
}

function closeSheet(sheetId = 'bottomSheet') {
    const sheet = document.getElementById(sheetId);
    if (sheet) sheet.classList.remove('show');
}

function closeSheetOnOverlay(e, sheetId = 'bottomSheet') {
    if (e.target.classList.contains('overlay')) closeSheet(sheetId);
}

function triggerConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti';
    const colors = ['#fbbf24', '#a78bfa', '#22d3ee', '#f472b6', '#34d399', '#f87171'];
    for (let i = 0; i < 50; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = Math.random() * 2 + 's';
        piece.style.width = (Math.random() * 8 + 6) + 'px';
        piece.style.height = (Math.random() * 8 + 6) + 'px';
        container.appendChild(piece);
    }
    document.body.appendChild(container);
    setTimeout(() => container.remove(), 3500);
}

function hapticFeedback() {
    if (navigator.vibrate) navigator.vibrate(40);
}

// XSS helper (also defined in app.js, but safe duplicate)
function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

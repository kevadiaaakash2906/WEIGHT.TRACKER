// ============================================
//  MAIN APP - Enhanced Private Edition
//  - Validation, Undo, Insights, Themes, Export
// ============================================

let entries = [];
let editingId = null;
let db = null, userId = null, unsubscribe = null;
let isOnline = navigator.onLine;
let pendingSync = false;
let currentTimeFilter = 'all';
let currentTimeOfDay = 'morning';
let lastDeletedEntry = null;
let isSubmitting = false;

function loadSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { heightCm: null, goalWeight: null, unit: 'kg' };
}

function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadLocal() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { try { entries = JSON.parse(raw); } catch(e) { entries = []; } }
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function saveLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function validateEntry(date, weight) {
    const errors = [];
    if (!date) errors.push('Date is required');
    else {
        const d = new Date(date + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (d > today) errors.push('Date cannot be in the future');
        if (d < new Date('1900-01-01')) errors.push('Date seems too old');
    }
    const w = parseFloat(weight);
    if (isNaN(w) || w < 0.1 || w > 300) errors.push('Weight must be between 0.1-300 kg');
    return { valid: errors.length === 0, errors };
}

function initTheme() {
    const saved = localStorage.getItem('weight_tracker_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
}
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('weight_tracker_theme', next);
    updateThemeIcon(next);
    const filtered = filterEntriesByTime(entries, currentTimeFilter);
    renderChart(filtered);
}
function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (!icon) return;
    if (theme === 'light') {
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    } else {
        icon.innerHTML = '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
    }
}

function getLastEntryForTimeOfDay(tod) {
    if (!entries.length) return null;
    for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i][tod] != null) return entries[i][tod];
    }
    return null;
}

function quickAddSameAsYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];
    const yEntry = entries.find(e => e.date === yStr);
    const val = yEntry ? (yEntry[currentTimeOfDay] ?? yEntry.morning ?? yEntry.night) : null;
    if (val != null) {
        document.getElementById('weight').value = val;
        hapticFeedback();
    } else {
        showToast('No entry found for yesterday', true);
    }
}

function quickAddLastEntry() {
    const val = getLastEntryForTimeOfDay(currentTimeOfDay);
    if (val != null) {
        document.getElementById('weight').value = val;
        hapticFeedback();
    } else {
        showToast('No previous entry found', true);
    }
}

function exportCSV() {
    if (!entries.length) { showToast('No data to export', true); return; }
    const rows = [['Date','Morning (kg)','Night (kg)']];
    entries.forEach(e => rows.push([e.date, e.morning ?? '', e.night ?? '']));
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'weight_data_' + new Date().toISOString().split('T')[0] + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('CSV exported');
}

function exportJSON() {
    const data = { version: 1, exportedAt: new Date().toISOString(), entries: entries, settings: loadSettings() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'weight_backup_' + new Date().toISOString().split('T')[0] + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Backup exported');
}

function importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data.entries || !Array.isArray(data.entries)) throw new Error('Invalid backup file');
            if (confirm('Import ' + data.entries.length + ' entries? This will merge with existing data.')) {
                const map = new Map(entries.map(e => [e.date, e]));
                data.entries.forEach(e => {
                    if (e.date && (e.morning != null || e.night != null)) {
                        const existing = map.get(e.date);
                        if (existing) {
                            if (e.morning != null) existing.morning = e.morning;
                            if (e.night != null) existing.night = e.night;
                        } else {
                            map.set(e.date, { id: e.id || Date.now().toString() + Math.random().toString(36).slice(2,5), date: e.date, morning: e.morning ?? null, night: e.night ?? null });
                        }
                    }
                });
                entries = Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
                saveLocal(); renderAll();
                if (data.settings) saveSettings({...loadSettings(), ...data.settings});
                if (db && userId && isOnline) entries.forEach(e => saveToFirestore(e));
                showToast('Backup imported successfully');
            }
        } catch (err) {
            showToast('Import failed: ' + err.message, true);
        }
    };
    input.click();
}

function undoDelete() {
    if (!lastDeletedEntry) return;
    entries.push(lastDeletedEntry);
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveLocal(); renderAll();
    saveToFirestore(lastDeletedEntry);
    lastDeletedEntry = null;
    showToast('Entry restored');
}

function renderInsights() {
    const container = document.getElementById('insightsContainer');
    if (!container) return;
    if (!entries.length) { container.innerHTML = ''; return; }
    const settings = loadSettings();
    const insights = [];
    const streak = getStreak(entries);
    if (streak >= 7) {
        insights.push({ type: 'streak', icon: '\uD83D\uDD25', label: 'Streak', text: streak + '-day logging streak! Keep it up.' });
    }
    const trend = calculateTrendInsight(entries);
    if (trend) {
        let text = '';
        if (trend.direction === 'losing') text = 'You are losing ' + Math.abs(trend.trendPerWeek).toFixed(1) + ' kg/week. Great progress!';
        else if (trend.direction === 'gaining') text = 'Your weight is trending up by ' + trend.trendPerWeek.toFixed(1) + ' kg/week.';
        else text = 'Your weight is stable. Keep consistent!';
        insights.push({ type: trend.direction === 'losing' ? 'positive' : trend.direction === 'gaining' ? 'warning' : 'neutral', icon: '\uD83D\uDCC8', label: 'Trend', text });
    }
    if (settings.goalWeight) {
        const progress = getGoalProgress(entries, settings.goalWeight, settings.heightCm);
        if (progress) {
            if (progress.reached) insights.push({ type: 'success', icon: '\uD83C\uDFAF', label: 'Goal', text: 'You reached your goal weight! \uD83C\uDF89' });
            else if (progress.daysToGoal) insights.push({ type: 'info', icon: '\uD83C\uDFAF', label: 'Goal', text: '~' + progress.daysToGoal + ' days to reach your goal.' });
            else insights.push({ type: 'info', icon: '\uD83C\uDFAF', label: 'Goal', text: progress.remaining.toFixed(1) + ' kg to go.' });
        }
    }
    const alert = getHealthAlert(entries);
    if (alert) insights.push({ type: alert.type, icon: alert.icon, label: 'Alert', text: alert.message });
    container.innerHTML = insights.map(i =>
        '<div class="insight-card ' + i.type + '">' +
            '<div class="insight-icon">' + i.icon + '</div>' +
            '<div class="insight-content">' +
                '<div class="insight-label">' + escapeHtml(i.label) + '</div>' +
                '<div class="insight-text">' + escapeHtml(i.text) + '</div>' +
            '</div>' +
        '</div>'
    ).join('');
}

function setTimeOfDay(tod) {
    currentTimeOfDay = tod;
    const mBtn = document.getElementById('toggleMorning');
    const nBtn = document.getElementById('toggleNight');
    if (mBtn) mBtn.classList.toggle('active', tod === 'morning');
    if (nBtn) nBtn.classList.toggle('active', tod === 'night');
    const label = document.getElementById('weightLabel');
    if (label) label.textContent = 'Weight (' + (tod === 'morning' ? 'Morning' : 'Night') + ') (kg)';
    if (editingId) {
        const e = entries.find(x => x.id === editingId);
        if (e) {
            const val = tod === 'morning' ? e.morning : e.night;
            document.getElementById('weight').value = val != null ? val : '';
        }
    }
}

function isStandalonePWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true ||
           document.referrer.includes('android-app://');
}

function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    const btn = document.getElementById('signInBtn');
    if (btn) { btn.textContent = 'Signing in...'; btn.disabled = true; }

    if (isStandalonePWA()) {
        // iOS/Android PWA: use redirect (popup doesn't work in standalone)
        firebase.auth().signInWithRedirect(provider)
            .catch(err => {
                console.error('Redirect sign-in error:', err);
                if (btn) { btn.textContent = 'Sign In with Google'; btn.disabled = false; }
                showToast('Sign-in failed: ' + err.message, true);
            });
    } else {
        // Desktop / Mobile browser: use popup
        firebase.auth().signInWithPopup(provider)
            .catch(err => {
                console.error('Popup sign-in error:', err);
                if (btn) { btn.textContent = 'Sign In with Google'; btn.disabled = false; }
                showToast('Sign-in failed: ' + err.message, true);
            });
    }
}

function handleLogout() {
    if (confirm('Log out? Your data will remain in the cloud.')) {
        firebase.auth().signOut();
    }
}

function showSignInScreen() {
    hideLoading();
    const existing = document.getElementById('signInScreen');
    if (existing) return;

    const screen = document.createElement('div');
    screen.id = 'signInScreen';
    screen.innerHTML = '<div style="' +
        'position:fixed;inset:0;z-index:999;' +
        'background:var(--bg);' +
        'display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;' +
        'padding:24px;text-align:center;' +
        '">' +
        '<div style="width:64px;height:64px;border-radius:20px;' +
        'background:linear-gradient(135deg,var(--accent),#0ea5e9);' +
        'display:flex;align-items:center;justify-content:center;' +
        'margin-bottom:24px;box-shadow:0 8px30px rgba(34,211,238,.3)">' +
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>' +
        '</svg>' +
        '</div>' +
        '<h2 style="font-size:1.4rem;font-weight:800;margin-bottom:8px;color:var(--text)">Weight Tracker</h2>' +
        '<p style="color:var(--text-muted);font-size:.9rem;margin-bottom:32px;max-width:280px;line-height:1.5">' +
        'Sign in to sync your data across devices and keep it backed up.' +
        '</p>' +
        '<button id="signInBtn" style="' +
        'width:100%;max-width:320px;padding:16px 24px;' +
        'border-radius:16px;border:none;' +
        'background:linear-gradient(135deg,var(--accent),#0ea5e9);' +
        'color:#0f172a;font-size:1rem;font-weight:700;font-family:inherit;' +
        'cursor:pointer;transition:all .2s;' +
        'display:flex;align-items:center;justify-content:center;gap:10px;' +
        '" onclick="signInWithGoogle()">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>' +
        '<polyline points="10 17 15 12 10 7"/>' +
        '<line x1="15" y1="12" x2="3" y2="12"/>' +
        '</svg>' +
        'Sign In with Google' +
        '</button>' +
        '<p style="color:var(--text-muted);font-size:.75rem;margin-top:20px;opacity:.7">' +
        'Your data is private and stored securely.' +
        '</p>' +
        '</div>';
    document.body.appendChild(screen);
}

function hideSignInScreen() {
    const screen = document.getElementById('signInScreen');
    if (screen) screen.remove();
}

function initFirebase() {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true })
        .catch(err => {
            if (err.code === 'failed-precondition') console.log('Persistence: multiple tabs');
            else if (err.code === 'unimplemented') console.log('Persistence not supported');
        });

    // Handle redirect result first (for iOS PWA coming back from Google sign-in)
    firebase.auth().getRedirectResult()
        .then(result => {
            if (result.user) {
                console.log('Redirect sign-in successful');
            }
        })
        .catch(err => {
            console.error('Redirect result error:', err);
            showToast('Sign-in failed: ' + err.message, true);
            const btn = document.getElementById('signInBtn');
            if (btn) { btn.textContent = 'Sign In with Google'; btn.disabled = false; }
        });

    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            userId = user.uid;
            hideSignInScreen();
            document.getElementById('loadingText').textContent = 'Loading your data...';
            listenToFirestore();
        } else {
            userId = null;
            if (unsubscribe) { unsubscribe(); unsubscribe = null; }
            // Show sign-in button instead of auto-redirect
            showSignInScreen();
        }
    });
}

function listenToFirestore() {
    if (!db || !userId) return;
    setSyncStatus('syncing', 'Syncing...');
    unsubscribe = db.collection('users').doc(userId).collection('entries')
        .orderBy('date', 'asc')
        .onSnapshot(snapshot => {
            const fireEntries = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                fireEntries.push({ id: doc.id, date: data.date, morning: data.morning, night: data.night });
            });
            entries = fireEntries;
            saveLocal();
            renderAll();
            setSyncStatus('', 'Synced');
            hideLoading();
        }, err => {
            console.error('Firestore error:', err);
            setSyncStatus('offline', 'Offline — using local data');
            loadLocal();
            renderAll();
            hideLoading();
        });
}

async function saveToFirestore(entry) {
    if (!db || !userId || !isOnline) { pendingSync = true; return; }
    setSyncStatus('syncing', 'Saving...');
    try {
        await db.collection('users').doc(userId).collection('entries').doc(entry.id).set({
            date: entry.date, morning: entry.morning ?? null, night: entry.night ?? null,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        setSyncStatus('', 'Synced');
        pendingSync = false;
    } catch (err) {
        console.error('Save error:', err);
        pendingSync = true;
        setSyncStatus('offline', 'Saved locally — will sync');
    }
}

async function deleteFromFirestore(id) {
    if (!db || !userId || !isOnline) { pendingSync = true; return; }
    setSyncStatus('syncing', 'Deleting...');
    try {
        await db.collection('users').doc(userId).collection('entries').doc(id).delete();
        setSyncStatus('', 'Synced');
        pendingSync = false;
    } catch (err) {
        console.error('Delete error:', err);
        pendingSync = true;
        setSyncStatus('offline', 'Deleted locally — will sync');
    }
}

function renderStats() {
    const settings = loadSettings();
    if (entries.length === 0) {
        document.getElementById('avgMorning').textContent = '--';
        document.getElementById('avgNight').textContent = '--';
        document.getElementById('avgDiff').textContent = '--';
        document.getElementById('entryCount').textContent = '0';
        ['avgMorningSub','avgNightSub','avgDiffSub','streakDisplay'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        document.getElementById('bmiValue').textContent = '--';
        const bmiCat = document.getElementById('bmiCategory');
        if (bmiCat) { bmiCat.textContent = 'Set height'; bmiCat.className = 'bmi-category'; }
        document.getElementById('goalValue').textContent = '--';
        const gp = document.getElementById('goalProgress');
        if (gp) gp.style.width = '0%';
        const gd = document.getElementById('goalDays');
        if (gd) gd.textContent = 'Set a goal';
        return;
    }
    const morningEntries = entries.filter(e => e.morning != null);
    const nightEntries = entries.filter(e => e.night != null);
    const avgM = morningEntries.length > 0 ? morningEntries.reduce((s, e) => s + e.morning, 0) / morningEntries.length : null;
    const avgN = nightEntries.length > 0 ? nightEntries.reduce((s, e) => s + e.night, 0) / nightEntries.length : null;
    const avgD = (avgM != null && avgN != null) ? avgN - avgM : null;
    document.getElementById('avgMorning').textContent = avgM != null ? avgM.toFixed(1) : '--';
    document.getElementById('avgNight').textContent = avgN != null ? avgN.toFixed(1) : '--';
    document.getElementById('avgDiff').textContent = avgD != null ? (avgD >= 0 ? '+' : '') + avgD.toFixed(1) : '--';
    document.getElementById('entryCount').textContent = entries.length;
    const streak = getStreak(entries);
    const streakEl = document.getElementById('streakDisplay');
    if (streakEl) streakEl.innerHTML = streak > 1
        ? '<span class="streak-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' + streak + ' day streak</span>'
        : '';
    const t = getTrend(entries);
    const amSub = document.getElementById('avgMorningSub');
    const anSub = document.getElementById('avgNightSub');
    const adSub = document.getElementById('avgDiffSub');
    if (t) {
        if (amSub) amSub.innerHTML = t.morning == null ? '' : t.morning > 0
            ? '<span class="trend-mini up">&#9650; +' + t.morning.toFixed(1) + '</span>'
            : t.morning < 0 ? '<span class="trend-mini down">&#9660; ' + t.morning.toFixed(1) + '</span>' : '<span class="trend-mini">No change</span>';
        if (anSub) anSub.innerHTML = t.night == null ? '' : t.night > 0
            ? '<span class="trend-mini up">&#9650; +' + t.night.toFixed(1) + '</span>'
            : t.night < 0 ? '<span class="trend-mini down">&#9660; ' + t.night.toFixed(1) + '</span>' : '<span class="trend-mini">No change</span>';
        if (adSub) adSub.textContent = (t.morning != null || t.night != null) ? 'vs last' : '';
    } else {
        if (amSub) amSub.innerHTML = '';
        if (anSub) anSub.innerHTML = '';
        if (adSub) adSub.textContent = '';
    }
    const lastMorningEntry = [...entries].reverse().find(e => e.morning != null);
    const bmiValue = document.getElementById('bmiValue');
    const bmiCategory = document.getElementById('bmiCategory');
    if (settings.heightCm && bmiValue && lastMorningEntry) {
        const bmi = calculateBMI(lastMorningEntry.morning, settings.heightCm);
        if (bmi) {
            bmiValue.textContent = bmi.toFixed(1);
            const cat = getBMICategory(bmi);
            bmiCategory.textContent = cat.label;
            bmiCategory.className = 'bmi-category ' + cat.class;
        }
    } else if (bmiValue) {
        bmiValue.textContent = '--';
        if (bmiCategory) { bmiCategory.textContent = 'Set height'; bmiCategory.className = 'bmi-category'; }
    }
    const goalValue = document.getElementById('goalValue');
    const goalProgress = document.getElementById('goalProgress');
    const goalDays = document.getElementById('goalDays');
    if (settings.goalWeight && goalValue && entries.length > 0) {
        const progress = getGoalProgress(entries, settings.goalWeight, settings.heightCm);
        if (progress) {
            goalValue.textContent = progress.percent + '%';
            if (goalProgress) goalProgress.style.width = progress.percent + '%';
            if (goalDays) {
                if (progress.reached) goalDays.textContent = '\uD83C\uDF89 Goal reached!';
                else if (progress.daysToGoal) goalDays.textContent = '~' + progress.daysToGoal + ' days to goal';
                else goalDays.textContent = progress.remaining.toFixed(1) + ' kg to go';
            }
            if (progress.reached && !settings.goalCelebrated) {
                settings.goalCelebrated = true;
                saveSettings(settings);
                triggerConfetti();
                showToast('\uD83C\uDF89 You reached your goal weight!');
            }
        }
    } else if (goalValue) {
        goalValue.textContent = '--';
        if (goalProgress) goalProgress.style.width = '0%';
        if (goalDays) goalDays.textContent = 'Set a goal';
    }
}

function renderWeekly() {
    const container = document.getElementById('weeklySummary');
    if (!container) return;
    const summary = getWeeklyChange(entries);
    if (!summary) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    const formatChange = (curr, prev) => {
        if (curr == null || prev == null) return '<span class="weekly-item-change neutral">—</span>';
        const diff = curr - prev;
        const arrow = diff > 0 ? '&#9650;' : diff < 0 ? '&#9660;' : '';
        const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
        return '<span class="weekly-item-change ' + cls + '">' + arrow + ' ' + Math.abs(diff).toFixed(1) + '</span>';
    };
    container.innerHTML =
        '<div class="weekly-card">' +
            '<div class="weekly-header">' +
                '<span class="weekly-title">This Week</span>' +
                '<span class="weekly-badge">' + summary.thisWeek.count + ' entries</span>' +
            '</div>' +
            '<div class="weekly-grid">' +
                '<div class="weekly-item">' +
                    '<div class="weekly-item-label">Avg Morning</div>' +
                    '<div class="weekly-item-value">' + (summary.thisWeek.morning != null ? summary.thisWeek.morning.toFixed(1) : '—') + '</div>' +
                    formatChange(summary.thisWeek.morning, summary.lastWeek ? summary.lastWeek.morning : null) +
                '</div>' +
                '<div class="weekly-item">' +
                    '<div class="weekly-item-label">Avg Night</div>' +
                    '<div class="weekly-item-value">' + (summary.thisWeek.night != null ? summary.thisWeek.night.toFixed(1) : '—') + '</div>' +
                    formatChange(summary.thisWeek.night, summary.lastWeek ? summary.lastWeek.night : null) +
                '</div>' +
                '<div class="weekly-item">' +
                    '<div class="weekly-item-label">Avg Diff</div>' +
                    '<div class="weekly-item-value">' + (summary.thisWeek.diff != null ? (summary.thisWeek.diff >= 0 ? '+' : '') + summary.thisWeek.diff.toFixed(1) : '—') + '</div>' +
                    formatChange(summary.thisWeek.diff, summary.lastWeek ? summary.lastWeek.diff : null) +
                '</div>' +
                '<div class="weekly-item">' +
                    '<div class="weekly-item-label">Trend</div>' +
                    '<div class="weekly-item-value" style="font-size:.9rem">' +
                        (summary.lastWeek && summary.thisWeek.morning != null && summary.lastWeek.morning != null
                            ? (summary.thisWeek.morning < summary.lastWeek.morning ? '<span style="color:var(--success)">↓ Losing</span>' : summary.thisWeek.morning > summary.lastWeek.morning ? '<span style="color:var(--danger)">↑ Gaining</span>' : '<span style="color:var(--text-muted)">→ Stable</span>')
                            : '<span style="color:var(--text-muted)">Need more data</span>') +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
}

function renderHistory() {
    const c = document.getElementById('historyList');
    if (!c) return;
    if (entries.length === 0) {
        c.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="M9 14l2 2 4-4"/></svg><p>No entries yet.<br>Tap <strong>+</strong> to add your first weight, or press <kbd>N</kbd></p></div>';
        return;
    }
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    c.innerHTML = [...entries].reverse().map(e => {
        const d = new Date(e.date + 'T00:00:00');
        const diff = (e.morning != null && e.night != null) ? e.night - e.morning : null;
        const dc = diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral';
        const ds = diff > 0 ? '+' : '';
        const safeId = escapeHtml(e.id);
        return '<div class="entry-card">' +
            '<div class="date-section"><div class="day-num">' + d.getDate() + '</div><div class="day-name">' + days[d.getDay()] + '</div></div>' +
            '<div class="weights">' +
                '<div class="weight-block morning"><div class="time-label">Morning</div><div class="weight-val">' + (e.morning != null ? e.morning.toFixed(1) : '<span class="weight-missing">--</span>') + '</div></div>' +
                '<div class="weight-block night"><div class="time-label">Night</div><div class="weight-val">' + (e.night != null ? e.night.toFixed(1) : '<span class="weight-missing">--</span>') + '</div></div>' +
            '</div>' +
            '<div class="diff-section"><div class="diff-val ' + dc + '">' + (diff != null ? ds + diff.toFixed(1) : '--') + '</div><div class="diff-label">kg diff</div></div>' +
            '<div class="actions">' +
                '<button class="btn-icon edit" onclick="event.stopPropagation();editEntry(\'' + safeId + '\')" aria-label="Edit entry"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
                '<button class="btn-icon delete" onclick="event.stopPropagation();deleteEntry(\'' + safeId + '\')" aria-label="Delete entry"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
            '</div>' +
        '</div>';
    }).join('');
}

function renderAll() {
    try {
        renderStats();
        renderWeekly();
        renderInsights();
        renderPhotos();
        const filtered = filterEntriesByTime(entries, currentTimeFilter);
        renderChart(filtered);
        renderHistory();
    } catch (err) {
        console.error('Render error:', err);
        showToast('Display error — check console', true);
    }
}

function openAddSheet() {
    editingId = null;
    currentPhotoBase64 = null;
    removePhoto();
    document.getElementById('sheetTitle').textContent = 'Add Entry';
    document.getElementById('submitBtn').textContent = 'Add';
    document.getElementById('date').valueAsDate = new Date();
    document.getElementById('weight').value = '';
    setTimeOfDay('morning');
    openSheet();
    hapticFeedback();
}

function openSettingsSheet() {
    const settings = loadSettings();
    document.getElementById('settingHeight').value = settings.heightCm || '';
    document.getElementById('settingGoal').value = settings.goalWeight || '';
    const user = firebase.auth().currentUser;
    const email = user ? user.email : 'Not signed in';
    const title = document.querySelector('#settingsSheet .sheet-title');
    if (title) title.textContent = 'Settings — ' + email;
    openSheet('settingsSheet');
}

async function handleSubmit() {
    if (isSubmitting) return;
    const d = document.getElementById('date').value;
    const w = document.getElementById('weight').value;
    const validation = validateEntry(d, w);
    if (!validation.valid) {
        showToast(validation.errors.join(' • '), true);
        return;
    }
    isSubmitting = true;
    const btn = document.getElementById('submitBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
    try {
        const weightVal = parseFloat(w);
        let entryId;
        if (editingId) {
            entryId = editingId;
            const idx = entries.findIndex(e => e.id === editingId);
            if (idx !== -1) {
                entries[idx].date = d;
                if (currentTimeOfDay === 'morning') entries[idx].morning = weightVal;
                else entries[idx].night = weightVal;
                if (currentPhotoBase64) entries[idx].photo = currentPhotoBase64;
            }
            editingId = null;
            showToast('Updated!');
        } else {
            const ex = entries.findIndex(e => e.date === d);
            if (ex !== -1) {
                entryId = entries[ex].id;
                if (currentTimeOfDay === 'morning') entries[ex].morning = weightVal;
                else entries[ex].night = weightVal;
                if (currentPhotoBase64) entries[ex].photo = currentPhotoBase64;
                showToast('Updated!');
            } else {
                entryId = Date.now().toString();
                const newEntry = { id: entryId, date: d, morning: null, night: null, photo: currentPhotoBase64 || null };
                if (currentTimeOfDay === 'morning') newEntry.morning = weightVal;
                else newEntry.night = weightVal;
                entries.push(newEntry);
                showToast('Added!');
            }
        }
        entries.sort((a, b) => new Date(a.date) - new Date(b.date));
        saveLocal();
        currentPhotoBase64 = null;
        removePhoto();
        renderAll();
        await saveToFirestore(entries.find(e => e.id === entryId));
        closeSheet();
    } catch (err) {
        console.error('Submit error:', err);
        showToast('Save failed — try again', true);
    } finally {
        isSubmitting = false;
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function editEntry(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    document.getElementById('date').value = e.date;
    if (e.morning != null) {
        setTimeOfDay('morning');
        document.getElementById('weight').value = e.morning;
    } else if (e.night != null) {
        setTimeOfDay('night');
        document.getElementById('weight').value = e.night;
    } else {
        setTimeOfDay('morning');
        document.getElementById('weight').value = '';
    }
    editingId = id;
    document.getElementById('sheetTitle').textContent = 'Edit Entry';
    document.getElementById('submitBtn').textContent = 'Update';
    openSheet();
}

async function deleteEntry(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    if (!confirm('Delete this entry?')) return;
    lastDeletedEntry = {...entry};
    entries = entries.filter(e => e.id !== id);
    saveLocal();
    renderAll();
    showToast('Deleted', false, 'Undo', undoDelete);
    await deleteFromFirestore(id);
}

function handleSettingsSave() {
    const settings = loadSettings();
    const height = parseFloat(document.getElementById('settingHeight').value);
    const goal = parseFloat(document.getElementById('settingGoal').value);
    if (!isNaN(height) && height > 0) settings.heightCm = height;
    if (!isNaN(goal) && goal > 0) {
        settings.goalWeight = goal;
        settings.goalCelebrated = false;
    }
    saveSettings(settings);
    renderAll();
    closeSheet('settingsSheet');
    showToast('Settings saved');
}

function handleFilterClick(filter) {
    currentTimeFilter = filter;
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    const active = document.querySelector('[data-filter="' + filter + '"]');
    if (active) active.classList.add('active');
    renderAll();
}

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openAddSheet(); }
    if (e.key === 't' || e.key === 'T') { e.preventDefault(); toggleTheme(); }
    if (e.key === 'Escape') { closeSheet(); closeSheet('settingsSheet'); }
});

window.addEventListener('online', () => {
    isOnline = true;
    setSyncStatus('syncing', 'Back online — syncing...');
    if (pendingSync && db && userId) entries.forEach(e => saveToFirestore(e));
});
window.addEventListener('offline', () => {
    isOnline = false;
    setSyncStatus('offline', 'Offline — changes saved locally');
});

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    document.querySelectorAll('#bottomSheet input').forEach(i => {
        i.addEventListener('keypress', e => { if (e.key === 'Enter') handleSubmit(); });
    });
    document.querySelectorAll('#settingsSheet input').forEach(i => {
        i.addEventListener('keypress', e => { if (e.key === 'Enter') handleSettingsSave(); });
    });
    loadLocal();
    renderAll();
    initFirebase();
});


// ============================================
//  PHOTO HANDLING
// ============================================

let currentPhotoBase64 = null;

function handlePhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
        showToast('Photo too large. Max 3MB.', true);
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        currentPhotoBase64 = e.target.result;
        showPhotoPreview(currentPhotoBase64);
        hapticFeedback();
    };
    reader.readAsDataURL(file);
}

function showPhotoPreview(base64) {
    const preview = document.getElementById('photoPreview');
    const placeholder = document.getElementById('photoPlaceholder');
    const img = document.getElementById('photoPreviewImg');
    if (preview && placeholder && img) {
        img.src = base64;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
    }
}

function removePhoto() {
    currentPhotoBase64 = null;
    const preview = document.getElementById('photoPreview');
    const placeholder = document.getElementById('photoPlaceholder');
    const input = document.getElementById('photoInput');
    if (preview) preview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
    if (input) input.value = '';
}

function getPhotoForDate(dateStr) {
    const entry = entries.find(e => e.date === dateStr);
    return entry && entry.photo ? entry.photo : null;
}

function renderPhotos() {
    const grid = document.getElementById('photosGrid');
    const empty = document.getElementById('photosEmpty');
    if (!grid || !empty) return;

    const photos = entries.filter(e => e.photo).sort((a, b) => new Date(b.date) - new Date(a.date));

    if (photos.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'flex';
        return;
    }

    empty.style.display = 'none';
    grid.style.display = 'grid';

    grid.innerHTML = photos.map((e, i) => {
        const d = new Date(e.date + 'T00:00:00');
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const isLatest = i === 0;
        return '<div class="photo-card" onclick="openPhotoCompare(' + i + ')">' +
            '<img src="' + e.photo + '" alt="Progress photo ' + label + '" loading="lazy">' +
            '<div class="photo-card-label">' + label + (isLatest ? ' <span class="photo-latest">Latest</span>' : '') + '</div>' +
        '</div>';
    }).join('');
}

function openPhotoCompare(index) {
    const photos = entries.filter(e => e.photo).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (photos.length < 2) {
        showToast('Need at least 2 photos to compare', true);
        return;
    }
    const after = photos[index];
    const before = photos[index + 1] || photos[photos.length - 1];

    const beforeDate = new Date(before.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const afterDate = new Date(after.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    document.getElementById('compareBeforeLabel').textContent = beforeDate;
    document.getElementById('compareAfterLabel').textContent = afterDate;
    document.getElementById('compareBeforeImg').src = before.photo;
    document.getElementById('compareAfterImg').src = after.photo;
    document.getElementById('photoCompare').style.display = 'block';
    document.getElementById('photosGrid').style.display = 'none';
}

function closePhotoCompare() {
    document.getElementById('photoCompare').style.display = 'none';
    document.getElementById('photosGrid').style.display = 'grid';
}

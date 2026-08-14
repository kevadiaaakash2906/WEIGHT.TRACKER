// ============================================
//  MAIN APP
//  - Firebase, Data, Rendering, Event Handlers
// ============================================

let entries = [];
let editingId = null;
let db = null, userId = null, unsubscribe = null;
let isOnline = navigator.onLine;
let pendingSync = false;
let currentTimeFilter = 'all';

// Settings
function loadSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { heightCm: null, goalWeight: null, unit: 'kg' };
}

function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadLocal() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try { entries = JSON.parse(raw); } catch(e) { entries = []; }
    }
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function saveLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// Firebase
function initFirebase() {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    db.enablePersistence({ synchronizeTabs: true })
        .catch(err => {
            if (err.code === 'failed-precondition') console.log('Persistence: multiple tabs');
            else if (err.code === 'unimplemented') console.log('Persistence not supported');
        });

    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            userId = user.uid;
            document.getElementById('loadingText').textContent = 'Loading your data...';
            listenToFirestore();
        } else {
            firebase.auth().signInAnonymously()
                .catch(err => {
                    console.error('Auth error:', err);
                    document.getElementById('loadingText').textContent = 'Auth failed. Using offline mode.';
                    setTimeout(hideLoading, 1500);
                    setSyncStatus('offline', 'Offline mode');
                    loadLocal();
                    renderAll();
                });
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
            date: entry.date, morning: entry.morning, night: entry.night,
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

// Rendering
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
        return;
    }

    const avgM = entries.reduce((s, e) => s + e.morning, 0) / entries.length;
    const avgN = entries.reduce((s, e) => s + e.night, 0) / entries.length;
    const avgD = avgN - avgM;

    document.getElementById('avgMorning').textContent = avgM.toFixed(1);
    document.getElementById('avgNight').textContent = avgN.toFixed(1);
    document.getElementById('avgDiff').textContent = (avgD >= 0 ? '+' : '') + avgD.toFixed(1);
    document.getElementById('entryCount').textContent = entries.length;

    const streak = getStreak(entries);
    const streakEl = document.getElementById('streakDisplay');
    if (streakEl) streakEl.innerHTML = streak > 1
        ? `<span class="streak-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>${streak} day streak</span>`
        : '';

    const t = getTrend(entries);
    const amSub = document.getElementById('avgMorningSub');
    const anSub = document.getElementById('avgNightSub');
    const adSub = document.getElementById('avgDiffSub');
    if (t) {
        if (amSub) amSub.innerHTML = t.morning > 0
            ? `<span class="trend-mini up">&#9650; +${t.morning.toFixed(1)}</span>`
            : t.morning < 0 ? `<span class="trend-mini down">&#9660; ${t.morning.toFixed(1)}</span>` : '<span class="trend-mini">No change</span>';
        if (anSub) anSub.innerHTML = t.night > 0
            ? `<span class="trend-mini up">&#9650; +${t.night.toFixed(1)}</span>`
            : t.night < 0 ? `<span class="trend-mini down">&#9660; ${t.night.toFixed(1)}</span>` : '<span class="trend-mini">No change</span>';
        if (adSub) adSub.textContent = 'vs last';
    } else {
        if (amSub) amSub.innerHTML = '';
        if (anSub) anSub.innerHTML = '';
        if (adSub) adSub.textContent = '';
    }

    // BMI
    const bmiValue = document.getElementById('bmiValue');
    const bmiCategory = document.getElementById('bmiCategory');
    if (settings.heightCm && bmiValue && entries.length > 0) {
        const bmi = calculateBMI(entries[entries.length - 1].morning, settings.heightCm);
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

    // Goal
    const goalValue = document.getElementById('goalValue');
    const goalProgress = document.getElementById('goalProgress');
    const goalDays = document.getElementById('goalDays');
    if (settings.goalWeight && goalValue && entries.length > 0) {
        const progress = getGoalProgress(entries, settings.goalWeight, settings.heightCm);
        if (progress) {
            goalValue.textContent = progress.percent + '%';
            if (goalProgress) goalProgress.style.width = progress.percent + '%';
            if (goalDays) {
                if (progress.reached) goalDays.textContent = '?? Goal reached!';
                else if (progress.daysToGoal) goalDays.textContent = `~${progress.daysToGoal} days to goal`;
                else goalDays.textContent = `${progress.remaining.toFixed(1)} kg to go`;
            }
            if (progress.reached && !settings.goalCelebrated) {
                settings.goalCelebrated = true;
                saveSettings(settings);
                triggerConfetti();
                showToast('?? You reached your goal weight!');
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
    if (!summary) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';

    const formatChange = (curr, prev) => {
        if (!prev) return '<span class="weekly-item-change neutral">—</span>';
        const diff = curr - prev;
        const arrow = diff > 0 ? '&#9650;' : diff < 0 ? '&#9660;' : '';
        const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
        return `<span class="weekly-item-change ${cls}">${arrow} ${Math.abs(diff).toFixed(1)}</span>`;
    };

    container.innerHTML = `
        <div class="weekly-card">
            <div class="weekly-header">
                <span class="weekly-title">This Week</span>
                <span class="weekly-badge">${summary.thisWeek.count} entries</span>
            </div>
            <div class="weekly-grid">
                <div class="weekly-item">
                    <div class="weekly-item-label">Avg Morning</div>
                    <div class="weekly-item-value">${summary.thisWeek.morning.toFixed(1)}</div>
                    ${formatChange(summary.thisWeek.morning, summary.lastWeek ? summary.lastWeek.morning : null)}
                </div>
                <div class="weekly-item">
                    <div class="weekly-item-label">Avg Night</div>
                    <div class="weekly-item-value">${summary.thisWeek.night.toFixed(1)}</div>
                    ${formatChange(summary.thisWeek.night, summary.lastWeek ? summary.lastWeek.night : null)}
                </div>
                <div class="weekly-item">
                    <div class="weekly-item-label">Avg Diff</div>
                    <div class="weekly-item-value">${(summary.thisWeek.diff >= 0 ? '+' : '') + summary.thisWeek.diff.toFixed(1)}</div>
                    ${formatChange(summary.thisWeek.diff, summary.lastWeek ? summary.lastWeek.diff : null)}
                </div>
                <div class="weekly-item">
                    <div class="weekly-item-label">Trend</div>
                    <div class="weekly-item-value" style="font-size:.9rem">
                        ${summary.lastWeek ? (summary.thisWeek.morning < summary.lastWeek.morning ? '<span style="color:var(--success)">? Losing</span>' : summary.thisWeek.morning > summary.lastWeek.morning ? '<span style="color:var(--danger)">? Gaining</span>' : '<span style="color:var(--text-muted)">? Stable</span>') : '<span style="color:var(--text-muted)">Need more data</span>'}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderHistory() {
    const c = document.getElementById('historyList');
    if (!c) return;
    if (entries.length === 0) {
        c.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><path d="M9 14l2 2 4-4"/></svg><p>No entries yet.<br>Tap + to add your first weight!</p></div>`;
        return;
    }
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    c.innerHTML = [...entries].reverse().map(e => {
        const d = new Date(e.date + 'T00:00:00');
        const diff = e.night - e.morning;
        const dc = diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral';
        const ds = diff > 0 ? '+' : '';
        return `<div class="entry-card">
            <div class="date-section"><div class="day-num">${d.getDate()}</div><div class="day-name">${days[d.getDay()]}</div></div>
            <div class="weights">
                <div class="weight-block morning"><div class="time-label">Morning</div><div class="weight-val">${e.morning.toFixed(1)}</div></div>
                <div class="weight-block night"><div class="time-label">Night</div><div class="weight-val">${e.night.toFixed(1)}</div></div>
            </div>
            <div class="diff-section"><div class="diff-val ${dc}">${ds}${diff.toFixed(1)}</div><div class="diff-label">kg diff</div></div>
            <div class="actions">
                <button class="btn-icon edit" onclick="event.stopPropagation();editEntry('${e.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button class="btn-icon delete" onclick="event.stopPropagation();deleteEntry('${e.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
        </div>`;
    }).join('');
}

function renderAll() {
    renderStats();
    renderWeekly();
    const filtered = filterEntriesByTime(entries, currentTimeFilter);
    renderChart(filtered);
    renderHistory();
}

// Actions
async function handleSubmit() {
    const d = document.getElementById('date').value;
    const m = parseFloat(document.getElementById('morning').value);
    const n = parseFloat(document.getElementById('night').value);
    if (!d || isNaN(m) || isNaN(n)) { showToast('Fill all fields', true); return; }

    let entryId;
    if (editingId) {
        entryId = editingId;
        const idx = entries.findIndex(e => e.id === editingId);
        if (idx !== -1) entries[idx] = { id: editingId, date: d, morning: m, night: n };
        editingId = null;
        showToast('Updated!');
    } else {
        const ex = entries.findIndex(e => e.date === d);
        if (ex !== -1) {
            if (!confirm('Entry exists for this date. Overwrite?')) return;
            entryId = entries[ex].id;
            entries[ex] = { id: entryId, date: d, morning: m, night: n };
            showToast('Updated!');
        } else {
            entryId = Date.now().toString();
            entries.push({ id: entryId, date: d, morning: m, night: n });
            showToast('Added!');
        }
    }
    entries.sort((a, b) => new Date(a.date) - new Date(b.date));
    saveLocal();
    renderAll();
    await saveToFirestore({ id: entryId, date: d, morning: m, night: n });
    closeSheet();
}

function editEntry(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return;
    document.getElementById('date').value = e.date;
    document.getElementById('morning').value = e.morning;
    document.getElementById('night').value = e.night;
    editingId = id;
    document.getElementById('sheetTitle').textContent = 'Edit Entry';
    document.getElementById('submitBtn').textContent = 'Update';
    openSheet();
}

async function deleteEntry(id) {
    if (!confirm('Delete this entry?')) return;
    entries = entries.filter(e => e.id !== id);
    saveLocal();
    renderAll();
    showToast('Deleted');
    await deleteFromFirestore(id);
}

function handleSettingsSave() {
    const settings = loadSettings();
    const height = parseFloat(document.getElementById('settingHeight').value);
    const goal = parseFloat(document.getElementById('settingGoal').value);
    if (!isNaN(height) && height > 0) settings.heightCm = height;
    if (!isNaN(goal) && goal > 0) {
        settings.goalWeight = goal;
        settings.goalCelebrated = false; // reset celebration
    }
    saveSettings(settings);
    renderAll();
    closeSheet('settingsSheet');
    showToast('Settings saved');
}

function handleFilterClick(filter) {
    currentTimeFilter = filter;
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    const active = document.querySelector(`[data-filter="${filter}"]`);
    if (active) active.classList.add('active');
    renderAll();
}

// Init
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
    document.getElementById('date').valueAsDate = new Date();
    document.querySelectorAll('input').forEach(i => {
        i.addEventListener('keypress', e => { if (e.key === 'Enter') handleSubmit(); });
    });
    loadLocal();
    renderAll();
    initFirebase();
});
// ============================================
//  MAIN APP
// ============================================

let entries = [];
let editingId = null;
let db = null, userId = null, unsubscribe = null;
let isOnline = navigator.onLine;
let pendingSync = false;
let currentTimeFilter = 'all';
let currentTimeOfDay = 'morning';

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

// Time-of-day toggle
function setTimeOfDay(tod) {
    currentTimeOfDay = tod;
    const mBtn = document.getElementById('toggleMorning');
    const nBtn = document.getElementById('toggleNight');
    if (mBtn) mBtn.classList.toggle('active', tod === 'morning');
    if (nBtn) nBtn.classList.toggle('active', tod === 'night');
    
    const label = document.getElementById('weightLabel');
    if (label) label.textContent = `Weight (${tod === 'morning' ? 'Morning' : 'Night'}) (kg)`;
    
    if (editingId) {
        const e = entries.find(x => x.id === editingId);
        if (e) {
            const val = tod === 'morning' ? e.morning : e.night;
            document.getElementById('weight').value = val != null ? val : '';
        }
    }
}

// Auth
function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
        .catch(err => {
            console.error('Sign-in error:', err);
            showToast('Sign-in failed', true);
        });
}

function handleLogout() {
    if (confirm('Log out? Your data will remain in the cloud.')) {
        firebase.auth().signOut();
    }
}

function showAuthScreen() {
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('fabBtn').style.display = 'none';
}

function showApp() {
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('authOverlay').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('fabBtn').style.display = 'flex';
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
            showApp();
            document.getElementById('loadingText').textContent = 'Loading your data...';
            listenToFirestore();
        } else {
            userId = null;
            if (unsubscribe) { unsubscribe(); unsubscribe = null; }
            showAuthScreen();
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
                fireEntries.push({ 
                    id: doc.id, 
                    date: data.date, 
                    morning: data.morning, 
                    night: data.night 
                });
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
            date: entry.date, 
            morning: entry.morning ?? null, 
            night: entry.night ?? null,
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
        ? `<span class="streak-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>${streak} day streak</span>`
        : '';

    const t = getTrend(entries);
    const amSub = document.getElementById('avgMorningSub');
    const anSub = document.getElementById('avgNightSub');
    const adSub = document.getElementById('avgDiffSub');
    if (t) {
        if (amSub) amSub.innerHTML = t.morning == null ? '' : t.morning > 0
            ? `<span class="trend-mini up">&#9650; +${t.morning.toFixed(1)}</span>`
            : t.morning < 0 ? `<span class="trend-mini down">&#9660; ${t.morning.toFixed(1)}</span>` : '<span class="trend-mini">No change</span>';
        if (anSub) anSub.innerHTML = t.night == null ? '' : t.night > 0
            ? `<span class="trend-mini up">&#9650; +${t.night.toFixed(1)}</span>`
            : t.night < 0 ? `<span class="trend-mini down">&#9660; ${t.night.toFixed(1)}</span>` : '<span class="trend-mini">No change</span>';
        if (adSub) adSub.textContent = (t.morning != null || t.night != null) ? 'vs last' : '';
    } else {
        if (amSub) amSub.innerHTML = '';
        if (anSub) anSub.innerHTML = '';
        if (adSub) adSub.textContent = '';
    }

    const lastMorningEntry = [...entries].reverse().find(e => e.morning != null);
    const bmiValue = document.getElementById('bmiValue');
    const bmiCategory = document.getElementById('bmiCategory');
    if

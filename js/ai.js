const WORKER_URL = 'https://weight-tracker.kevadiaaakash.workers.dev/';

async function getAICoachAdvice(entries, settings) {
    if (!entries || entries.length < 3) {
        return { text: 'Log at least 3 days of data to unlock the AI coach.', type: 'neutral' };
    }
    try {
        const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries, settings })
        });
        if (!res.ok) throw new Error('Worker error');
        return await res.json();
    } catch (err) {
        console.error('AI coach error:', err);
        return { text: 'AI coach unavailable. Check your connection.', type: 'neutral' };
    }
}

async function renderAICoach() {
    const card = document.getElementById('insightCard');
    const icon = document.getElementById('insightIcon');
    const text = document.getElementById('insightText');
    const settings = loadSettings();

    card.className = 'insight-card info';
    icon.textContent = '🤖';
    text.textContent = 'Analyzing your trends...';

    const advice = await getAICoachAdvice(entries, settings);
    
    card.className = 'insight-card ' + advice.type;
    icon.textContent = advice.type === 'positive' ? '🔥' : advice.type === 'warning' ? '⚡' : '🤖';
    text.textContent = advice.text;
}

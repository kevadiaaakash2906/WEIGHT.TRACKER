// ============================================
//  AI COACH - Via Cloudflare Worker
// ============================================

(function() {
    'use strict';
    
    const WORKER_URL = 'https://weight-tracker.kevadiaaakash.workers.dev';

    window.getAICoachAdvice = async function(entries, settings) {
        console.log('[AI] Called with', entries.length, 'entries');
        if (!entries || entries.length < 3) {
            return { text: 'Log at least 3 days of data to unlock the AI coach.', type: 'neutral' };
        }
        try {
            const res = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries, settings })
            });
            console.log('[AI] Worker status:', res.status);
            if (!res.ok) throw new Error('Worker returned ' + res.status);
            const data = await res.json();
            console.log('[AI] Response:', data);
            return data;
        } catch (err) {
            console.error('[AI] Fetch failed:', err);
            return { text: 'AI coach unavailable. Check your connection.', type: 'neutral' };
        }
    };

    window.renderAICoach = async function() {
        console.log('[AI] renderAICoach clicked');
        const card = document.getElementById('insightCard');
        const icon = document.getElementById('insightIcon');
        const text = document.getElementById('insightText');
        if (!card || !icon || !text) {
            console.error('[AI] Missing DOM elements');
            return;
        }
        const settings = loadSettings();
        
        card.className = 'insight-card info';
        icon.textContent = '🤖';
        text.textContent = 'Analyzing your trends...';

        const advice = await window.getAICoachAdvice(entries, settings);
        
        card.className = 'insight-card ' + advice.type;
        icon.textContent = advice.type === 'positive' ? '🔥' : advice.type === 'warning' ? '⚡' : '🤖';
        text.textContent = advice.text;
        console.log('[AI] Done:', advice.text);
    };
})();

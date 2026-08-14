// ============================================
//  CHART RENDERING with Time Filters
// ============================================

let chartInstance = null;

function renderChart(entries) {
    const ctx = document.getElementById('weightChart');
    if (!ctx) return;
    const context = ctx.getContext('2d');

    if (chartInstance) chartInstance.destroy();
    if (!entries || entries.length === 0) return;

    const labels = entries.map(e => {
        const d = new Date(e.date + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const morningData = entries.map(e => e.morning !== null && e.morning !== undefined ? e.morning : null);
    const nightData = entries.map(e => e.night !== null && e.night !== undefined ? e.night : null);

    chartInstance = new Chart(context, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Morning',
                    data: morningData,
                    borderColor: '#fbbf24',
                    backgroundColor: (ctx) => {
                        const c = ctx.chart.ctx;
                        const g = c.createLinearGradient(0, 0, 0, 210);
                        g.addColorStop(0, 'rgba(251,191,36,.12)');
                        g.addColorStop(1, 'rgba(251,191,36,0)');
                        return g;
                    },
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#fbbf24',
                    pointBorderColor: '#0c0f1a',
                    pointBorderWidth: 3,
                    pointHoverRadius: 6,
                    tension: .4,
                    fill: true,
                    spanGaps: true
                },
                {
                    label: 'Night',
                    data: nightData,
                    borderColor: '#a78bfa',
                    backgroundColor: (ctx) => {
                        const c = ctx.chart.ctx;
                        const g = c.createLinearGradient(0, 0, 0, 210);
                        g.addColorStop(0, 'rgba(167,139,250,.12)');
                        g.addColorStop(1, 'rgba(167,139,250,0)');
                        return g;
                    },
                    borderWidth: 3,
                    pointRadius: 4,
                    pointBackgroundColor: '#a78bfa',
                    pointBorderColor: '#0c0f1a',
                    pointBorderWidth: 3,
                    pointHoverRadius: 6,
                    tension: .4,
                    fill: true,
                    spanGaps: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(12,15,26,.95)',
                    titleColor: '#f1f5f9',
                    bodyColor: '#f1f5f9',
                    borderColor: 'rgba(255,255,255,.08)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 14,
                    displayColors: true,
                    titleFont: { size: 12, weight: '700' },
                    bodyFont: { size: 11 },
                    callbacks: {
                        label: c => {
                            const val = c.parsed.y;
                            return val !== null ? c.dataset.label + ': ' + val.toFixed(1) + ' kg' : null;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,.03)', drawBorder: false },
                    ticks: { color: '#64748b', font: { size: 10, family: 'Inter' }, maxRotation: 45, minRotation: 45 }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,.03)', drawBorder: false },
                    ticks: { color: '#64748b', font: { size: 10, family: 'Inter' } }
                }
            }
        }
    });
}

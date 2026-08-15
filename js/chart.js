// ============================================
//  CHART RENDERING with Time Filters
//  + Theme-aware colors
// ============================================

let chartInstance = null;

function getChartColors() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    return {
        morning: '#fbbf24',
        night: '#a78bfa',
        morningFillStart: isDark ? 'rgba(251,191,36,.12)' : 'rgba(251,191,36,.18)',
        morningFillEnd: isDark ? 'rgba(251,191,36,0)' : 'rgba(251,191,36,0)',
        nightFillStart: isDark ? 'rgba(167,139,250,.12)' : 'rgba(167,139,250,.18)',
        nightFillEnd: isDark ? 'rgba(167,139,250,0)' : 'rgba(167,139,250,0)',
        grid: isDark ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.06)',
        ticks: isDark ? '#64748b' : '#475569',
        tooltipBg: isDark ? 'rgba(12,15,26,.95)' : 'rgba(255,255,255,.95)',
        tooltipText: isDark ? '#f1f5f9' : '#1e293b',
        tooltipBorder: isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)',
        pointBorder: isDark ? '#0c0f1a' : '#ffffff'
    };
}

function renderChart(entries) {
    const ctx = document.getElementById('weightChart');
    if (!ctx) return;
    const context = ctx.getContext('2d');
    const colors = getChartColors();

    if (chartInstance) chartInstance.destroy();
    if (!entries || entries.length === 0) return;

    const labels = entries.map(e => {
        const d = new Date(e.date + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const morningData = entries.map(e => e.morning !== null && e.morning !== undefined ? e.morning : null);
    const nightData = entries.map(e => e.night !== null && e.night !== undefined ? e.night : null);

    // Goal line
    const settings = typeof loadSettings === 'function' ? loadSettings() : {};
    const goalWeight = settings.goalWeight || null;
    const datasets = [
        {
            label: 'Morning',
            data: morningData,
            borderColor: colors.morning,
            backgroundColor: (ctx) => {
                const c = ctx.chart.ctx;
                const g = c.createLinearGradient(0, 0, 0, 210);
                g.addColorStop(0, colors.morningFillStart);
                g.addColorStop(1, colors.morningFillEnd);
                return g;
            },
            borderWidth: 3,
            pointRadius: 4,
            pointBackgroundColor: colors.morning,
            pointBorderColor: colors.pointBorder,
            pointBorderWidth: 3,
            pointHoverRadius: 6,
            tension: .4,
            fill: true,
            spanGaps: true
        },
        {
            label: 'Night',
            data: nightData,
            borderColor: colors.night,
            backgroundColor: (ctx) => {
                const c = ctx.chart.ctx;
                const g = c.createLinearGradient(0, 0, 0, 210);
                g.addColorStop(0, colors.nightFillStart);
                g.addColorStop(1, colors.nightFillEnd);
                return g;
            },
            borderWidth: 3,
            pointRadius: 4,
            pointBackgroundColor: colors.night,
            pointBorderColor: colors.pointBorder,
            pointBorderWidth: 3,
            pointHoverRadius: 6,
            tension: .4,
            fill: true,
            spanGaps: true
        }
    ];

    // Add goal line dataset if goal is set
    if (goalWeight) {
        datasets.push({
            label: 'Goal',
            data: new Array(labels.length).fill(goalWeight),
            borderColor: 'rgba(244,114,182,.5)',
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
            tension: 0,
            order: 0
        });
    }

    chartInstance = new Chart(context, {
        type: 'line',
        data: {
            labels,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: colors.tooltipBg,
                    titleColor: colors.tooltipText,
                    bodyColor: colors.tooltipText,
                    borderColor: colors.tooltipBorder,
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 14,
                    displayColors: true,
                    titleFont: { size: 12, weight: '700' },
                    bodyFont: { size: 11 },
                    callbacks: {
                        label: c => {
                            const val = c.parsed.y;
                            if (c.dataset.label === 'Goal') return 'Goal: ' + val.toFixed(1) + ' kg';
                            return val !== null ? c.dataset.label + ': ' + val.toFixed(1) + ' kg' : null;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: colors.grid, drawBorder: false },
                    ticks: { color: colors.ticks, font: { size: 10, family: 'Inter' }, maxRotation: 45, minRotation: 45 }
                },
                y: {
                    grid: { color: colors.grid, drawBorder: false },
                    ticks: { color: colors.ticks, font: { size: 10, family: 'Inter' } }
                }
            }
        }
    });
}

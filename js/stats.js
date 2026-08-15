// ============================================
//  STATS CALCULATIONS
//  - Averages, Streak, Trend, BMI, Weekly Summary, Goal Progress
//  + Trend Insights, Health Alerts
// ============================================

function getStreak(entries) {
    if (!entries || entries.length === 0) return 0;
    const dates = entries.map(e => e.date).sort();
    let streak = 1;
    for (let i = dates.length - 1; i > 0; i--) {
        const c = new Date(dates[i] + 'T00:00:00');
        const p = new Date(dates[i - 1] + 'T00:00:00');
        if ((c - p) / (1000 * 60 * 60 * 24) === 1) streak++;
        else break;
    }
    return streak;
}

function getTrend(entries) {
    if (!entries || entries.length < 2) return null;
    const withMorning = entries.filter(e => e.morning !== null && e.morning !== undefined);
    const withNight = entries.filter(e => e.night !== null && e.night !== undefined);
    const result = {};
    if (withMorning.length >= 2) {
        result.morning = withMorning[withMorning.length - 1].morning - withMorning[withMorning.length - 2].morning;
    } else {
        result.morning = null;
    }
    if (withNight.length >= 2) {
        result.night = withNight[withNight.length - 1].night - withNight[withNight.length - 2].night;
    } else {
        result.night = null;
    }
    return result;
}

function getWeeklyChange(entries) {
    if (!entries || entries.length === 0) return null;
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const thisWeek = entries.filter(e => {
        const d = new Date(e.date + 'T00:00:00');
        return d >= oneWeekAgo && d <= now;
    });
    const lastWeek = entries.filter(e => {
        const d = new Date(e.date + 'T00:00:00');
        return d >= twoWeeksAgo && d < oneWeekAgo;
    });

    if (thisWeek.length === 0) return null;

    const thisMorning = thisWeek.filter(e => e.morning !== null);
    const thisNight = thisWeek.filter(e => e.night !== null);
    const lastMorning = lastWeek.filter(e => e.morning !== null);
    const lastNight = lastWeek.filter(e => e.night !== null);

    const thisAvgM = thisMorning.length > 0 ? thisMorning.reduce((s, e) => s + e.morning, 0) / thisMorning.length : null;
    const thisAvgN = thisNight.length > 0 ? thisNight.reduce((s, e) => s + e.night, 0) / thisNight.length : null;
    const thisAvgDiff = (thisAvgM !== null && thisAvgN !== null) ? thisAvgN - thisAvgM : null;

    let lastAvgM = null, lastAvgN = null, lastAvgDiff = null;
    if (lastWeek.length > 0) {
        lastAvgM = lastMorning.length > 0 ? lastMorning.reduce((s, e) => s + e.morning, 0) / lastMorning.length : null;
        lastAvgN = lastNight.length > 0 ? lastNight.reduce((s, e) => s + e.night, 0) / lastNight.length : null;
        lastAvgDiff = (lastAvgM !== null && lastAvgN !== null) ? lastAvgN - lastAvgM : null;
    }

    return {
        thisWeek: { morning: thisAvgM, night: thisAvgN, diff: thisAvgDiff, count: thisWeek.length },
        lastWeek: lastWeek.length > 0 ? { morning: lastAvgM, night: lastAvgN, diff: lastAvgDiff, count: lastWeek.length } : null
    };
}

function calculateBMI(weightKg, heightCm) {
    if (!weightKg || !heightCm || heightCm <= 0 || weightKg <= 0) return null;
    const heightM = heightCm / 100;
    return weightKg / (heightM * heightM);
}

function getBMICategory(bmi) {
    if (bmi < 18.5) return { label: 'Underweight', class: 'bmi-underweight' };
    if (bmi < 25) return { label: 'Normal', class: 'bmi-normal' };
    if (bmi < 30) return { label: 'Overweight', class: 'bmi-overweight' };
    return { label: 'Obese', class: 'bmi-obese' };
}

function getGoalProgress(entries, goalWeight, heightCm) {
    if (!entries || entries.length === 0 || !goalWeight) return null;

    const morningEntries = entries.filter(e => e.morning !== null && e.morning !== undefined);
    if (morningEntries.length === 0) return null;

    const current = morningEntries[morningEntries.length - 1].morning;
    const first = morningEntries[0].morning;

    const totalChange = current - first;
    const remaining = current - goalWeight;
    const direction = goalWeight < first ? 'lose' : 'gain';
    const totalDistance = Math.abs(goalWeight - first);
    const progressDistance = Math.abs(current - first);

    let percent = 0;
    if (totalDistance > 0) {
        percent = Math.min(100, Math.max(0, (progressDistance / totalDistance) * 100));
        if (direction === 'lose' && current <= goalWeight) percent = 100;
        if (direction === 'gain' && current >= goalWeight) percent = 100;
    }

    let daysToGoal = null;
    if (morningEntries.length >= 7) {
        const weekly = getWeeklyChange(entries);
        if (weekly && weekly.lastWeek && weekly.thisWeek.morning !== null && weekly.lastWeek.morning !== null) {
            const weeklyChange = weekly.thisWeek.morning - weekly.lastWeek.morning;
            if (weeklyChange !== 0) {
                // Fixed: use (goal - current) / weeklyChange for correct sign handling
                const weeksToGoal = (goalWeight - current) / weeklyChange;
                if (weeksToGoal > 0) daysToGoal = Math.round(weeksToGoal * 7);
            }
        }
    }

    const reached = direction === 'lose' ? current <= goalWeight : current >= goalWeight;

    return {
        current,
        goal: goalWeight,
        first,
        percent: Math.round(percent),
        remaining: Math.abs(remaining),
        direction,
        daysToGoal,
        reached,
        totalChange
    };
}

function filterEntriesByTime(entries, filter) {
    if (!entries || filter === 'all') return entries;
    const now = new Date();
    const days = { '7d': 7, '30d': 30, '90d': 90 };
    const cutoff = new Date(now.getTime() - days[filter] * 24 * 60 * 60 * 1000);
    return entries.filter(e => new Date(e.date + 'T00:00:00') >= cutoff);
}

// ============================================
//  NEW: Advanced Insights
// ============================================

function calculateTrendInsight(entries) {
    if (!entries || entries.length < 14) return null;
    const morningOnly = entries.filter(e => e.morning !== null && e.morning !== undefined);
    if (morningOnly.length < 14) return null;

    const n = morningOnly.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = morningOnly.map(e => e.morning);

    const xMean = x.reduce((a, b) => a + b, 0) / n;
    const yMean = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
        numerator += (x[i] - xMean) * (y[i] - yMean);
        denominator += (x[i] - xMean) ** 2;
    }

    if (denominator === 0) return null;
    const slope = numerator / denominator; // kg per entry
    const slopePerWeek = slope * 7;

    return {
        trendPerDay: slope,
        trendPerWeek: slopePerWeek,
        direction: slopePerWeek < -0.05 ? 'losing' : slopePerWeek > 0.05 ? 'gaining' : 'stable',
        confidencePercent: Math.min(100, Math.max(0, (n / 30) * 100))
    };
}

function getHealthAlert(entries) {
    if (!entries || entries.length < 7) return null;
    const summary = getWeeklyChange(entries);
    if (!summary || !summary.lastWeek) return null;

    const curr = summary.thisWeek.morning;
    const prev = summary.lastWeek.morning;
    if (curr == null || prev == null) return null;

    const diff = curr - prev;
    if (diff >= 2) {
        return {
            type: 'warning',
            icon: '⚠️',
            message: `Weight up ${diff.toFixed(1)} kg from last week. Check hydration & sodium intake.`
        };
    }
    if (diff <= -2) {
        return {
            type: 'positive',
            icon: '🎉',
            message: `Great progress! Down ${Math.abs(diff).toFixed(1)} kg from last week.`
        };
    }
    return null;
}

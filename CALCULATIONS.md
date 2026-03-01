# Frysmart — Calculations Reference

Every formula, derived value and aggregation in the codebase, with the screen(s) that use it.

---

## 1. Trial Weekly Average (Litres/Week)

**Function:** `calcTrialWeeklyAvg`
**Files:** BDMTrialsView.jsx (line ~185), TrialDetailModal.jsx (line ~28)

```js
// 1. Get fresh fills only (oilAge === 1 && litresFilled > 0)
const fills = readings.filter(r =>
  r.venueId === venueId && r.oilAge === 1 && r.litresFilled > 0
);

// 2. Sum litres
const totalLitres = fills.reduce((sum, r) => sum + r.litresFilled, 0);

// 3. Days elapsed (capped at trial end date)
const cap = trialEndDate ? Math.min(new Date(), new Date(trialEndDate)) : new Date();
const daysElapsed = Math.max(1, Math.floor((cap - start) / 86400000));

// 4. Weekly average (rounded to 1 decimal)
return Math.round((totalLitres / daysElapsed) * 7 * 10) / 10;
```

**Used on:**
- BDM → Pipeline / Active / Pending / Manage cards (litres/week display)
- Trial Detail Modal → Savings table
- End Trial Modal → Oil usage summary

---

## 2. Volume Bracket

**Function:** `calcVolumeBracket`
**File:** BDMTrialsView.jsx (line ~176)

```js
if (litres < 60)  return 'under-60';
if (litres < 100) return '60-100';
if (litres < 150) return '100-150';
return '150-plus';
```

**Used on:**
- BDM → All trial card headers (VolumePill badge)
- Admin → Trial Analysis → Trials by Volume matrix

---

## 3. Savings Calculations

**Files:** TrialDetailModal.jsx (line ~54), EndTrialModal.jsx (line ~596), BDMTrialsView.jsx (manage detail)

### Weekly Litres Saved
```js
weekLitres = Math.round((preTrialAvg - liveTrialAvg) * 10) / 10
```
- `preTrialAvg` = venue's `currentWeeklyAvg` (pre-trial baseline)
- `liveTrialAvg` = `calcTrialWeeklyAvg()` during/after trial

### Annual Litres Saved
```js
annualLitres = Math.round(weekLitres * 52)
```

### Weekly Spend Saved
```js
weekSpend = Math.round(
  (preTrialAvg * currentPrice - liveTrialAvg * trialPrice) * 100
) / 100
```
- `currentPrice` = `currentPricePerLitre` (competitor price)
- `trialPrice` = `offeredPricePerLitre` (Cookers price)

### Annual Spend Saved
```js
annualSpend = Math.round(weekSpend * 52)
```

**Used on:**
- BDM → Manage → Trial detail → Savings table
- Trial Detail Modal → Savings section
- End Trial Modal → Summary before closing

---

## 4. Oil Usage Breakdown

**File:** EndTrialModal.jsx (line ~585), TrialDetailModal.jsx

### Fresh Fills
```js
count  = readings.filter(r => r.oilAge === 1 && r.litresFilled > 0).length
litres = readings.filter(r => r.oilAge === 1 && r.litresFilled > 0)
           .reduce((sum, r) => sum + (parseFloat(r.litresFilled) || 0), 0)
```

### Top-ups
```js
count  = readings.filter(r => r.oilAge > 1 && r.litresFilled > 0).length
litres = readings.filter(r => r.oilAge > 1 && r.litresFilled > 0)
           .reduce((sum, r) => sum + (parseFloat(r.litresFilled) || 0), 0)
```

### System Total
```js
totalLitres = freshLitres + topUpLitres
```

**Used on:**
- End Trial Modal → Oil usage summary card
- Trial Detail Modal → TPM statistics section

---

## 5. Days Between / Duration

**File:** BDMTrialsView.jsx (line ~163)

```js
function daysBetween(a, b) {
  const start = new Date(a), end = new Date(b);
  return Math.round((end - start) / 86400000);
}
```

**Used on:**
- BDM → All trial cards (duration display, e.g. "7d")
- BDM → Dashboard → Avg Decision Time
- Admin → Trial Analysis matrices

---

## 6. Auto End Date

**File:** BDMTrialsView.jsx (new trial form)

```js
// When start date changes:
const endDate = new Date(startDate);
endDate.setDate(endDate.getDate() + systemSettings.trialDuration);
```

**Used on:**
- BDM → New Trial form (auto-populates end date from system trial_duration setting)

---

## 7. BDM Dashboard KPIs (last 90 days)

**File:** BDMTrialsView.jsx (Dashboard tab, line ~1750)

### Win Rate
```js
const decided = venues.filter(v => v.trialStatus === 'won' || v.trialStatus === 'lost'
  || v.trialStatus === 'accepted');
const won = decided.filter(v => v.trialStatus === 'won' || v.trialStatus === 'accepted');
winRate = decided.length > 0 ? Math.round((won.length / decided.length) * 100) : 0;
// Display: "{winRate}%"
```

### Avg Decision Time
```js
// For each decided trial with outcomeDate and trialEndDate:
const days = daysBetween(v.trialEndDate, v.outcomeDate);
avgDecision = Math.round(sum / count);
// Display: "{avgDecision}d"
```

### Avg Sold $/L
```js
const withSold = decided.filter(v => v.soldPricePerLitre > 0);
avgSold = (withSold.reduce((s, v) => s + v.soldPricePerLitre, 0) / withSold.length).toFixed(2);
// Display: "${avgSold}"
```

### Trials / Month
```js
// Count trials created in last 90 days, divide by 3
trialsPerMonth = Math.round(recentTrials.length / 3);
```

### Avg Discount
```js
// For trials with both offered and sold prices:
const discount = ((v.offeredPricePerLitre - v.soldPricePerLitre) / v.offeredPricePerLitre) * 100;
avgDiscount = Math.round(sum / count);
// Display: "{avgDiscount}%"
```

**Used on:**
- BDM → Dashboard → Row 1 (5 stat cards)

---

## 8. BDM Dashboard Insight Tables

**File:** BDMTrialsView.jsx (Dashboard tab, line ~1860)

### Competitors Trialled
```js
// Count trials per competitor (from venue's current oil competitor name)
const compCounts = {};
venues.forEach(v => {
  if (v.competitorName) compCounts[v.competitorName] = (compCounts[v.competitorName] || 0) + 1;
});
// Per competitor: won count, lost count
// Sorted by total trial count descending
```

### Win Reasons (proportional bars)
```js
const wonReasonCounts = {};
venues.filter(v => v.trialStatus === 'won' || v.trialStatus === 'accepted')
  .forEach(v => {
    if (v.trialReason) wonReasonCounts[v.trialReason] = (wonReasonCounts[v.trialReason] || 0) + 1;
  });
// Bar width: (count / maxCount) * 100 + '%'
// Colour: green (#d1fae5 bg)
```

### Loss Reasons (proportional bars)
```js
const lostReasonCounts = {};
venues.filter(v => v.trialStatus === 'lost')
  .forEach(v => {
    if (v.trialReason) lostReasonCounts[v.trialReason] = (lostReasonCounts[v.trialReason] || 0) + 1;
  });
// Bar width: (count / maxCount) * 100 + '%'
// Colour: red (#fee2e2 bg)
```

**Used on:**
- BDM → Dashboard → Row 2 (3 insight table cards)

---

## 9. BDM Dashboard Action Items

**File:** BDMTrialsView.jsx (Dashboard tab)

```js
awaitingStart   = venues.filter(v => v.trialStatus === 'pending').length
awaitingRecord  = venues.filter(v => v.trialStatus === 'in-progress' && !hasReadingToday(v))
awaitingDecision = venues.filter(v => v.trialStatus === 'completed').length
awaitingCode    = venues.filter(v => v.trialStatus === 'accepted').length
```

**Used on:**
- BDM → Dashboard → Row 3 (4 action item cards)

---

## 10. TPM Statistics

**File:** TrialDetailModal.jsx (line ~389)

### Generic Average Helper
```js
const avg = (arr) => arr.length > 0
  ? arr.reduce((a, b) => a + b, 0) / arr.length
  : null;
```

### Specific Metrics
```js
avgOilAge       = avg(oilAgeVals).toFixed(1)          // days
avgTPM          = avg(tpmVals).toFixed(1)              // %
minTPM          = Math.min(...tpmVals)                 // %
maxTPM          = Math.max(...tpmVals)                 // %
avgSetTemp      = Math.round(avg(setTempVals))         // °C
avgActualTemp   = Math.round(avg(actTempVals))         // °C
avgTempVariance = avg(tempVariances).toFixed(1)         // °C
totalLitres     = litreVals.reduce((a, b) => a + b, 0) // L
```

### Temperature Variance (per reading)
```js
variance = Math.abs(actualTemperature - setTemperature)
```

**Used on:**
- Trial Detail Modal → TPM Stats section
- BDM → Manage → Trial detail

---

## 11. Compliance Rate

**File:** GroupManagerView.jsx (line ~830), VenueStaffView.jsx

### Daily Compliance (per month)
```js
const uniqueDays = new Set(monthReadings.map(r => r.date)).size;
compliance = Math.round((uniqueDays / expectedDays) * 100);
// expectedDays = daysInMonth (past months) or dayOfMonth (current month)
```

### Weekly Compliance (30-day window)
```js
const daysWithRecs = new Set(last30DaysReadings.map(r => r.date)).size;
weeklyCompliance = Math.round((daysWithRecs / 7) * 100);
```

### Yearly Compliance (average of active months)
```js
const activeMonths = months.filter(m => m.pastDays > 0);
yearlyCompliance = Math.round(
  activeMonths.reduce((s, m) => s + m.compliance, 0) / activeMonths.length
);
```

**Used on:**
- Group Manager → Venue detail → Compliance section
- Venue Staff → Overview → Compliance display
- Admin → Overview → TPM Recording Health

---

## 12. Oil Change Timing

**File:** GroupManagerView.jsx (line ~844)

```js
// Compare consecutive days' TPM values per fryer
const prevMax = Math.max(...previousDayTPMs);

if (prevMax > criticalThreshold) {
  if (currentTPM <= criticalThreshold) changedOnTime++;
  else changedLate++;
} else if (currentTPM < prevMax) {
  changedEarly++;
}
```

**Used on:**
- Group Manager → Venue detail → Oil change health metrics

---

## 13. Filter Rate

**Files:** GroupManagerView.jsx (line ~834), VenueStaffView.jsx

```js
filterRate = Math.round((filteredCount / totalReadingCount) * 100);
```

**Used on:**
- Group Manager → Venue detail → Filter compliance
- Venue Staff → Overview → Filter rate display

---

## 14. Temperature Variance (Percentage)

**File:** GroupManagerView.jsx, VenueStaffView.jsx

```js
variancePercent = Math.abs(((actualTemp - setTemp) / setTemp) * 100);

// Colour coding:
// ≤ 3%  → green (#059669)
// ≤ 7%  → amber (#d97706)
// > 7%  → red (#dc2626)
```

**Used on:**
- Group Manager → Venue detail → Temperature cards
- Venue Staff → Overview → Temperature section

---

## 15. Admin Dashboard KPIs

**File:** FrysmartAdminPanel.jsx (line ~2200)

### Active Calendars
```js
activeCalendars = groups.filter(g => g.status === 'active').length
```

### Active Trials
```js
activeTrials = venues.filter(v =>
  !['won', 'lost'].includes(v.trialStatus)
).length
```

### Customer Groups
```js
customerGroups = groups.length  // total groups
```

### Active Users
```js
activeUsers = profiles.filter(p => p.status === 'active').length
```

**Used on:**
- Admin → Overview → 4 KPI cards (row 1)

---

## 16. Admin Breakdown Cards

**File:** FrysmartAdminPanel.jsx

### Calendars by State
```js
states.forEach(state => {
  count = groups.filter(g => g.venues.some(v => v.state === state)).length
});
```

### Trials by State
```js
states.forEach(state => {
  count = venues.filter(v => v.state === state && v.trialStatus).length
});
```

### Trials by Competitor
```js
competitors.forEach(comp => {
  count = venues.filter(v => v.competitorName === comp).length
});
```

### Trials by BDM
```js
bdms.forEach(bdm => {
  count = venues.filter(v => v.bdmId === bdm.id).length
});
```

**Used on:**
- Admin → Overview → 4 breakdown cards (row 2)

---

## 17. Admin Trial Analysis Matrices

**File:** FrysmartAdminPanel.jsx (Trial Analysis tab)

### Matrix Structure (all 4 matrices)
```js
// Rows: grouping dimension (BDM, Competitor, State, Volume)
// Columns: trial statuses (Pipeline, Active, Pending, Awaiting Code, Successful, Unsuccessful)
// Cells: count of trials matching row + column
// Row totals: sum of all status counts
// Column totals: sum of all group counts per status
```

### Trials by Volume
```js
const bracket = calcVolumeBracket(venue.avgLitresPerWeek);
matrix[bracket][status]++;
```

**Used on:**
- Admin → Trial Analysis → 4 cross-tab matrices

---

## 18. Trial Status Counts

**File:** FrysmartAdminPanel.jsx (line ~2213)

```js
const statusCounts = {
  pending:       baseFiltered.filter(v => v.trialStatus === 'pending').length,
  'in-progress': baseFiltered.filter(v => v.trialStatus === 'in-progress').length,
  completed:     baseFiltered.filter(v => v.trialStatus === 'completed').length,
  accepted:      baseFiltered.filter(v => v.trialStatus === 'accepted').length,
  won:           baseFiltered.filter(v => v.trialStatus === 'won').length,
  lost:          baseFiltered.filter(v => v.trialStatus === 'lost').length,
};
```

**Used on:**
- Admin → Trials → 6 status filter pills (with counts)
- BDM → Tab badges (count per tab)

---

## 19. Trial & Prospect ID Generation

**File:** BDMTrialsView.jsx

```js
// Trial IDs
nextTrialId = `TRL-${String(trialCount + 1).padStart(4, '0')}`;
// → TRL-0001, TRL-0002, ...

// Prospect codes
nextProspectCode = `PRS-${String(prospectCount + 1).padStart(4, '0')}`;
// → PRS-0001, PRS-0002, ...
```

**Used on:**
- BDM → New Trial form (auto-generated)

---

## 20. Competitor Pill Colour (Luminance)

**File:** badges.jsx (line ~113)

```js
const hex = color.replace('#', '');
const r = parseInt(hex.substr(0, 2), 16);
const g = parseInt(hex.substr(2, 2), 16);
const b = parseInt(hex.substr(4, 2), 16);

const bgColor   = `rgba(${r},${g},${b},0.15)`;
const luminance  = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const textColor  = luminance > 0.75 ? '#1f2937' : color;
```

**Used on:**
- All CompetitorPill badges across BDM and Admin views

---

## 21. Quarterly Period Calculation

**File:** GroupManagerView.jsx (line ~815), VenueStaffView.jsx (line ~1685)

```js
const qMonth = Math.floor(selectedDate.getMonth() / 3) * 3;  // 0, 3, 6, 9
const qLabel = `Q${Math.floor(qMonth / 3) + 1} ${selectedDate.getFullYear()}`;
// → "Q1 2026", "Q2 2026", etc.
```

**Used on:**
- Group Manager → Quarterly compliance view
- Venue Staff → Quarterly calendar view

---

## 22. Relative Date Formatting

**File:** FrysmartAdminPanel.jsx (line ~63)

```js
const daysAgo = Math.floor((new Date() - dateObj) / 86400000);
if (daysAgo === 0)  return 'today';
if (daysAgo < 7)    return `${daysAgo}d ago`;
if (daysAgo < 30)   return `${Math.floor(daysAgo / 7)}w ago`;
return displayDate(date);  // fallback to DD/MM/YY
```

**Used on:**
- Admin → User management → Last active column
- Admin → Group management → Last TPM date column

---

## 23. TPM Threshold Colour Mapping

**File:** badgeConfig.js (line ~81), system_settings (configurable)

```js
// Default thresholds (configurable in Admin → Configuration → TPM Thresholds)
warning_threshold  = 18   // configurable
critical_threshold = 24   // configurable

// Display thresholds (hardcoded in UI for badge colours)
if (tpm <= 14)  → good    (green  #10b981)
if (tpm <= 18)  → warning (amber  #f59e0b)
if (tpm >= 19)  → critical (red   #ef4444)
```

**Used on:**
- All TPM reading displays (Group Manager, Venue Staff, Trial Detail Modal)
- Calendar cell colours
- BDM → Manage → Per-fryer calendar view

---

## 24. Price Formatting

**Used everywhere prices appear:**

```js
parseFloat(value).toFixed(2)   // → "2.45"
// Display: "$2.45/L"
```

**Used on:**
- BDM → Trial cards (current $/L, offered $/L, sold $/L)
- BDM → Manage → Trial detail
- Admin → Trials table
- New Trial form, Edit Trial form, End Trial form

---

## 25. Performance Target Comparison

**File:** BDMTrialsView.jsx (Dashboard), system_settings

```js
// Targets loaded from system_settings:
targetWinRate             = 75      // %
targetAvgTimeToDecision   = 14      // days
targetSoldPricePerLitre   = 2.50    // $
targetTrialsPerMonth      = 12      // count

// Dashboard stat cards show actual vs target implicitly
// (targets used as benchmarks, no explicit comparison UI yet)
```

**Used on:**
- Admin → Configuration → Performance Targets (edit)
- BDM → Dashboard → Stat cards (context)

---

## Summary

| # | Calculation | Screens |
|---|------------|---------|
| 1 | Trial Weekly Avg L/wk | BDM cards, Trial Detail, End Trial |
| 2 | Volume Bracket | BDM cards, Admin matrices |
| 3 | Savings (litres + spend) | Manage detail, Trial Detail, End Trial |
| 4 | Oil Usage Breakdown | End Trial, Trial Detail |
| 5 | Days Between | BDM cards, Dashboard KPIs, Admin |
| 6 | Auto End Date | New Trial form |
| 7 | BDM KPIs (5 stats) | BDM Dashboard |
| 8 | Insight Tables (3) | BDM Dashboard |
| 9 | Action Items (4) | BDM Dashboard |
| 10 | TPM Statistics | Trial Detail Modal |
| 11 | Compliance Rate | Group Mgr, Venue Staff, Admin |
| 12 | Oil Change Timing | Group Mgr venue detail |
| 13 | Filter Rate | Group Mgr, Venue Staff |
| 14 | Temp Variance % | Group Mgr, Venue Staff |
| 15 | Admin KPIs (4) | Admin Overview |
| 16 | Breakdown Counts (4) | Admin Overview |
| 17 | Trial Matrices (4) | Admin Trial Analysis |
| 18 | Status Counts | Admin Trials, BDM tabs |
| 19 | ID Generation | New Trial form |
| 20 | Competitor Luminance | All CompetitorPills |
| 21 | Quarterly Period | Group Mgr, Venue Staff |
| 22 | Relative Date | Admin tables |
| 23 | TPM Thresholds | All TPM displays |
| 24 | Price Formatting | All price displays |
| 25 | Performance Targets | Admin Config, BDM Dashboard |

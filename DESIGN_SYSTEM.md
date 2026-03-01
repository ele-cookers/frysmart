# Frysmart Design System

Internal reference for all styling decisions, extracted from the production codebase.

Source files: `badgeConfig.js`, `badges.jsx`, `BDMTrialsView.jsx`, `FrysmartAdminPanel.jsx`, `GroupManagerView.jsx`, `VenueStaffView.jsx`, `Login.jsx`, `TrialDetailModal.jsx`

---

## 1. Brand & Theme

| Token | Value | Usage |
|-------|-------|-------|
| Brand Primary | `#1a428a` | Header bg, focused inputs, primary buttons, icons |
| Brand Dark | `#0d2147` | Login page background |
| Brand Orange | `#f5a623` | Login CTA button, secondary accent |
| Page BG | `#f8fafc` | All page backgrounds |
| White | `#ffffff` | Cards, modals, inputs |

```js
THEME = {
  brand: '#1a428a',
  brandDark: '#0d2147',
  bg: '#f8fafc',
  white: '#ffffff',
  text: '#1f2937',
  textMuted: '#64748b',
  textFaint: '#94a3b8',
  border: '#e2e8f0',
}
```

---

## 2. Colour Palette

### Text
| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#1f2937` | Body text, headings, values |
| Muted | `#64748b` | Labels, secondary text |
| Faint | `#94a3b8` | Timestamps, disabled text |
| Very Faint | `#cbd5e1` | Placeholder-level text |

### Backgrounds
| Token | Value | Usage |
|-------|-------|-------|
| White | `#ffffff` | Cards, modals |
| Slate-50 | `#f8fafc` | Page bg, input bg |
| Slate-100 | `#f1f5f9` | Hover bg, empty states, filter bg |

### Borders
| Token | Value | Usage |
|-------|-------|-------|
| Default | `#e2e8f0` | Card borders, input borders |
| Light | `#f1f5f9` | Dividers between rows |
| Muted | `#cbd5e1` | Stronger separators |

### Status (Traffic Light)
| Status | Primary | Light BG | Dark Text | Usage |
|--------|---------|----------|-----------|-------|
| Good/Success | `#10b981` | `#d1fae5` | `#065f46` | Won, healthy, green TPM |
| Warning/Amber | `#f59e0b` | `#fef3c7` | `#92400e` | Accepted, warning TPM |
| Critical/Error | `#ef4444` | `#fee2e2` | `#991b1b` | Lost, critical TPM |
| Info/Blue | `#3b82f6` | `#dbeafe` | `#1e40af` | Active, in-progress |
| Neutral | `#94a3b8` | `#f1f5f9` | `#64748b` | Pipeline, pending |

### TPM Colours
| Range | Colour | Label |
|-------|--------|-------|
| 0-14 | `#10b981` (green) | Oil quality good |
| 15-18 | `#f59e0b` (amber) | Recommended to change |
| 19+ | `#ef4444` (red) | Must change oil |
| No reading | `#94a3b8` (grey) | No reading |

---

## 3. Trial Status Colours

```js
TRIAL_STATUS_COLORS = {
  'pending':     { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1', accent: '#94a3b8', label: 'Pipeline' },
  'in-progress': { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd', accent: '#3b82f6', label: 'Active' },
  'completed':   { bg: '#fef3c7', text: '#a16207', border: '#fde047', accent: '#fbbf24', label: 'Pending' },
  'accepted':    { bg: '#fef3c7', text: '#92400e', border: '#fde68a', accent: '#f59e0b', label: 'Accepted' },
  'won':         { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', accent: '#10b981', label: 'Successful' },
  'lost':        { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', accent: '#ef4444', label: 'Unsuccessful' },
}
```

---

## 4. State Colours (Australian States)

### Badge Colours (light backgrounds)
| State | Text | Background |
|-------|------|------------|
| VIC | `#0369a1` | `#e0f2fe` |
| NSW | `#dc2626` | `#fee2e2` |
| QLD | `#7c3aed` | `#ede9fe` |
| SA | `#a16207` | `#fef9c3` |
| WA | `#ea580c` | `#fff7ed` |
| TAS | `#15803d` | `#dcfce7` |
| NT | `#64748b` | `#f1f5f9` |
| ACT | `#64748b` | `#f1f5f9` |
| H/O | `#1a428a` | `#e8eef6` |

### Plain State Colours (charts, dots)
| State | Colour |
|-------|--------|
| VIC | `#0ea5e9` |
| NSW | `#ef4444` |
| QLD | `#8b5cf6` |
| SA | `#eab308` |
| WA | `#f97316` |
| TAS | `#22c55e` |

---

## 5. Role Colours

### Light Background (cards, lists)
| Role | Text | Background | Border |
|------|------|------------|--------|
| Admin | `#9d174d` | `#fce7f3` | `#f9a8d4` |
| MGT/C-Suite | `#991b1b` | `#fee2e2` | `#fca5a5` |
| State Mgr | `#92400e` | `#fef3c7` | `#fcd34d` |
| NAM | `#1e40af` | `#dbeafe` | `#93c5fd` |
| BDM | `#065f46` | `#d1fae5` | `#6ee7b7` |
| Staff | `#9a3412` | `#ffedd5` | `#fdba74` |
| Group Mgr | `#6d28d9` | `#ede9fe` | `#c4b5fd` |

### Header Bar (translucent, on dark blue `#1a428a`)
| Role | Background | Text | Border |
|------|------------|------|--------|
| Admin | `rgba(236,72,153,0.25)` | `#f9a8d4` | `rgba(236,72,153,0.4)` |
| Group Mgr | `rgba(139,92,246,0.25)` | `#c4b5fd` | `rgba(139,92,246,0.4)` |
| Venue | `rgba(249,115,22,0.25)` | `#ff8c00` | `rgba(249,115,22,0.5)` |

---

## 6. Oil Tier Colours

### Cookers Oils
| Tier | Text | Background | Border |
|------|------|------------|--------|
| Elite (ULTAFRY) | `#0a8a9e` | `#e6f9ff` | `#33ccff` |
| Premium (XLFRY) | `#cc4400` | `#fff0eb` | `#ff6633` |
| Standard (Canola) | `#5a7a1a` | `#f0f9e8` | `#99cc33` |

### Competitor Oils
| Tier | Text | Background | Border |
|------|------|------------|--------|
| Standard | `#64748b` | `#f1f5f9` | `#cbd5e1` |
| Premium | `#64748b` | `#e2e8f0` | `#94a3b8` |
| Elite | `#1f2937` | `#cbd5e1` | `#64748b` |

---

## 7. Volume Bracket Colours

| Bracket | Key | Colour |
|---------|-----|--------|
| Under 60L | `under-60` | `#10b981` (green) |
| 60-100L | `60-100` | `#eab308` (amber) |
| 100-150L | `100-150` | `#f97316` (orange) |
| 150L+ | `150-plus` | `#ef4444` (red) |

VolumePill uses transparency: `background: ${color}18` (10%), `border: ${color}40` (25%)

---

## 8. Typography

### Font Family
```
Inter, -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif
```

### Scale
| Size | Weight | Usage |
|------|--------|-------|
| 36px | 700 | Large stat values (Group Manager) |
| 28px | 700 | Admin stat values |
| 24px | 800 | Section stat values |
| 22px | 700 | Page title |
| 20px | 800 | BDM stat values, modal title |
| 18px | 700 | Section header, venue name |
| 16px | 600 | Login inputs, body headings |
| 14px | 500-600 | Body text, standard inputs |
| 13px | 600 | Compact inputs, form labels, button text |
| 12px | 500-600 | Secondary text, table cells, list items |
| 11px | 600-700 | Badge text, uppercase labels, pills, captions |
| 10px | 700 | Table headers, tiny badges, uppercase micro labels |
| 9px | 600 | Subtitles under stats, very small captions |

### Weights
| Weight | Usage |
|--------|-------|
| 400 | Regular body text |
| 500 | Input values, medium emphasis |
| 600 | Labels, button text, semi-bold emphasis |
| 700 | Headings, badge text, bold labels |
| 800 | Stat values, extra bold numbers |

### Letter Spacing
| Value | Usage |
|-------|-------|
| `0.3px` | Standard uppercase labels |
| `0.5px` | Badge text, wider uppercase |

---

## 9. Spacing

### Padding
| Context | Value |
|---------|-------|
| Cards | `16px` |
| Admin cards (desktop) | `16px 20px` |
| Modals (content) | `12px 16px` |
| Login card | `32px 28px 28px` |
| Inputs (standard) | `10px 12px` |
| Inputs (login) | `14px 16px` |
| Inputs (compact) | `8px 10px` |
| Buttons (standard) | `8px 12px` |
| Buttons (compact) | `5px 10px` |
| Buttons (login) | `14px` |
| Badges | `2px 8px` (pill) or `2px 0` (fixed-width) |
| Filter pills | `3px 8px` |

### Gap
| Context | Value |
|---------|-------|
| Grid (standard) | `12px` |
| Grid (compact) | `8px` |
| Grid (column-only) | `0 16px` |
| Flex (wide) | `16px-24px` |
| Flex (standard) | `12px` |
| Flex (tight) | `6px-8px` |
| Badge clusters | `4px-6px` |
| Calendar cells | `2px` |

### Margin Between Sections
| Context | Value |
|---------|-------|
| Major sections | `16px-20px` |
| Form fields | `10px-14px` |
| Label to input | `6px-8px` |
| Stat label to value | `2px` |

---

## 10. Borders, Shadows & Radii

### Border Radius
| Context | Value |
|---------|-------|
| Modals | `16px` |
| Login card | `24px` |
| Cards | `12px` |
| Buttons (pill) | `20px` |
| Buttons (standard) | `8px` |
| Inputs | `8px` |
| Inputs (login) | `12px` |
| Badges (pill) | `20px` |
| Badges (square) | `6px` |
| Code badges | `8px` |
| Calendar cells | `6px` |
| Circles | `50%` |

### Box Shadow
| Variant | Value | Usage |
|---------|-------|-------|
| Subtle | `0 1px 3px rgba(0,0,0,0.1)` | Standard cards |
| Elevated | `0 2px 8px rgba(0,0,0,0.1)` | Elevated cards |
| Modal | `0 20px 60px rgba(0,0,0,0.2)` | Modals, login card |
| Dropdown | `0 8px 24px rgba(0,0,0,0.12)` | Dropdown menus |

### Border Widths
| Context | Value |
|---------|-------|
| Cards | `1px solid #e2e8f0` |
| Inputs | `1.5px solid #e2e8f0` |
| Inputs (login, focused) | `2px solid #1a428a` |
| Left accent (status) | `4px solid ${accent}` |
| Divider rows | `1px solid #f1f5f9` |

---

## 11. Components

### Card
```js
{
  background: '#ffffff',
  borderRadius: '12px',
  padding: '16px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
}
```
Accent variant adds: `borderLeft: '4px solid ${statusColor}'`

### Modal Overlay
```js
{
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
  padding: '20px',
}
```

### Modal Container
```js
{
  background: '#ffffff',
  borderRadius: '16px',
  width: '100%',
  maxWidth: '480px',        // small: 480, medium: 600, large: 95vw
  maxHeight: '90vh',
  overflowY: 'auto',
  overflowX: 'hidden',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
}
```

### Input (Standard)
```js
{
  width: '100%',
  maxWidth: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1.5px solid #e2e8f0',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#ffffff',
  color: '#1f2937',
  fontFamily: 'inherit',
  fontWeight: '500',
}
// Focus: borderColor '#1a428a'
// Blur: borderColor '#e2e8f0'
```

### Input (Login)
```js
{
  width: '100%',
  padding: '14px 16px',
  fontSize: '16px',
  border: '2px solid #e2e8f0',      // focused: '#1a428a'
  borderRadius: '12px',
  background: '#f8fafc',             // focused: '#f8faff'
  color: '#0f172a',
  transition: 'all 0.2s ease',
}
```

### Select Dropdown
```js
{
  ...inputStyle,
  WebkitAppearance: 'none',
  appearance: 'none',
  backgroundImage: 'url("data:image/svg+xml,[chevron SVG]")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: '32px',
  cursor: 'pointer',
}
```

### Label (Uppercase)
```js
{
  fontSize: '11px',
  fontWeight: '700',
  color: '#64748b',
  letterSpacing: '0.3px',
  display: 'block',
  marginBottom: '6px',
  textTransform: 'uppercase',
}
```

### Button (Primary)
```js
{
  padding: '8px 12px',
  background: '#1a428a',
  border: 'none',
  borderRadius: '20px',            // pill style
  fontSize: '12px',
  fontWeight: '600',
  color: '#ffffff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
}
```

### Button (Secondary)
```js
{
  padding: '8px 12px',
  background: '#ffffff',
  border: '1.5px solid #e2e8f0',
  borderRadius: '20px',
  fontSize: '12px',
  fontWeight: '600',
  color: '#94a3b8',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
}
```

### Button (Login CTA)
```js
{
  width: '100%',
  padding: '14px',
  background: '#f5a623',
  border: 'none',
  borderRadius: '12px',
  fontSize: '16px',
  fontWeight: '600',
  color: '#ffffff',
  transition: 'all 0.2s ease',
}
// Disabled: background '#94a3b8', cursor 'not-allowed'
```

### Button (Compact Action)
```js
{
  padding: '5px 10px',
  background: '#1a428a',
  border: 'none',
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: '600',
  color: '#ffffff',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
}
```

### Error Message
```js
{
  padding: '12px 16px',
  borderRadius: '12px',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  fontSize: '13px',
  color: '#991b1b',
  fontWeight: '500',
}
```

---

## 12. Badge Components

All badges: `display: 'inline-block'`, `whiteSpace: 'nowrap'`, `verticalAlign: 'middle'`, `textAlign: 'center'`

### TrialStatusBadge
`width: 82px` | `borderRadius: 20px` | `fontSize: 10px` | `fontWeight: 700` | `padding: 2px 0`

### OilBadge
`minWidth: 68px` | `borderRadius: 20px` | `fontSize: 10px` | `fontWeight: 700` | `padding: 2px 8px`

### StateBadge
`width: 42px` | `borderRadius: 6px` | `fontSize: 10px` | `fontWeight: 700` | `padding: 2px 0`

### RoleBadge
`minWidth: 90px` | `borderRadius: 20px` | `fontSize: 10px` | `fontWeight: 700` | `padding: 2px 0`

### StatusBadge (Active/Inactive)
`minWidth: 68px` | `borderRadius: 20px` | `fontSize: 10px` | `fontWeight: 700` | `padding: 2px 0`

### CodeBadge
`minWidth: 42px` | `borderRadius: 8px` | `fontSize: 11px` | `fontWeight: 600` | `padding: 2px 0`

### VolumePill
`width: 82px` | `borderRadius: 20px` | `fontSize: 10px` | `fontWeight: 700` | `padding: 2px 0`

### CompetitorPill
`borderRadius: 6px` | `fontSize: 11px` | `fontWeight: 600` | `padding: 2px 8px`
Dynamic colour from competitor's RGB with 15% opacity bg, luminance-based text contrast.

---

## 13. Table Styles

```css
.admin-table thead th {
  padding: 7px 10px;
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  background: #f8fafc;
  border-bottom: 2px solid #e2e8f0;
}

.admin-table tbody td {
  padding: 6px 10px;
  font-size: 12px;
  color: #1f2937;
  border-bottom: 1px solid #f1f5f9;
}

.admin-table tbody tr:hover {
  background: #eef2ff;
}

/* Compact variant */
.admin-table.trials-compact thead th { padding: 6px 7px; font-size: 9px; }
.admin-table.trials-compact tbody td { padding: 5px 7px; font-size: 11px; }
```

---

## 14. Responsive

### Breakpoint
```js
const isDesktop = window.innerWidth >= 768;
```

### Grid Columns by Breakpoint
| Desktop | Mobile |
|---------|--------|
| `repeat(5, 1fr)` | `repeat(2, 1fr)` |
| `repeat(4, 1fr)` | `repeat(2, 1fr)` |
| `repeat(3, 1fr)` | `1fr` |
| `1fr 1fr` | `1fr` |

### Layout Differences
| Element | Desktop | Mobile |
|---------|---------|--------|
| Navigation | Sidebar 240px | Tab bar + hamburger |
| Content padding | `20px 24px` | `14px` |
| Max content width | `1400px` | Full width |
| Cards | Multi-column grid | Stacked |
| Modals | Up to `95vw` | `100%` (with 20px padding) |
| Tables | Full table | Card view or horizontal scroll |

---

## 15. Z-Index Scale

| Layer | Value |
|-------|-------|
| Modals & overlays | `2000` |
| Critical alerts | `2001` |
| Navigation sidebar | `200-210` |
| Sticky headers | `20` |
| Default | `1` |

---

## 16. AppBar / Header

### Desktop Header
```js
{
  flexShrink: 0,
  zIndex: 100,
  background: '#1a428a',
  padding: '6px 16px',
  maxWidth: '1400px',
  margin: '0 auto',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}
```

### Mobile Header
```js
{
  flexDirection: 'column',
  gap: '0px',
  padding: '0',
  background: '#1a428a',
}
```

### Header Role Badge
```js
{
  padding: '2px 8px',
  borderRadius: '6px',
  fontSize: '10px',
  fontWeight: '700',
  letterSpacing: '0.5px',
  // Colours from HEADER_BADGE_COLORS in badgeConfig.js
}
```

### Hamburger Menu Button (Mobile)
```js
{
  background: 'rgba(255,255,255,0.15)',
  border: 'none',
  borderRadius: '10px',
  width: '38px',
  height: '38px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
// Menu lines: 3× { width: '18px', height: '2px', background: 'white', borderRadius: '1px' } with gap: '5px'
```

---

## 17. Sidebar / Navigation Drawer

### Desktop Sidebar
```js
{
  width: '240px',
  flexShrink: 0,
  background: 'white',
  borderRight: '1px solid #e2e8f0',
  padding: '20px 12px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
}
```

### Sidebar Section Background
```js
{
  background: '#f0f4fa',
  borderRadius: '10px',
  padding: '6px',
  marginBottom: '14px',
}
```

### Sidebar Button (Inactive)
```js
{
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  background: 'transparent',
  color: '#1a428a',
  fontWeight: '600',
  fontSize: '13px',
  transition: 'all 0.15s',
}
```

### Sidebar Button (Active)
```js
{
  background: '#1a428a',
  color: 'white',
  fontWeight: '600',
}
```

### Sidebar Count Badge
```js
{
  marginLeft: 'auto',
  fontSize: '11px',
  fontWeight: '700',
  background: 'rgba(255,255,255,0.2)',
  color: 'white',
  padding: '2px 8px',
  borderRadius: '10px',
  minWidth: '20px',
  textAlign: 'center',
}
```

---

## 18. Tab Navigation

### Main Tabs (Underline Variant — Desktop)
```js
// Container
{
  display: 'flex',
  borderBottom: '1px solid #1a428a',
  background: 'white',
  padding: '12px 0',
}

// Tab Button (Inactive)
{
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
  padding: '11px 8px',
  border: 'none',
  background: 'transparent',
  borderBottom: '3px solid transparent',
  color: '#64748b',
  fontSize: '13px',
  fontWeight: '500',
  cursor: 'pointer',
  transition: 'all 0.15s',
}

// Tab Button (Active)
{
  borderBottom: '3px solid #1a428a',
  color: '#1a428a',
  fontWeight: '700',
}
```

### Sub-Tabs (Pill Variant — Calendar, Config)
```js
// Container
{
  display: 'flex',
  background: '#f1f5f9',
  borderBottom: '1px solid #e2e8f0',
  padding: '6px 16px',
  gap: '4px',
}

// Sub-Tab Button (Inactive)
{
  flex: 1,
  padding: '7px 12px',
  borderRadius: '8px',
  border: 'none',
  background: 'transparent',
  color: '#64748b',
  fontSize: '13px',
  fontWeight: '500',
  cursor: 'pointer',
  transition: 'all 0.15s',
}

// Sub-Tab Button (Active)
{
  background: 'white',
  color: '#1a428a',
  fontWeight: '600',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
}
```

### Sticky Tab Container (Mobile)
```js
{
  position: 'sticky',
  top: 0,
  zIndex: 100,
  transform: 'translateZ(0)',
  WebkitBackfaceVisibility: 'hidden',
}
```

---

## 19. Toggle Switch

```js
// Container
{
  width: '36px',
  height: '20px',
  borderRadius: '10px',
  background: '#10b981',     // active
  // background: '#cbd5e1',  // inactive
  position: 'relative',
  transition: 'background 0.2s',
  flexShrink: 0,
}

// Knob
{
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  background: 'white',
  position: 'absolute',
  top: '2px',
  left: '18px',              // active
  // left: '2px',            // inactive
  transition: 'left 0.2s',
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
}
```

### Inline Toggle Row (Fryer status, settings)
```js
{
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '14px',
  padding: '10px 12px',
  background: '#f8fafc',
  borderRadius: '10px',
}
// Label: fontSize '12px', fontWeight '600', color '#1f2937'
// State text: color '#10b981' (on) or '#94a3b8' (off), transition 'color 0.2s'
```

---

## 20. Success / Warning / Confirmation Modals

### Success Modal
```js
// Container
{
  background: 'white',
  borderRadius: '16px',
  padding: '32px',
  textAlign: 'center',
  maxWidth: '300px',
  width: '100%',
  animation: 'scaleIn 0.3s ease-out',
}

// Green circle icon
{
  width: '48px',
  height: '48px',
  background: '#10b981',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 16px',
}
```

### Warning / Confirm Modal
```js
// Container
{
  background: 'white',
  borderRadius: '16px',
  padding: '24px',
  maxWidth: '360px',
  width: '100%',
}

// Amber circle icon
{
  width: '40px',
  height: '40px',
  background: '#fef3c7',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 14px',
}
```

### Sticky Modal Header (scrollable content below)
```js
{
  padding: '16px',
  borderBottom: '1px solid #e2e8f0',
  position: 'sticky',
  top: 0,
  background: 'white',
  zIndex: 1,
}
```

---

## 21. Filter Dropdown (FilterableTh)

### Dropdown Container
```js
{
  position: 'absolute',
  top: '100%',
  left: 0,               // or right: 0 if alignRight
  marginTop: '2px',
  zIndex: 2000,
  background: 'white',
  borderRadius: '10px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  width: '200px',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}
```

### Filter Search Input
```js
{
  width: '100%',
  padding: '5px 8px',
  fontSize: '11px',
  border: '1.5px solid #e2e8f0',
  borderRadius: '6px',
  outline: 'none',
  background: '#f8fafc',
  color: '#1f2937',
  boxSizing: 'border-box',
}
```

### Checkbox (Unchecked)
```js
{
  width: '14px',
  height: '14px',
  borderRadius: '3px',
  flexShrink: 0,
  border: '1.5px solid #cbd5e1',
  background: 'white',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
```

### Checkbox (Checked)
```js
{
  border: '1.5px solid #1a428a',
  background: '#1a428a',
  // White tick icon inside
}
```

### Dropdown Option Row
```js
// Unchecked
{
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '5px 10px',
  cursor: 'pointer',
  fontSize: '11px',
  color: '#1f2937',
  fontWeight: '400',
  background: 'transparent',
}

// Checked
{
  fontWeight: '600',
  background: '#f0f5ff',
}
```

### Dropdown Footer
```js
{
  display: 'flex',
  gap: '6px',
  padding: '8px',
  borderTop: '1.5px solid #e2e8f0',
}
```

---

## 22. Column Toggle Dropdown

### Toggle Button (Closed)
```js
{
  display: 'flex',
  alignItems: 'center',
  gap: '5px',
  padding: '6px 12px',
  background: '#f1f5f9',
  color: '#64748b',
  border: '1.5px solid #e2e8f0',
  borderRadius: '8px',
  fontSize: '11px',
  fontWeight: '600',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'all 0.15s',
}
```

### Toggle Button (Open)
```js
{
  background: '#1a428a',
  color: 'white',
  borderColor: '#1a428a',
}
```

### Column Menu
```js
{
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: '4px',
  zIndex: 2000,
  background: 'white',
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  padding: '8px 0',
  minWidth: '200px',
  maxHeight: '320px',
  overflowY: 'auto',
}
```

### Column Option Row
```js
{
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: '12px',
  color: '#1f2937',
  // Locked columns: opacity 0.5, cursor 'default'
}
```

---

## 23. CustomerCodeInput Component

### Container (Warning Style)
```js
{
  background: '#fef3c7',
  border: '1px solid #fde047',
  borderRadius: '8px',
  padding: '10px 12px',
  marginBottom: '12px',
}
```

### Label
```js
{
  fontSize: '12px',
  fontWeight: '600',
  color: '#a16207',
}
```

### Save Button
```js
{
  padding: '8px 14px',
  background: '#1a428a',          // '#94a3b8' when disabled
  border: 'none',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: '600',
  color: 'white',
  cursor: 'pointer',              // 'not-allowed' when disabled
  whiteSpace: 'nowrap',
}
```

---

## 24. Empty States & Loading

### Empty State (No Data)
```js
{
  textAlign: 'center',
  padding: '40px 20px',
  color: '#94a3b8',
}
// Icon: 48px grey
// Title: fontSize '16px', fontWeight '600', color '#64748b'
// Subtitle: fontSize '13px', color '#94a3b8'
```

### Loading Spinner (Login)
```js
@keyframes cookersPulse {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(1.1); opacity: 1; }
}
// Applied to brand icon with animation: 'cookersPulse 1.6s ease-in-out infinite'
```

### Loading Dots
```js
@keyframes dotFlash {
  0%, 80%, 100% { opacity: 0; }
  40% { opacity: 1; }
}
// 3 dots, each 6px × 6px, borderRadius '50%', background '#1a428a'
// Staggered delay: 0s, 0.2s, 0.4s
```

---

## 25. Animations

| Name | Value | Usage |
|------|-------|-------|
| Standard transition | `all 0.2s ease` | Buttons, inputs, hover states |
| Fast transition | `all 0.15s` | Card hover, toggle |
| Loading pulse | `cookersPulse 1.6s ease-in-out infinite` | Login loading |
| Scale in | `scaleIn 0.2s ease-out` | Modal entry (success) |
| Scale in slow | `scaleIn 0.3s ease-out` | Modal entry (confirm) |
| Dot flash | `dotFlash 1.4s infinite` | Login loading dots |
| Toggle slide | `left 0.2s` | Toggle knob position |
| Colour fade | `background 0.2s`, `color 0.2s` | Toggle bg, state text |

### Keyframes
```css
@keyframes scaleIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes cookersPulse {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(1.1); opacity: 1; }
}

@keyframes dotFlash {
  0%, 80%, 100% { opacity: 0; }
  40% { opacity: 1; }
}
```

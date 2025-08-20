# Neo Dark Theme - Dashboard Integration Guide

A modern, premium dark theme for the Turo Toll Tracker Dashboard that delivers a techy, high-end experience inspired by Stripe, Linear, and Vercel.

## 🚀 Quick Integration

### Step 1: Add CSS Files

Add these lines to your `dashboard.html` file **after** the existing CSS links (around line 10):

```html
<!-- Existing CSS -->
<link rel="stylesheet" href="/css/design-system.css">
<link rel="stylesheet" href="/css/components.css">

<!-- Add these lines -->
<link rel="stylesheet" href="/css/ui-theme.tokens.css">
<link rel="stylesheet" href="/css/ui-dashboard.css">
<link rel="stylesheet" href="/css/no-emoji.css">
```

### Step 2: Enable Theme

Add the `data-theme="neo"` attribute to the `<html>` element:

```html
<html lang="en" data-theme="neo">
```

### Step 3: Add Data Attributes (Optional)

For proper card title display, add data attributes to performance card titles:

```html
<h2 class="card-title" data-title="Toll Matching Performance">🎯 Toll Matching Performance</h2>
<h2 class="card-title" data-title="Processing Status">⚙️ Processing Status</h2>
```

### Step 4: Toggle Theme (Optional)

To make the theme toggleable, use JavaScript:

```javascript
// Enable Neo theme
document.documentElement.setAttribute('data-theme', 'neo');

// Disable Neo theme (revert to original)
document.documentElement.removeAttribute('data-theme');
```

### Step 5: Verify Integration

1. Refresh the dashboard page
2. Confirm the dark theme is applied to all sections
3. No emojis should be visible anywhere
4. All functionality should work identically

## 🎨 Dashboard Theme Features

### Visual Design
- **Background**: Deep space dark (`#0B0F1A`)
- **Panels**: Elevated dark surfaces (`#0F1625`) 
- **Typography**: Space Grotesk (headings/numbers) + Inter (body)
- **Accents**: Purple/Cyan gradients (borders only, not fills)
- **Borders**: Subtle hairlines (`#24304A`)
- **Shadows**: Soft and minimal

### Component Styling

**Header & Navigation:**
- Gradient-bordered primary CTA button
- Dark sidebar with CSS navigation icons
- Gradient accent stripe on active navigation items

**KPI Cards:**
- Unified panel style with gradient top borders
- Large numbers in Space Grotesk font
- Color-coded trend chips
- CSS-generated icons instead of emojis

**Performance Cards:**
- Compact dark panels with subtle shadows
- Progress bars using gradient fills
- Segmented controls with clear active states

**Status List:**
- Clean list design with icon chips
- Status indicators using text and colors
- Consistent spacing and typography

### Interactions
- **Transitions**: 200-220ms ease-out
- **Focus**: 2px cyan rings (`#22D3EE`) 
- **Hover**: Subtle lifts and color shifts (2px)
- **Buttons**: Gradient borders with hover lift

### Accessibility
- **Contrast**: All text meets WCAG AA (4.5:1 minimum)
- **Focus**: Clear keyboard navigation rings
- **Labels**: Always visible, never emoji-dependent
- **States**: Clear indicators with both color and text

## ✅ QA Checklist

### Functionality Testing
- [ ] **No console errors** when theme is enabled
- [ ] **Dashboard loads correctly** with real data
- [ ] **KPI cards update** with live values
- [ ] **Primary CTA works** (Upload CSVs / Run Fetch)
- [ ] **User menu dropdown** opens and closes properly
- [ ] **Navigation links** work to all pages
- [ ] **Segmented controls** switch between Live Data/Historical
- [ ] **View action buttons** navigate correctly

### Visual Testing
- [ ] **Header styling** dark with proper typography
- [ ] **Sidebar navigation** dark with CSS icons
- [ ] **KPI cards** uniform panel style with gradient borders
- [ ] **Performance metrics** readable with progress bars
- [ ] **Status list** clean with text-based indicators
- [ ] **All text readable** with high contrast
- [ ] **Gradient borders** on primary buttons (not filled)
- [ ] **Hover effects** 2px lift on cards and buttons

### Emoji Removal Testing
- [ ] **No emojis visible** anywhere on the dashboard
- [ ] **Navigation icons** replaced with CSS shapes
- [ ] **KPI icons** replaced with CSS graphics
- [ ] **Performance card titles** show text only
- [ ] **Action buttons** show text content only
- [ ] **Status indicators** use text and colors only
- [ ] **Layout intact** (no gaps where emojis were)

### Accessibility Testing
- [ ] **Focus rings visible** on all interactive elements
- [ ] **Keyboard navigation** works for all controls
- [ ] **Tab order logical** through dashboard elements
- [ ] **Screen reader friendly** with proper text content
- [ ] **No color-only indicators** (text accompanies all states)
- [ ] **High contrast support** for users who need it

### Mobile Testing (360px-1600px)
- [ ] **Responsive layout** works at all breakpoints
- [ ] **Sidebar hidden** on mobile (<1024px)
- [ ] **KPI cards stack** properly on narrow screens
- [ ] **Performance section** stacks on tablet
- [ ] **Touch targets adequate** (minimum 44px)
- [ ] **Text readable** on small screens
- [ ] **No horizontal scroll** at any breakpoint

### Theme Toggle Testing
- [ ] **Adding `data-theme="neo"`** applies theme instantly
- [ ] **Removing attribute** reverts to original instantly
- [ ] **No CSS conflicts** with existing styles
- [ ] **No layout shifts >4px** when toggling
- [ ] **All animations respect** reduced-motion preference

### Performance Testing
- [ ] **CSS loads quickly** without blocking
- [ ] **No layout thrashing** during theme application
- [ ] **Smooth transitions** without janky animations
- [ ] **Memory usage reasonable** with theme active

## 🔧 Troubleshooting

### Theme Not Applying
1. Verify CSS files are loading (check Network tab)
2. Confirm `data-theme="neo"` is on `<html>` element
3. Check for CSS syntax errors in console
4. Ensure CSS files are linked after existing styles

### Layout Issues
1. All styles are scoped to `[data-theme="neo"]`
2. Original layout should be preserved exactly
3. Only visual styling changes, no structural modifications
4. Cards should maintain same spacing and proportions

### Emojis Still Visible
1. Ensure `no-emoji.css` is loaded after other CSS
2. Some emojis might be in JavaScript-generated content
3. Check if custom emoji wrappers need additional selectors
4. Verify CSS selector specificity is sufficient

### KPI Data Not Updating
1. Theme doesn't affect JavaScript functionality
2. Check API endpoints are working in browser dev tools
3. Verify data attributes match expected format
4. Theme styles don't interfere with dynamic content

### Performance Card Titles
1. If titles don't show, add `data-title` attributes to `h2.card-title`
2. Ensure attribute content matches desired text
3. CSS uses `attr(data-title)` to display clean text

### Accessibility Concerns
1. All colors tested for WCAG AA compliance
2. Focus states explicitly defined for keyboard users
3. Text content replaces all emoji meaning
4. Screen readers get proper semantic content

## 📁 File Structure

```
/css/
├── ui-theme.tokens.css    # Shared design system tokens
├── ui-dashboard.css       # Dashboard-specific Neo theme
└── no-emoji.css          # Emoji removal (auth + dashboard)
```

## 🎯 Browser Support

- Chrome/Edge 88+
- Firefox 78+
- Safari 14+
- Mobile browsers with CSS Grid support

## 🎨 Design Tokens Reference

### Colors
```css
--neo-bg: #0B0F1A           /* Main background */
--neo-panel: #0F1625        /* Cards/panels */
--neo-hover: #1B2336        /* Hover states */
--neo-hairline: #24304A     /* Borders */
--neo-ink: #EAF2FF          /* Primary text */
--neo-muted: #9FB0D8        /* Secondary text */
--neo-accent-a: #7C3AED     /* Purple accent */
--neo-accent-b: #22D3EE     /* Cyan accent */
--neo-accent-c: #4CC9F0     /* Light blue accent */
```

### Typography
```css
--neo-font-heading: 'Space Grotesk'  /* Numbers, headings */
--neo-font-body: 'Inter'             /* Body text */
```

### Spacing & Animation
```css
--neo-radius-sm: 6px
--neo-radius: 8px
--neo-transition-fast: 200ms cubic-bezier(0.4, 0, 0.2, 1)
--neo-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2)
```

---

**Need help?** Check the browser console for errors and verify all CSS files are loading correctly. The theme is designed to gracefully degrade if any files fail to load, maintaining full dashboard functionality.
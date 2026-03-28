# VEcheLOn Design Spec: Gemini CLI Instructions (Updated)

**Action:** Update `index.html` to add a "Below the Fold" section.

## 1. Global Layout Adjustments
- Update `body` CSS: Change `overflow: hidden` to `overflow-y: auto`. Add `scroll-behavior: smooth`.
- Ensure the existing "Club Command" theme (colors and fonts) remains persistent.
- Implementation uses CSS Variables (`--primary-color`) for real-time theme syncing.

## 2. Visual Architecture
- **Theme:** "Heads-Up Display" aesthetic. 
- **Container:** Create a `.cap-section` using `backdrop-filter: blur(12px)` and `background: rgba(255, 255, 255, 0.03)`.
- **Borders:** Use `1px solid var(--primary-color)`.
- **Typography:** Headers must be 'Barlow Condensed', weight 800, uppercase.
- **Row Dividers:** Centered horizontal gradients (`opacity: 0.4`) separating each feature row.

## 3. UI Components
- **Anchor Link:** A prominent scroll-link below the "COMING SOON" text: "EXPLORE THE TACTICAL LOGIC ↓".
- **The Grid:** 
    - Desktop: 4-column grid (Visual Icon, Situation, Value, Outcome).
    - Mobile: Single-column stacked cards (Breakpoint: 768px). Headers and Visuals hidden for space.
- **Visual Containers:** 
    - 85x85px boxes (15% smaller than cell width).
    - `1px solid var(--primary-color)` border on all sides.
    - Contains procedural SVG icons (Planning, Rollout, Ride, Support, Aftermath).

## 4. JS Sync & Footer
- **Dynamic Updates:** The `paint(c)` function updates `--primary-color`, SVG path fills, and `.visual-container` border colors.
- **Privacy Footer:** Text: "VEcheLOn Privacy Protocol: GPS breadcrumbs and guest contact data are purged 4 hours post-ride. Names are archived for club records only."
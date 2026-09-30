# MTG Fresh Cuts — Binder Redesign Strategy

## Purpose

Replace the dashboard-style deck preview and Make Cuts screens with one immersive, fixed-window deck workspace. The experience should feel like handling cards at a game table: browse a binder, lift a card to inspect it, make a decision, and return it to its slot.

This is a presentation and interaction overhaul. The existing parsing, card cache, effect extraction, role detection, theme detection, scoring, and recommendation logic should remain intact unless a separate scoring change is explicitly approved.

## Product decisions already made

- The deck preview step is removed from the primary path. Import proceeds directly to the deck workspace.
- Make Cuts is a two-page binder rather than a table, dashboard, or tabbed list.
- Desktop spreads contain two 4 × 4 pages: 32 visible cards per spread.
- Commander decks show the commander as a normal card in a distinct frame above the binder.
- The commander is always protected from cuts.
- Binder materials and ambient color derive from the commander's color identity.
- The workspace fits within one browser window and does not page-scroll.
- Card decisions remain visible in place:
  - Undecided: normal card treatment.
  - Keep: gold edge and restrained glow.
  - Cut: dimmed/desaturated art, red edge, and a non-color-only cut marker.
- Filters may show undecided, kept, and cut cards individually or in combination. Filtering does not move cards into a separate workflow.
- Hover/focus lifts a card for a quick visual preview.
- Clicking a card creates an immersive inspection state: the card appears lifted out of the binder while the binder remains visible beneath a transparent blur.
- The inspection state does not use a sidebar, drawer, dashboard panel, or opaque modal card.
- The card image supplies its own Oracle text. The interface does not repeat the full rules text.
- Effects, themes, and roles appear as concise tags beneath or beside the inspected card.
- Cut information floats beside the card.
- The cut score is represented by a circular meter. Activating it cycles through Overall, Price, Mana Curve, Synergy, and Popularity scores.
- A collapsed Details control reveals the complete calculation and explanation.
- Deck color distribution appears as a compact color wheel rather than a chart panel.

## Experience hierarchy

The screen has four visual layers, in order of importance:

1. The physical card being inspected.
2. The binder spread and decision states.
3. The commander frame, progress, pagination, and filters.
4. Advanced analysis and configuration, available on demand.

No persistent metric cards, chart grid, explanatory hero, or sidebar should compete with the binder.

## Fixed-window layout

The application shell uses the available viewport height and prevents document scrolling. Internal regions may scroll only when content cannot otherwise remain accessible, such as the expanded score explanation on a short screen.

- Top strip: back/import control, editable deck name, cards remaining, compact utilities.
- Commander rail: framed commander card and color-distribution wheel.
- Binder: responsive two-page spread on wide screens and one page on narrower screens.
- Bottom rail: spread navigation and visible-card range.
- Inspection layer: transparent blur over the binder with a large card, tags, score wheel, details, and decision controls.

At small widths the binder becomes one page. Touch interaction uses tap rather than hover; all hover content must also be available after selection.

## Information-reduction rules

- Prefer a recognizable icon plus an accessible tooltip for secondary controls.
- Never hide an essential action behind hover alone.
- Show one primary recommendation sentence before numeric evidence.
- Show no more than the most useful tags in the initial inspection view; overflow is expandable.
- Keep labels for Effects, Themes, and Roles so the categories do not collapse into an ambiguous tag cloud.
- Keep score explanations collapsed by default.
- Preserve full calculation evidence in Details even when the surface is visually quiet.
- Use color only when it communicates commander identity, card decision, mana identity, or meaningful scoring state.

## Feature migration map

| Existing feature | New location |
| --- | --- |
| Deck name, format, count | Thin top strip |
| Commander | Dedicated framed card above binder |
| Keep/cut/undecided tabs | Multi-select binder filters |
| Ranked card browser | Binder pages |
| Card preview | Lifted-card inspection layer |
| Effects, themes, roles | Tags in inspection layer |
| Score cards | One cycling score wheel |
| Full scoring evidence | Collapsed Details section |
| Mana and type grouping | Compact sort/group control |
| Deck color balance | Color wheel near commander |
| Budget | Utility popover; price score disabled when unset |
| Basic land adjustment | Utility popover or dedicated compact overlay |
| Synergy explorer | On-demand analysis overlay |
| Card comparison lab | On-demand analysis overlay |
| Export/review | Completion control in top or bottom rail |

## Delivery sequence

### Stage 1 — Binder foundation

- Add the fixed-window shell, commander frame, themed binder, spread pagination, card art grid, and in-place decision styling.
- Reuse the existing ranked recommendation data and Keep/Cut/Undecided state.
- Add the lifted-card inspection layer with effects, themes, roles, score wheel, details, and decision controls.
- Keep advanced tools temporarily outside the primary surface while preserving their underlying logic.

### Stage 2 — Complete feature migration

- Add multi-select decision filters.
- Move budget, grouping, sorting, basic lands, and deck-level analysis into compact overlays.
- Move synergy exploration and comparison into focused secondary views.
- Remove the old dashboard markup after feature parity is verified.

### Stage 3 — Unified entry flow

- Send a successful import directly into the binder workspace.
- Fold any essential deck-preview information into the top strip or utility overlays.
- Remove the separate preview-page navigation step.

### Stage 4 — Responsive and accessibility pass

- Verify desktop, laptop, tablet, mobile, keyboard, touch, reduced motion, text enlargement, and short viewport behavior.
- Ensure decision states do not depend on color alone.
- Confirm focus returns to the originating binder slot when inspection closes.

### Stage 5 — Visual refinement and cleanup

- Tune commander-derived palettes for all color identities, including colorless and five-color decks.
- Remove obsolete dashboard-only styles and dead presentation code.
- Run the existing scoring and UI test suites, then add binder interaction coverage.

## Decision checkpoints

The following choices should be evaluated in the working interface rather than decided abstractly:

1. Whether advancing automatically to the next undecided card after Keep/Cut feels efficient or removes too much control.
2. Whether the commander rail belongs above the full binder or visually attached to the binder cover.
3. Whether filtered cards disappear and repaginate or remain as empty/dimmed slots. The initial recommendation is to repaginate and clearly update the range.
4. Whether card ordering should remain stable after a decision. The initial recommendation is stable ordering while All is visible and repagination only when a filter excludes the decided state.
5. Whether score-wheel activation cycles metrics or opens a small radial choice. The initial implementation uses cycling because it is quieter.
6. Whether the inspection layer should close after a decision. The initial recommendation is to advance to the next undecided card while keeping inspection open, with an option to disable this later.

## Definition of success

- A player can import a Commander deck, see the commander and all other cards, inspect any card, understand its detected effects/themes/roles, review every score, and mark it Keep/Cut/Undecided without leaving the binder.
- The primary screen has no page scroll at supported desktop and laptop sizes.
- Existing scoring results remain unchanged by the visual migration.
- The interface reads as a game-adjacent card workspace, not a general-purpose dashboard.

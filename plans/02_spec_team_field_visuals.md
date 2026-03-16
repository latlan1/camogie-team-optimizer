# Plan: Team Field Visuals (Single-Pitch Paired Layout)

**Status**: Draft, pending implementation approval  
**Created**: 2026-03-15

---

## Overview

Add a deterministic, robust team visualization on a **single horizontal Gaelic field** that displays Team A and Team B players in side-by-side pairs by position.

This spec prioritizes:
- deterministic rendering (same input always yields same placement)
- simple implementation (Option A markers)
- compatibility with template-driven graphics/cards (fill fields only)
- full backwards compatibility with existing scenarios and CSV formats

---

## Product Requirements

1. Render **both teams on one field**.
2. Team colors are fixed:
   - Team A = **Red**
   - Team B = **White**
3. Pair placement in each outfield lane:
   - Red player `N` must be drawn next to White player `N`
4. Position lanes are separate:
   - Defense lane
   - Midfield lane
   - Forward lane
5. Goalkeepers are excluded from pairing and fixed at goals:
   - Team A GK at left goal
   - Team B GK at right goal
6. Field orientation is **horizontal only**.
7. Team direction:
   - Team A scores on red goal (left side)
   - Team B scores on opposite goal (right side)
8. Overflow players (unpaired extras in a lane) are placed:
   - **off the field**
   - aligned across their own lane row

---

## Visualization Approach

### Option A (Chosen)

Use simple numbered player markers:
- circular token with player number text
- fill/border encode team color (red/white)
- no complex avatar generation

This is intentionally simple and robust and aligns with a deterministic template-fill workflow.

### Template/Card Integration Compatibility

The renderer should support two interchangeable marker modes:

1. **Primitive mode** (default now): draw circles + text directly in SVG.
2. **Template mode** (future-ready): place static template sprite/SVG and fill only:
   - name
   - player number
   - team color variant
   - position tag

No procedural character generation is required.

---

## Layout Model (Deterministic)

### Field Zones

Horizontal pitch with fixed rows:
- Row 1: Defense pairs
- Row 2: Midfield pairs
- Row 3: Forward pairs

Goalkeeper anchors:
- Left goal anchor (Team A GK)
- Right goal anchor (Team B GK)

### Pair Slots

Each lane contains indexed pair cells:
- pair `i` = `(Team A lane player i, Team B lane player i)`
- Team A token drawn first, Team B token immediately adjacent

### Overflow Slots

For each lane, create an off-field overflow strip on the right side.

Rules:
- if one team has extra players in lane `L`, extras are placed in lane `L` overflow strip
- overflow never mixes lanes (defense extras remain on defense row, etc.)

---

## Data/Sorting Rules

### Player Classification

For each team roster:
- GK bucket: position `goalkeeper` or `goalkeeper` alias if configured
- Outfield buckets: `defense`, `midfield`, `forward`
- Unknowns: keep as overflow bench row (optional fallback)

### Deterministic Ordering

Within each bucket, sort by:
1. `playerNumber` if present
2. fallback: player name (case-insensitive alphabetical)

Pairing is by sorted index.

### Fallbacks

If explicit GK missing:
- infer GK from first defense player in deterministic order
- tag as inferred in tooltip/label

---

## Technical Design

### Rendering Stack

Use D3.js + SVG in browser UI:
- D3 for data binding and deterministic coordinate mapping
- SVG for crisp markers and lane geometry

No force simulation, no random jitter.

### File Targets

| File | Action | Description |
|------|--------|-------------|
| `public/index.html` | MODIFY | Add single-pitch visualization container in results area |
| `public/bundle.js` | MODIFY | Add D3 rendering logic and deterministic slot assignment |
| `public/bundle.js` | MODIFY | Add layout helpers (lane/pair/overflow coordinate calculators) |
| `README.md` | MODIFY | Document field visualization behavior and pairing rules |

---

## Proposed DOM/API Contract

### Container

Add one SVG mount target in results panel:

```html
<div id="fieldVisualization" class="field-visualization">
  <svg id="teamFieldSvg" viewBox="0 0 1000 520" aria-label="Team layout on Gaelic field"></svg>
</div>
```

### Renderer Entry

```ts
renderSingleFieldLayout({
  teamAPlayers,
  teamBPlayers,
  orientation: 'horizontal',
  colorA: 'red',
  colorB: 'white',
});
```

---

## Acceptance Criteria

1. One field is displayed with both teams.
2. Team A markers are red and Team B markers are white.
3. Outfield players appear in lane-separated paired order.
4. Goalkeepers are fixed at opposite goals and not paired in lanes.
5. Overflow players appear off-field in lane-aligned strips.
6. Re-rendering same data is stable (no random movement).
7. Existing text results still render and remain unchanged.
8. Existing scenarios and old CSV formats continue to work.

---

## Smoke Test Plan

### Core UI Checks

1. Solve any scenario; verify field appears.
2. Confirm Team A red markers and Team B white markers.
3. Confirm pair adjacency in each lane (A1 beside B1, etc.).
4. Confirm GK anchors at goals.

### Overflow Checks

1. Use mismatched lane counts; verify overflow appears off-field by lane.
2. Confirm overflow lane assignment is correct (no cross-lane spill).

### Backward Compatibility Checks

1. `ratings_only` with old CSV still solves and renders field.
2. `with_positions` and `balanced_positions` still solve/render.
3. `expected_active_skill*` and `active_skill_plus` still solve/render.

### Determinism Check

1. Solve same input multiple times.
2. Verify marker coordinates do not change.

---

## Risks and Mitigations

1. **No GK in source data**
   - Mitigation: deterministic inferred GK fallback.
2. **Crowding in one lane**
   - Mitigation: fixed max on-field pair cells + overflow strip.
3. **Position label inconsistencies**
   - Mitigation: normalize positions before bucketing.

---

## Implementation Order

1. Add field visualization container in `public/index.html`.
2. Implement lane bucketing + sorting + pairing helpers.
3. Implement D3 single-field renderer for markers and goals.
4. Add overflow strip rendering by lane.
5. Wire renderer into existing results pipeline.
6. Run smoke tests across all scenarios and CSV formats.
7. Update docs.

---

## Notes

- This spec intentionally avoids procedural cartoon generation.
- It is built for deterministic template-fill pipelines where graphics are reused.
- Future enhancement can swap marker primitives with template cards without changing layout algorithm.

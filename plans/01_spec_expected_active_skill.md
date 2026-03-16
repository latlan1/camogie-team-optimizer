# Plan: Expected Active Skill Optimization Scenario

**Status**: Approved, pending implementation  
**Created**: 2026-01-20  
**Updated**: 2026-03-15

---

## Overview

Add a new optimization scenario called `expected_active_skill` ("Expected Active Skill (Attendance+TopTwo)") that creates balanced training teams considering:
- **Experience** (1-10 scale, derived categories: novice/intermediate/veteran)
- **Attendance expectation** (derived from `attendance_weeks` / 7 total weeks)
- **Position distribution** (forwards/midfield/defense)
- **Star player distribution** (top 2 by raw experience per team, using indicator variables)

---

## Critical: Backwards Compatibility

**This is a NEW scenario page added alongside existing scenarios. Previous scenarios MUST continue to work with old CSVs.**

### Architecture Decisions
- **UI**: Same page with scenario dropdown selector (not a separate HTML page)
- **Old CSV + New Scenario**: Show helpful error explaining required columns
- **Season Length**: Hardcoded to 7 weeks (not configurable)

### CSV Format Compatibility

| Scenario | Required CSV Columns | Notes |
|----------|---------------------|-------|
| `ratings_only` | `name`, `rating` | Position optional |
| `with_positions` | `name`, `rating`, `position` | Existing format |
| `balanced_positions` | `name`, `rating`, `position` | Existing format |
| `expected_active_skill` | `name`, `experience`, `attendance_weeks`, `position` | **NEW format** |

### Validation Rules
1. **Existing scenarios** → Accept old CSVs (`name,rating,position`) - no changes
2. **New scenario** → Require new columns (`name,experience,attendance_weeks,position`)
3. **Old CSV + New scenario** → Display error: "This scenario requires 'experience' and 'attendance_weeks' columns. Please use a CSV with columns: name, experience, attendance_weeks, position"
4. **New CSV + Old scenario** → Map `experience` to `rating` for compatibility

---

## Objective Function

```
minimize:
  w1 * |ActiveSkill_A - ActiveSkill_B|
  + w2 * |Attend_A - Attend_B|
  + w3 * |TopTwo_A - TopTwo_B|

Where:
  w1 = 0.6   (active skill balance - primary)
  w2 = 0.25  (attendance balance)  
  w3 = 0.15  (top-two experience spread)
```

### Metrics Definitions

| Metric | Formula | Description |
|--------|---------|-------------|
| `E_i` | experience (1-10) | Player experience score |
| `A_i` | attendance (0-1) | Attendance probability |
| `EA_i` | `E_i * A_i` | Active skill (expected contribution) |
| `Skill_t` | `Σ E_i * x_it` | Total experience on team t |
| `Attend_t` | `Σ A_i * x_it` | Expected attendance on team t |
| `ActiveSkill_t` | `Σ EA_i * x_it` | Expected skill present on team t |
| `TopTwo_t` | Sum of 2 highest `E_i` on team t | Star player concentration |

---

## Input CSV Format

### New Format (for `expected_active_skill` scenario)

```csv
name,experience,attendance_weeks,position
Sarah Murphy,8,6,forward
Aoife Kelly,3,4,midfield
Ciara O'Brien,9,7,forward
```

| Column | Type | Range | Required | Description |
|--------|------|-------|----------|-------------|
| `name` | string | - | Yes | Player name |
| `experience` | integer | 1-10 | Yes | Skill level |
| `attendance_weeks` | integer | 0-7 | Yes | Expected weeks attending (out of 7 total) |
| `position` | string | forward/midfield/defense | Yes | Playing position |

### Attendance Probability Derivation
```
attendance_probability = attendance_weeks / 7
```

| Weeks | Probability | Category |
|-------|-------------|----------|
| 0-3 | 0.00-0.43 | Low |
| 4-5 | 0.57-0.71 | Mid |
| 6-7 | 0.86-1.00 | High |

### Experience Categories (derived)
| Value | Category |
|-------|----------|
| 1-3 | Novice |
| 4-7 | Intermediate |
| 8-10 | Veteran |

### Old Format (for existing scenarios - unchanged)

```csv
name,rating,position
Sarah Murphy,8,forward
Aoife Kelly,7,midfield
```

Old format continues to work for `ratings_only`, `with_positions`, and `balanced_positions` scenarios.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `models/team_assignment_expected_skill.mzn` | CREATE | New MiniZinc model with indicator-based TopTwo |
| `src/solver/types.ts` | MODIFY | Add experience, attendanceWeeks fields (preserve existing) |
| `src/shared/utils.ts` | MODIFY | Extend parseCSV for new columns (backwards compatible) |
| `src/shared/constants.ts` | MODIFY | Register new scenario (keep existing scenarios) |
| `public/bundle.js` | MODIFY | Embed model, update parsing, add scenario dropdown |
| `public/index.html` | MODIFY | Add scenario selector dropdown |
| `data/test-players-expected-skill.csv` | CREATE | Sample CSV with new columns |

---

## Implementation Details

### 1. MiniZinc Model (`models/team_assignment_expected_skill.mzn`)

```minizinc
% Camogie Team Assignment - Expected Active Skill Scenario
% Balances active skill, attendance, and top player distribution
% Uses indicator variables for TopTwo calculation
% Includes position constraints

include "globals.mzn";

% ============================================
% INPUT PARAMETERS
% ============================================
int: num_players;
array[1..num_players] of int: experiences;        % 1-10 scale (×10 for precision → 10-100)
array[1..num_players] of int: attendances;        % 0-100 (attendance_weeks/7 × 100)
array[1..num_players] of int: position_indices;   % 1=forward, 2=midfield, 3=defense

% Weights (×100 for integer math, sum to 100)
int: W1 = 60;   % Active skill weight
int: W2 = 25;   % Attendance weight  
int: W3 = 15;   % Top-two weight

% Position constants
int: POS_FORWARD = 1;
int: POS_MIDFIELD = 2;
int: POS_DEFENSE = 3;

% ============================================
% DECISION VARIABLES
% ============================================
% team_assignment[p] = 0 means Team A, 1 means Team B
array[1..num_players] of var 0..1: team_assignment;

% ============================================
% TEAM SIZE CONSTRAINTS
% ============================================
var int: team_a_size = sum(p in 1..num_players)(1 - team_assignment[p]);
var int: team_b_size = num_players - team_a_size;
constraint abs(team_a_size - team_b_size) <= 1;

% ============================================
% ACTIVE SKILL CALCULATION
% ============================================
% Active skill = experience × attendance (pre-computed for efficiency)
array[1..num_players] of int: active_skills = 
  [experiences[p] * attendances[p] | p in 1..num_players];

var int: active_skill_a = sum(p in 1..num_players)(active_skills[p] * (1 - team_assignment[p]));
var int: active_skill_b = sum(p in 1..num_players)(active_skills[p] * team_assignment[p]);

% ============================================
% ATTENDANCE TOTALS
% ============================================
var int: attend_a = sum(p in 1..num_players)(attendances[p] * (1 - team_assignment[p]));
var int: attend_b = sum(p in 1..num_players)(attendances[p] * team_assignment[p]);

% ============================================
% POSITION COUNTS
% ============================================
% Team A positions
var int: forwards_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then (1 - team_assignment[p]) else 0 endif
);
var int: midfield_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then (1 - team_assignment[p]) else 0 endif
);
var int: defense_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then (1 - team_assignment[p]) else 0 endif
);

% Team B positions
var int: forwards_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then team_assignment[p] else 0 endif
);
var int: midfield_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then team_assignment[p] else 0 endif
);
var int: defense_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then team_assignment[p] else 0 endif
);

% Position balance constraints
constraint abs(forwards_a - forwards_b) <= 1;
constraint abs(midfield_a - midfield_b) <= 1;
constraint abs(defense_a - defense_b) <= 1;

% ============================================
% TOP-TWO CALCULATION (Indicator Variable Approach)
% ============================================
% Indicator variables: is player p among top 2 experience in their team?
array[1..num_players] of var 0..1: is_top2_a;
array[1..num_players] of var 0..1: is_top2_b;

% Players can only be top2 in their assigned team (not both)
constraint forall(p in 1..num_players)(
  is_top2_a[p] <= (1 - team_assignment[p])  % Only if in Team A
);
constraint forall(p in 1..num_players)(
  is_top2_b[p] <= team_assignment[p]        % Only if in Team B
);

% Exactly 2 top players per team (assuming team size >= 2)
constraint sum(p in 1..num_players)(is_top2_a[p]) = 2;
constraint sum(p in 1..num_players)(is_top2_b[p]) = 2;

% Dominance constraints: top2 players have >= experience than non-top2 in same team
% For Team A: if i is top2 and j is not top2 (both in Team A), then exp[i] >= exp[j]
constraint forall(i in 1..num_players, j in 1..num_players where i != j)(
  ((1 - team_assignment[i]) = 1 /\ (1 - team_assignment[j]) = 1 
   /\ is_top2_a[i] = 1 /\ is_top2_a[j] = 0)
  -> experiences[i] >= experiences[j]
);

% For Team B: if i is top2 and j is not top2 (both in Team B), then exp[i] >= exp[j]
constraint forall(i in 1..num_players, j in 1..num_players where i != j)(
  (team_assignment[i] = 1 /\ team_assignment[j] = 1 
   /\ is_top2_b[i] = 1 /\ is_top2_b[j] = 0)
  -> experiences[i] >= experiences[j]
);

% TopTwo sums (sum of experiences of top 2 players per team)
var int: top_two_a = sum(p in 1..num_players)(experiences[p] * is_top2_a[p]);
var int: top_two_b = sum(p in 1..num_players)(experiences[p] * is_top2_b[p]);

% ============================================
% OBJECTIVE FUNCTION
% ============================================
var int: active_skill_diff = abs(active_skill_a - active_skill_b);
var int: attend_diff = abs(attend_a - attend_b);
var int: top_two_diff = abs(top_two_a - top_two_b);

% Weighted objective (minimize imbalance)
var int: objective = W1 * active_skill_diff + W2 * attend_diff + W3 * top_two_diff;

solve minimize objective;

% ============================================
% JSON OUTPUT
% ============================================
output [
  "{",
  "\"status\": \"OPTIMAL\",",
  "\"solution\": {",
  "\"team_a_size\": ", show(team_a_size), ",",
  "\"team_b_size\": ", show(team_b_size), ",",
  "\"active_skill_a\": ", show(active_skill_a), ",",
  "\"active_skill_b\": ", show(active_skill_b), ",",
  "\"attend_a\": ", show(attend_a), ",",
  "\"attend_b\": ", show(attend_b), ",",
  "\"top_two_a\": ", show(top_two_a), ",",
  "\"top_two_b\": ", show(top_two_b), ",",
  "\"forwards_a\": ", show(forwards_a), ",",
  "\"forwards_b\": ", show(forwards_b), ",",
  "\"midfield_a\": ", show(midfield_a), ",",
  "\"midfield_b\": ", show(midfield_b), ",",
  "\"defense_a\": ", show(defense_a), ",",
  "\"defense_b\": ", show(defense_b), ",",
  "\"active_skill_diff\": ", show(active_skill_diff), ",",
  "\"attend_diff\": ", show(attend_diff), ",",
  "\"top_two_diff\": ", show(top_two_diff), ",",
  "\"objective\": ", show(objective), ",",
  "\"assignment\": ", show(team_assignment), "},",
  "\"statistics\": {}",
  "}"
];
```

---

### 2. Type Updates (`src/solver/types.ts`)

**Preserve all existing fields, add new optional fields for new scenario:**

```typescript
export interface Player {
  name: string;
  rating: number;                    // Keep for backwards compatibility
  position: string;
  // New fields for expected_active_skill scenario (optional for old scenarios)
  experience?: number;               // 1-10 scale (raw input)
  attendanceWeeks?: number;          // 0-7 weeks (raw input)
  attendanceProbability?: number;    // Derived: attendanceWeeks / 7
  experienceCategory?: string;       // Derived: 'novice' | 'intermediate' | 'veteran'
  attendanceCategory?: string;       // Derived: 'low' | 'mid' | 'high'
  activeSkill?: number;              // Derived: experience × attendanceProbability
}

export interface ModelData {
  num_players: number;
  ratings: number[];                 // Keep for existing scenarios
  positions: string[];
  position_indices?: number[];
  players?: Player[];
  // New arrays for expected_active_skill scenario (optional)
  experiences?: number[];            // Scaled integers for MiniZinc (×10 → 10-100)
  attendances?: number[];            // Scaled integers for MiniZinc (probability × 100 → 0-100)
}

export interface TeamAssignment {
  team_a: Player[];
  team_b: Player[];
  total_rating_a: number;            // Keep for existing scenarios
  total_rating_b: number;
  rating_difference: number;
  assignment?: number[];
  team_a_size?: number;
  team_b_size?: number;
  forwards_a?: number;
  forwards_b?: number;
  midfield_a?: number;
  midfield_b?: number;
  defense_a?: number;
  defense_b?: number;
  // New fields for expected_active_skill scenario
  active_skill_a?: number;
  active_skill_b?: number;
  attend_a?: number;
  attend_b?: number;
  top_two_a?: number;
  top_two_b?: number;
  active_skill_diff?: number;
  attend_diff?: number;
  top_two_diff?: number;
}
```

---

### 3. CSV Parsing (`src/shared/utils.ts`)

**Extend parseCSV to handle both old and new formats with backwards compatibility:**

```typescript
const TOTAL_SEASON_WEEKS = 7;  // Hardcoded season length

export function parseCSV(csvText: string): ModelData & { players: Player[] } {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header and one data row');
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  
  // Column indices (old format)
  const nameIdx = headers.indexOf('name');
  const ratingIdx = headers.indexOf('rating');
  const positionIdx = headers.indexOf('position');
  
  // Column indices (new format)
  const experienceIdx = headers.indexOf('experience');
  const attendanceWeeksIdx = headers.indexOf('attendance_weeks');
  
  // Determine CSV format
  const isNewFormat = experienceIdx !== -1 && attendanceWeeksIdx !== -1;
  const isOldFormat = ratingIdx !== -1;
  
  if (!isNewFormat && !isOldFormat) {
    throw new Error('CSV must contain either "rating" (old format) or "experience" and "attendance_weeks" (new format)');
  }

  const players: Player[] = [];
  const ratings: number[] = [];
  const positions: string[] = [];
  const positionIndices: number[] = [];
  const experiences: number[] = [];
  const attendances: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',').map(v => v.trim());
    const name = values[nameIdx] || `Player ${i}`;
    const positionRaw = positionIdx !== -1 ? values[positionIdx]?.toLowerCase() : 'unknown';
    const position = positionRaw || 'unknown';
    const positionConfig = POSITIONS[position as keyof typeof POSITIONS] || POSITIONS.unknown;
    
    let rating: number;
    let experience: number | undefined;
    let attendanceWeeks: number | undefined;
    let attendanceProbability: number | undefined;
    let experienceCategory: string | undefined;
    let attendanceCategory: string | undefined;
    let activeSkill: number | undefined;
    
    if (isNewFormat) {
      // New format: experience + attendance_weeks
      experience = parseInt(values[experienceIdx], 10);
      attendanceWeeks = parseInt(values[attendanceWeeksIdx], 10);
      
      if (isNaN(experience) || isNaN(attendanceWeeks)) {
        continue; // Skip invalid rows
      }
      
      // Clamp values to valid ranges
      experience = Math.max(1, Math.min(10, experience));
      attendanceWeeks = Math.max(0, Math.min(7, attendanceWeeks));
      
      // Derive probability and categories
      attendanceProbability = attendanceWeeks / TOTAL_SEASON_WEEKS;
      experienceCategory = experience <= 3 ? 'novice' : experience <= 7 ? 'intermediate' : 'veteran';
      attendanceCategory = attendanceProbability < 0.46 ? 'low' : attendanceProbability < 0.76 ? 'mid' : 'high';
      activeSkill = experience * attendanceProbability;
      
      // Map experience to rating for compatibility with existing scenarios
      rating = experience;
      
      // Scale for MiniZinc (integers only)
      experiences.push(experience * 10);                              // 10-100
      attendances.push(Math.round(attendanceProbability * 100));      // 0-100
    } else {
      // Old format: rating only
      rating = parseInt(values[ratingIdx], 10);
      if (isNaN(rating)) {
        continue; // Skip invalid rows
      }
    }
    
    players.push({ 
      name, 
      rating, 
      position,
      experience,
      attendanceWeeks,
      attendanceProbability,
      experienceCategory,
      attendanceCategory,
      activeSkill,
    });
    
    ratings.push(rating);
    positions.push(position);
    positionIndices.push(positionConfig.index);
  }

  if (players.length === 0) {
    throw new Error('No valid player data found in CSV');
  }

  return {
    num_players: players.length,
    players,
    ratings,
    positions,
    position_indices: positionIndices,
    // Only include new arrays if new format was detected
    ...(isNewFormat && { experiences, attendances }),
  };
}

/**
 * Validate that CSV has required columns for a given scenario
 */
export function validateCSVForScenario(
  headers: string[], 
  scenarioId: string
): { valid: boolean; error?: string } {
  const normalized = headers.map(h => h.trim().toLowerCase());
  
  if (scenarioId === 'expected_active_skill') {
    const hasExperience = normalized.includes('experience');
    const hasAttendanceWeeks = normalized.includes('attendance_weeks');
    const hasPosition = normalized.includes('position');
    
    if (!hasExperience || !hasAttendanceWeeks) {
      return {
        valid: false,
        error: `This scenario requires 'experience' and 'attendance_weeks' columns.\n\nExpected CSV format:\nname,experience,attendance_weeks,position\nSarah Murphy,8,6,forward\nAoife Kelly,3,4,midfield`
      };
    }
    if (!hasPosition) {
      return {
        valid: false,
        error: `This scenario requires a 'position' column.\n\nExpected CSV format:\nname,experience,attendance_weeks,position`
      };
    }
    return { valid: true };
  }
  
  // Existing scenarios: require name and rating
  const hasName = normalized.includes('name');
  const hasRating = normalized.includes('rating');
  
  if (!hasName || !hasRating) {
    return {
      valid: false,
      error: `This scenario requires 'name' and 'rating' columns.\n\nExpected CSV format:\nname,rating,position\nSarah Murphy,8,forward`
    };
  }
  
  return { valid: true };
}
```

---

### 4. Scenario Registration (`src/shared/constants.ts`)

**Add new scenario while preserving all existing scenarios:**

```typescript
export const SCENARIOS = {
  ratings_only: {
    id: 'ratings_only',
    name: 'Ratings Only',
    description: 'Balance teams by total skill rating only',
    modelFile: 'team_assignment_ratings_only.mzn',
    requiredColumns: ['name', 'rating'],
  },
  with_positions: {
    id: 'with_positions',
    name: 'Ratings + Positions',
    description: 'Balance ratings AND position distribution (forwards, midfield, defense)',
    modelFile: 'team_assignment_with_positions.mzn',
    requiredColumns: ['name', 'rating', 'position'],
  },
  balanced_positions: {
    id: 'balanced_positions',
    name: 'Position-wise Ratings',
    description: 'Minimize rating difference within each position group (balanced skill per position)',
    modelFile: 'team_assignment_balanced_positions.mzn',
    requiredColumns: ['name', 'rating', 'position'],
  },
  expected_active_skill: {
    id: 'expected_active_skill',
    name: 'Expected Active Skill (Attendance+TopTwo)',
    description: 'Balance expected skill contribution considering attendance probability and top player distribution',
    modelFile: 'team_assignment_expected_skill.mzn',
    requiredColumns: ['name', 'experience', 'attendance_weeks', 'position'],
  },
} as const;
```

---

### 5. Sample Test Data (`data/test-players-expected-skill.csv`)

**New format with attendance_weeks (0-7 integer):**

```csv
name,experience,attendance_weeks,position
Sarah Murphy,8,6,forward
Aoife Kelly,3,4,midfield
Ciara O'Brien,9,7,forward
Niamh Walsh,5,2,defense
Sinead Ryan,7,6,midfield
Orla McCarthy,2,5,defense
Roisin Brennan,6,6,forward
Mairead Doyle,9,3,midfield
Caoimhe Flynn,4,5,defense
Aisling Connolly,7,6,forward
Grainne Sullivan,8,4,midfield
Fionnuala Gallagher,3,3,defense
Siobhan Doherty,5,7,forward
Deirdre Fitzgerald,9,5,defense
Eimear O'Neill,2,2,midfield
Clodagh Murray,8,6,forward
Sorcha Byrne,6,4,defense
Bronagh Kavanagh,4,3,midfield
Nuala Maguire,10,7,forward
Emer Higgins,7,5,midfield
```

**Derived values for verification:**

| Name | Exp | Weeks | Prob | Active Skill | Exp Cat | Attend Cat |
|------|-----|-------|------|--------------|---------|------------|
| Nuala Maguire | 10 | 7 | 1.00 | 10.0 | veteran | high |
| Ciara O'Brien | 9 | 7 | 1.00 | 9.0 | veteran | high |
| Sarah Murphy | 8 | 6 | 0.86 | 6.9 | veteran | high |
| Mairead Doyle | 9 | 3 | 0.43 | 3.9 | veteran | low |

---

### 6. UI Updates

**Scenario Selector Dropdown** (add to index.html):

```html
<div class="form-group">
  <label for="scenario">Optimization Scenario</label>
  <select id="scenario" onchange="onScenarioChange()">
    <option value="ratings_only">Ratings Only</option>
    <option value="with_positions">Ratings + Positions</option>
    <option value="balanced_positions">Position-wise Ratings</option>
    <option value="expected_active_skill">Expected Active Skill (Attendance+TopTwo)</option>
  </select>
  <small id="scenario-description" class="description">
    Balance teams by total skill rating only
  </small>
</div>
```

**CSV Format Help** (dynamic based on selected scenario):

```html
<div id="csv-format-help" class="help-text">
  <!-- Updated dynamically when scenario changes -->
  <strong>Required CSV columns:</strong>
  <code>name,rating,position</code>
</div>
```

**Results Display** (additional metrics for new scenario):

For `expected_active_skill` scenario, display:
- Active Skill per team (scaled back from MiniZinc integers)
- Attendance total per team
- Top-2 experience per team
- Experience category badges (Novice/Intermediate/Veteran)
- Attendance indicator (Low/Mid/High or weeks: "6/7")

**Sample Display:**
```
Team A (Active Skill: 45.2)
  1. Nuala Maguire    | forward  | Exp: 10 (Veteran) | Attend: 7/7 (High)
  2. Ciara O'Brien    | forward  | Exp: 9 (Veteran)  | Attend: 7/7 (High)
  3. Sinead Ryan      | midfield | Exp: 7 (Inter.)   | Attend: 6/7 (High)
  ...

Team B (Active Skill: 44.8)
  ...

Balance Summary:
  Active Skill Diff: 0.4
  Attendance Diff: 2 weeks
  Top-2 Diff: 1 (19 vs 18)
  Position: ✓ Balanced
```

---

## Testing Plan

### 1. Backwards Compatibility Tests (Critical)

| Test | Expected Result |
|------|-----------------|
| Old CSV + `ratings_only` | Works as before |
| Old CSV + `with_positions` | Works as before |
| Old CSV + `balanced_positions` | Works as before |
| Old CSV + `expected_active_skill` | **Error with helpful message** |
| New CSV + `expected_active_skill` | Works with new scenario |
| New CSV + `ratings_only` | Works (experience mapped to rating) |

### 2. CSV Parsing Tests

```bash
# Test old format parsing
npx tsx -e "
import { parseCSV } from './src/shared/utils.js';
const oldCSV = 'name,rating,position\nAlice,8,forward\nBob,6,midfield';
console.log(parseCSV(oldCSV));
"

# Test new format parsing  
npx tsx -e "
import { parseCSV } from './src/shared/utils.js';
const newCSV = 'name,experience,attendance_weeks,position\nAlice,8,6,forward\nBob,6,4,midfield';
console.log(parseCSV(newCSV));
"
```

### 3. MiniZinc Model Tests

```bash
# Test model syntax
minizinc --model-check-only models/team_assignment_expected_skill.mzn

# Test with sample data
minizinc models/team_assignment_expected_skill.mzn \
  -D "num_players=4; experiences=[80,60,90,70]; attendances=[86,57,100,43]; position_indices=[1,2,1,3];" \
  --solver cbc
```

### 4. CLI Tests

```bash
# Test new scenario via CLI
npx tsx src/cli/commands.ts --solver cbc --scenario expected_active_skill --file data/test-players-expected-skill.csv

# Test all scenarios still work
npm run test:all-scenarios
```

### 5. Local Mode Tests (http://localhost:3000)

1. Upload old CSV → select old scenario → verify works
2. Upload old CSV → select new scenario → verify error message
3. Upload new CSV → select new scenario → verify results
4. Verify scenario dropdown updates description text

### 6. WASM Mode Tests (http://localhost:8080 or GitHub Pages)

1. Same tests as local mode
2. Verify model is embedded correctly in bundle.js
3. Verify all solvers work (gecode, chuffed, cbc)

### 7. Edge Cases

| Case | Expected |
|------|----------|
| attendance_weeks = 0 | Handled (probability = 0) |
| attendance_weeks = 7 | Handled (probability = 1) |
| experience = 1 (minimum) | Categorized as "novice" |
| experience = 10 (maximum) | Categorized as "veteran" |
| Team size < 4 | TopTwo still works (uses available players) |
| Ties in experience | TopTwo selects any valid pair |

---

## Implementation Order

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `data/test-players-expected-skill.csv` | CREATE | Sample data with new format |
| 2 | `src/solver/types.ts` | MODIFY | Add optional experience/attendance fields |
| 3 | `src/shared/utils.ts` | MODIFY | Extend parseCSV, add validation |
| 4 | `models/team_assignment_expected_skill.mzn` | CREATE | New MiniZinc model |
| 5 | `src/shared/constants.ts` | MODIFY | Register new scenario |
| 6 | `public/bundle.js` | MODIFY | Embed model, update parsing, add dropdown |
| 7 | `public/index.html` | MODIFY | Add scenario selector UI |
| 8 | Test backwards compatibility | TEST | Verify old scenarios unchanged |
| 9 | Test new scenario | TEST | CLI, Local, WASM modes |
| 10 | Deploy to GitHub Pages | DEPLOY | Push to trigger CI/CD |

---

## Technical Notes

### Integer Scaling for MiniZinc
MiniZinc works with integers, so we scale:
- Experience: ×10 (1-10 → 10-100)
- Attendance probability: ×100 (0.0-1.0 → 0-100)
- Weights: Already integers (60, 25, 15 summing to 100)

### Attendance Calculation
```
attendance_weeks (0-7) → probability = attendance_weeks / 7
probability (0-1) → MiniZinc int = round(probability × 100)
```

Example: 6 weeks → 6/7 = 0.857 → 86 (MiniZinc)

### TopTwo with Indicator Variables

The indicator variable approach is more robust than using MiniZinc's `sort` constraint:

1. **Binary indicators**: `is_top2_a[p]` = 1 if player p is top-2 in Team A
2. **Team membership**: Players can only be top-2 in their assigned team
3. **Cardinality**: Exactly 2 players marked as top-2 per team
4. **Dominance**: If marked top-2, experience ≥ all non-top-2 teammates

This avoids issues with:
- Zero-padding in sorted arrays
- WASM solver compatibility
- Tie-breaking edge cases

### Backward Compatibility Guarantees

1. **No changes to existing model files** - All 3 existing `.mzn` files unchanged
2. **No changes to existing data format** - Old CSVs continue to work
3. **Type extensions only** - New fields are optional (via `?` modifier)
4. **Runtime detection** - CSV format detected by header inspection
5. **Graceful degradation** - New CSV works with old scenarios (experience→rating)

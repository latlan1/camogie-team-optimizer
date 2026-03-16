/**
 * Shared constants for the Camogie Team Optimization application
 */

// Scenario definitions
export const SCENARIOS = {
  ratings_only: {
    id: 'ratings_only',
    name: 'Ratings Only',
    description: 'Balance teams by total skill rating only',
    modelFile: 'team_assignment_ratings_only.mzn',
  },
  with_positions: {
    id: 'with_positions',
    name: 'Ratings + Positions',
    description: 'Balance ratings AND position distribution (forwards, midfield, defense)',
    modelFile: 'team_assignment_with_positions.mzn',
  },
  balanced_positions: {
    id: 'balanced_positions',
    name: 'Position-wise Ratings',
    description: 'Minimize rating difference within each position group (balanced skill per position)',
    modelFile: 'team_assignment_balanced_positions.mzn',
  },
  expected_active_skill: {
    id: 'expected_active_skill',
    name: 'Expected Active Skill (Attendance+TopTwo)',
    description:
      'Original TopTwo/sort implementation for active skill, attendance, top two experience, and position distribution',
    modelFile: 'team_assignment_expected_skill.mzn',
  },
  expected_active_skill_mip: {
    id: 'expected_active_skill_mip',
    name: 'Expected Active Skill (MIP)',
    description:
      'MIP-friendly TopTwo implementation designed to run across all local solvers',
    modelFile: 'team_assignment_expected_skill_mip.mzn',
  },
  active_skill_plus: {
    id: 'active_skill_plus',
    name: 'Active Skill Plus (Attendance+Top2+Friends+Captains)',
    description:
      'Expected active skill with Top2, friend pairing, high-attendance coverage, and captain split constraints',
    modelFile: 'team_assignment_active_skill_plus.mzn',
  },
} as const;

export type ScenarioId = keyof typeof SCENARIOS;

export const DEFAULT_SCENARIO: ScenarioId = 'ratings_only';

// Position mappings (must match MiniZinc model constants)
export const POSITIONS = {
  forward: { index: 1, name: 'forward', sortOrder: 3 },
  midfield: { index: 2, name: 'midfield', sortOrder: 2 },
  defense: { index: 3, name: 'defense', sortOrder: 1 },
  unknown: { index: 0, name: 'unknown', sortOrder: 99 },
} as const;

export type PositionName = keyof typeof POSITIONS;

// Solver configurations
export const SOLVERS = {
  // Local mode solvers (Node.js with native MiniZinc)
  local: ['cbc', 'coinbc', 'cp-sat', 'chuffed'] as const,
  // WASM mode solvers (browser)
  wasm: ['gecode', 'chuffed', 'cbc'] as const,
} as const;

export const DEFAULT_SOLVER = 'cbc';
export const DEFAULT_TIME_LIMIT = 10000; // 10 seconds

// Rating weight for objective function (in with_positions scenario)
export const RATING_WEIGHT = 10;

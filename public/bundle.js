// Client-side JS with dual-mode support (Express API + WASM)

const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const solverSelect = document.getElementById('solver');
const scenarioSelect = document.getElementById('scenario');
const solveBtn = document.getElementById('solveBtn');
const loading = document.getElementById('loading');
const results = document.getElementById('results');
const fileName = document.getElementById('fileName');

// Mode banner elements
const modeBanner = document.getElementById('modeBanner');
const modeLabel = document.getElementById('modeLabel');
const modeDetails = document.getElementById('modeDetails');
const solversAvailable = document.getElementById('solversAvailable');

let csvData = null;
let currentMode = 'local'; // 'local' or 'wasm'
let wasmInitialized = false;
let MiniZinc = null;
const TOTAL_SEASON_WEEKS = 7;

function isExpectedSkillScenario(scenario) {
  return (
    scenario === 'expected_active_skill' ||
    scenario === 'expected_active_skill_mip' ||
    scenario === 'active_skill_plus'
  );
}

// MiniZinc model code (embedded for WASM mode)
const RATINGS_ONLY_MODEL = `
% Camogie Team Assignment Model (balanced by ratings)
int: num_players;
array[1..num_players] of int: ratings;
array[1..num_players] of int: position_indices;

array[1..num_players] of var 0..1: team_assignment;

var int: team_a_size = sum(p in 1..num_players)(1 - team_assignment[p]);
var int: team_b_size = num_players - team_a_size;
constraint abs(team_a_size - team_b_size) <= 1;

var int: total_rating_a = sum(p in 1..num_players)(ratings[p] * (1 - team_assignment[p]));
var int: total_rating_b = sum(p in 1..num_players)(ratings[p] * team_assignment[p]);
var int: rating_diff = abs(total_rating_a - total_rating_b);

solve minimize rating_diff;
`;

const WITH_POSITIONS_MODEL = `
% Camogie Team Assignment Model (ratings + position balance)
int: num_players;
array[1..num_players] of int: ratings;
array[1..num_players] of int: position_indices;

int: NUM_POSITIONS = 3;
int: POS_FORWARD = 1;
int: POS_MIDFIELD = 2;
int: POS_DEFENSE = 3;
int: RATING_WEIGHT = 10;

array[1..num_players] of var 0..1: team_assignment;

var int: team_a_size = sum(p in 1..num_players)(1 - team_assignment[p]);
var int: team_b_size = num_players - team_a_size;
constraint abs(team_a_size - team_b_size) <= 1;

var int: total_rating_a = sum(p in 1..num_players)(ratings[p] * (1 - team_assignment[p]));
var int: total_rating_b = sum(p in 1..num_players)(ratings[p] * team_assignment[p]);
var int: rating_diff = abs(total_rating_a - total_rating_b);

var int: forwards_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then (1 - team_assignment[p]) else 0 endif
);
var int: midfield_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then (1 - team_assignment[p]) else 0 endif
);
var int: defense_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then (1 - team_assignment[p]) else 0 endif
);

var int: forwards_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then team_assignment[p] else 0 endif
);
var int: midfield_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then team_assignment[p] else 0 endif
);
var int: defense_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then team_assignment[p] else 0 endif
);

constraint abs(forwards_a - forwards_b) <= 1;
constraint abs(midfield_a - midfield_b) <= 1;
constraint abs(defense_a - defense_b) <= 1;

var int: forward_diff = abs(forwards_a - forwards_b);
var int: midfield_diff = abs(midfield_a - midfield_b);
var int: defense_diff = abs(defense_a - defense_b);
var int: position_diff = forward_diff + midfield_diff + defense_diff;

var int: objective = rating_diff * RATING_WEIGHT + position_diff;

solve minimize objective;
`;

const BALANCED_POSITIONS_MODEL = `
% Camogie Team Assignment Model (position-wise rating balance)
int: num_players;
array[1..num_players] of int: ratings;
array[1..num_players] of int: position_indices;

int: NUM_POSITIONS = 3;
int: POS_FORWARD = 1;
int: POS_MIDFIELD = 2;
int: POS_DEFENSE = 3;

array[1..num_players] of var 0..1: team_assignment;

var int: team_a_size = sum(p in 1..num_players)(1 - team_assignment[p]);
var int: team_b_size = num_players - team_a_size;
constraint abs(team_a_size - team_b_size) <= 1;

var int: total_rating_a = sum(p in 1..num_players)(ratings[p] * (1 - team_assignment[p]));
var int: total_rating_b = sum(p in 1..num_players)(ratings[p] * team_assignment[p]);
var int: rating_diff = abs(total_rating_a - total_rating_b);

var int: forward_rating_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then ratings[p] * (1 - team_assignment[p]) else 0 endif
);
var int: midfield_rating_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then ratings[p] * (1 - team_assignment[p]) else 0 endif
);
var int: defense_rating_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then ratings[p] * (1 - team_assignment[p]) else 0 endif
);

var int: forward_rating_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then ratings[p] * team_assignment[p] else 0 endif
);
var int: midfield_rating_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then ratings[p] * team_assignment[p] else 0 endif
);
var int: defense_rating_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then ratings[p] * team_assignment[p] else 0 endif
);

var int: forward_rating_diff = abs(forward_rating_a - forward_rating_b);
var int: midfield_rating_diff = abs(midfield_rating_a - midfield_rating_b);
var int: defense_rating_diff = abs(defense_rating_a - defense_rating_b);

var int: objective = forward_rating_diff + midfield_rating_diff + defense_rating_diff;

solve minimize objective;
`;

const EXPECTED_ACTIVE_SKILL_MODEL = `
include "globals.mzn";

int: num_players;
array[1..num_players] of int: experiences;
array[1..num_players] of int: attendances;
array[1..num_players] of int: position_indices;

int: POS_FORWARD = 1;
int: POS_MIDFIELD = 2;
int: POS_DEFENSE = 3;

int: W_ACTIVE = 60;
int: W_ATTEND = 25;
int: W_TOPTWO = 15;

int: MAX_EXP = if num_players > 0 then max(experiences) else 0 endif;
constraint num_players >= 4;

array[1..num_players] of var 0..1: team_assignment;

var int: team_a_size = sum(p in 1..num_players)(1 - team_assignment[p]);
var int: team_b_size = num_players - team_a_size;
constraint abs(team_a_size - team_b_size) <= 1;

array[1..num_players] of int: active_skills = [experiences[p] * attendances[p] | p in 1..num_players];

var int: active_skill_a = sum(p in 1..num_players)(active_skills[p] * (1 - team_assignment[p]));
var int: active_skill_b = sum(p in 1..num_players)(active_skills[p] * team_assignment[p]);

var int: attend_a = sum(p in 1..num_players)(attendances[p] * (1 - team_assignment[p]));
var int: attend_b = sum(p in 1..num_players)(attendances[p] * team_assignment[p]);

var int: forwards_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then (1 - team_assignment[p]) else 0 endif
);
var int: midfield_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then (1 - team_assignment[p]) else 0 endif
);
var int: defense_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then (1 - team_assignment[p]) else 0 endif
);

var int: forwards_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then team_assignment[p] else 0 endif
);
var int: midfield_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then team_assignment[p] else 0 endif
);
var int: defense_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then team_assignment[p] else 0 endif
);

constraint abs(forwards_a - forwards_b) <= 1;
constraint abs(midfield_a - midfield_b) <= 1;
constraint abs(defense_a - defense_b) <= 1;

array[1..num_players] of var 0..1: is_top2_a;
array[1..num_players] of var 0..1: is_top2_b;

constraint forall(p in 1..num_players)(is_top2_a[p] <= (1 - team_assignment[p]));
constraint forall(p in 1..num_players)(is_top2_b[p] <= team_assignment[p]);
constraint sum(p in 1..num_players)(is_top2_a[p]) = 2;
constraint sum(p in 1..num_players)(is_top2_b[p]) = 2;

constraint forall(i in 1..num_players, j in 1..num_players where i != j)(
  ((1 - team_assignment[i]) = 1 /\\ (1 - team_assignment[j]) = 1 /\\
   is_top2_a[i] = 1 /\\ is_top2_a[j] = 0)
  -> experiences[i] >= experiences[j]
);

constraint forall(i in 1..num_players, j in 1..num_players where i != j)(
  (team_assignment[i] = 1 /\\ team_assignment[j] = 1 /\\
   is_top2_b[i] = 1 /\\ is_top2_b[j] = 0)
  -> experiences[i] >= experiences[j]
);

array[1..num_players] of var 0..MAX_EXP: top2_exp_a_raw;
array[1..num_players] of var 0..MAX_EXP: top2_exp_b_raw;

constraint forall(p in 1..num_players)(top2_exp_a_raw[p] = experiences[p] * is_top2_a[p]);
constraint forall(p in 1..num_players)(top2_exp_b_raw[p] = experiences[p] * is_top2_b[p]);

array[1..num_players] of var 0..MAX_EXP: top2_exp_a_sorted;
array[1..num_players] of var 0..MAX_EXP: top2_exp_b_sorted;

constraint sort(top2_exp_a_raw, top2_exp_a_sorted);
constraint sort(top2_exp_b_raw, top2_exp_b_sorted);

var int: top_two_a = top2_exp_a_sorted[num_players] + top2_exp_a_sorted[num_players - 1];
var int: top_two_b = top2_exp_b_sorted[num_players] + top2_exp_b_sorted[num_players - 1];

var int: active_skill_diff = abs(active_skill_a - active_skill_b);
var int: attend_diff = abs(attend_a - attend_b);
var int: top_two_diff = abs(top_two_a - top_two_b);

var int: objective =
  W_ACTIVE * active_skill_diff +
  W_ATTEND * attend_diff +
  W_TOPTWO * top_two_diff;

solve minimize objective;
`;

const EXPECTED_ACTIVE_SKILL_MIP_MODEL = `
int: num_players;
array[1..num_players] of int: experiences;
array[1..num_players] of int: attendances;
array[1..num_players] of int: position_indices;

int: POS_FORWARD = 1;
int: POS_MIDFIELD = 2;
int: POS_DEFENSE = 3;

int: W_ACTIVE = 60;
int: W_ATTEND = 25;
int: W_TOPTWO = 15;

int: MAX_EXP = if num_players > 0 then max(experiences) else 0 endif;
int: BIG_M = MAX_EXP + 1;
constraint num_players >= 4;

array[1..num_players] of var 0..1: team_assignment;

var int: team_a_size = sum(p in 1..num_players)(1 - team_assignment[p]);
var int: team_b_size = num_players - team_a_size;
constraint abs(team_a_size - team_b_size) <= 1;

array[1..num_players] of int: active_skills = [experiences[p] * attendances[p] | p in 1..num_players];

var int: active_skill_a = sum(p in 1..num_players)(active_skills[p] * (1 - team_assignment[p]));
var int: active_skill_b = sum(p in 1..num_players)(active_skills[p] * team_assignment[p]);

var int: attend_a = sum(p in 1..num_players)(attendances[p] * (1 - team_assignment[p]));
var int: attend_b = sum(p in 1..num_players)(attendances[p] * team_assignment[p]);

var int: forwards_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then (1 - team_assignment[p]) else 0 endif
);
var int: midfield_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then (1 - team_assignment[p]) else 0 endif
);
var int: defense_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then (1 - team_assignment[p]) else 0 endif
);

var int: forwards_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then team_assignment[p] else 0 endif
);
var int: midfield_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then team_assignment[p] else 0 endif
);
var int: defense_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then team_assignment[p] else 0 endif
);

constraint abs(forwards_a - forwards_b) <= 1;
constraint abs(midfield_a - midfield_b) <= 1;
constraint abs(defense_a - defense_b) <= 1;

array[1..num_players] of var 0..1: is_top2_a;
array[1..num_players] of var 0..1: is_top2_b;

constraint forall(p in 1..num_players)(is_top2_a[p] <= (1 - team_assignment[p]));
constraint forall(p in 1..num_players)(is_top2_b[p] <= team_assignment[p]);
constraint sum(p in 1..num_players)(is_top2_a[p]) = 2;
constraint sum(p in 1..num_players)(is_top2_b[p]) = 2;

constraint forall(i in 1..num_players, j in 1..num_players where i != j)(
  experiences[i]
  + BIG_M * (1 - is_top2_a[i])
  + BIG_M * team_assignment[i]
  + BIG_M * team_assignment[j]
  + BIG_M * is_top2_a[j]
  >= experiences[j]
);

constraint forall(i in 1..num_players, j in 1..num_players where i != j)(
  experiences[i]
  + BIG_M * (1 - is_top2_b[i])
  + BIG_M * (1 - team_assignment[i])
  + BIG_M * (1 - team_assignment[j])
  + BIG_M * is_top2_b[j]
  >= experiences[j]
);

var int: top_two_a = sum(p in 1..num_players)(experiences[p] * is_top2_a[p]);
var int: top_two_b = sum(p in 1..num_players)(experiences[p] * is_top2_b[p]);

var int: active_skill_diff = abs(active_skill_a - active_skill_b);
var int: attend_diff = abs(attend_a - attend_b);
var int: top_two_diff = abs(top_two_a - top_two_b);

var int: objective =
  W_ACTIVE * active_skill_diff +
  W_ATTEND * attend_diff +
  W_TOPTWO * top_two_diff;

solve minimize objective;
`;

const ACTIVE_SKILL_PLUS_MODEL = `
int: num_players;
array[1..num_players] of int: experiences;
array[1..num_players] of int: attendances;
array[1..num_players] of int: position_indices;
array[1..num_players] of int: is_captain;
array[1..num_players] of int: friend_group_ids;
array[1..num_players] of int: high_attendance_flags;

int: POS_FORWARD = 1;
int: POS_MIDFIELD = 2;
int: POS_DEFENSE = 3;

int: W_ACTIVE = 60;
int: W_ATTEND = 25;
int: W_TOPTWO = 15;

int: MAX_EXP = if num_players > 0 then max(experiences) else 0 endif;
int: BIG_M = MAX_EXP + 1;

constraint num_players >= 4;
constraint sum(p in 1..num_players)(is_captain[p]) = 2;

array[1..num_players] of var 0..1: team_assignment;

var int: team_a_size = sum(p in 1..num_players)(1 - team_assignment[p]);
var int: team_b_size = num_players - team_a_size;
constraint abs(team_a_size - team_b_size) <= 1;

constraint sum(p in 1..num_players)((1 - team_assignment[p]) * is_captain[p]) = 1;
constraint sum(p in 1..num_players)(team_assignment[p] * is_captain[p]) = 1;

constraint sum(p in 1..num_players)((1 - team_assignment[p]) * high_attendance_flags[p]) >= 1;
constraint sum(p in 1..num_players)(team_assignment[p] * high_attendance_flags[p]) >= 1;

constraint forall(i in 1..num_players, j in i+1..num_players)(
  (friend_group_ids[i] > 0 /\\ friend_group_ids[i] = friend_group_ids[j])
  -> team_assignment[i] = team_assignment[j]
);

array[1..num_players] of int: active_skills = [experiences[p] * attendances[p] | p in 1..num_players];

var int: active_skill_a = sum(p in 1..num_players)(active_skills[p] * (1 - team_assignment[p]));
var int: active_skill_b = sum(p in 1..num_players)(active_skills[p] * team_assignment[p]);

var int: attend_a = sum(p in 1..num_players)(attendances[p] * (1 - team_assignment[p]));
var int: attend_b = sum(p in 1..num_players)(attendances[p] * team_assignment[p]);

var int: forwards_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then (1 - team_assignment[p]) else 0 endif
);
var int: midfield_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then (1 - team_assignment[p]) else 0 endif
);
var int: defense_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then (1 - team_assignment[p]) else 0 endif
);

var int: forwards_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then team_assignment[p] else 0 endif
);
var int: midfield_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then team_assignment[p] else 0 endif
);
var int: defense_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then team_assignment[p] else 0 endif
);

constraint abs(forwards_a - forwards_b) <= 1;
constraint abs(midfield_a - midfield_b) <= 1;
constraint abs(defense_a - defense_b) <= 1;

array[1..num_players] of var 0..1: is_top2_a;
array[1..num_players] of var 0..1: is_top2_b;

constraint forall(p in 1..num_players)(is_top2_a[p] <= (1 - team_assignment[p]));
constraint forall(p in 1..num_players)(is_top2_b[p] <= team_assignment[p]);
constraint sum(p in 1..num_players)(is_top2_a[p]) = 2;
constraint sum(p in 1..num_players)(is_top2_b[p]) = 2;

constraint forall(i in 1..num_players, j in 1..num_players where i != j)(
  experiences[i]
  + BIG_M * (1 - is_top2_a[i])
  + BIG_M * team_assignment[i]
  + BIG_M * team_assignment[j]
  + BIG_M * is_top2_a[j]
  >= experiences[j]
);

constraint forall(i in 1..num_players, j in 1..num_players where i != j)(
  experiences[i]
  + BIG_M * (1 - is_top2_b[i])
  + BIG_M * (1 - team_assignment[i])
  + BIG_M * (1 - team_assignment[j])
  + BIG_M * is_top2_b[j]
  >= experiences[j]
);

var int: top_two_a = sum(p in 1..num_players)(experiences[p] * is_top2_a[p]);
var int: top_two_b = sum(p in 1..num_players)(experiences[p] * is_top2_b[p]);

var int: active_skill_diff = abs(active_skill_a - active_skill_b);
var int: attend_diff = abs(attend_a - attend_b);
var int: top_two_diff = abs(top_two_a - top_two_b);

var int: objective =
  W_ACTIVE * active_skill_diff +
  W_ATTEND * attend_diff +
  W_TOPTWO * top_two_diff;

solve minimize objective;
`;

// Update scenario description when selection changes
scenarioSelect?.addEventListener('change', onScenarioChange);

function updateScenarioDescription() {
  const scenarioDesc = document.getElementById('scenarioDescription');
  const csvHint = document.getElementById('csvHint');
  const diffLabel = document.getElementById('diffLabel');
  const scenarioCoverage = document.getElementById('scenarioCoverage');
  if (!scenarioDesc) return;
  
  switch (scenarioSelect.value) {
    case 'with_positions':
      scenarioDesc.innerHTML = '<strong>Scenario:</strong> Ratings + Positions - Covers total rating balance and positional headcount balance (defense/midfield/forward). It does not account for attendance probability, top-two spread, captains, or friend constraints.';
      if (csvHint) {
        csvHint.innerHTML = 'CSV with columns: name, rating, position (<a href="./sample-players.csv" download style="color: #667eea;">download sample</a>)';
      }
      if (scenarioCoverage) {
        scenarioCoverage.textContent = 'Use when you want balanced team strength and rough positional parity. Not suitable if attendance, captain assignment, or friend pairing are required.';
      }
      if (diffLabel) diffLabel.textContent = 'Rating Difference';
      break;
    case 'balanced_positions':
      scenarioDesc.innerHTML = '<strong>Scenario:</strong> Position-wise Ratings - Covers balancing rating totals within each position line (defense/midfield/forward), reducing weak spots by line. It does not model attendance, top-two spread, captains, or friend constraints.';
      if (csvHint) {
        csvHint.innerHTML = 'CSV with columns: name, rating, position (<a href="./sample-players.csv" download style="color: #667eea;">download sample</a>)';
      }
      if (scenarioCoverage) {
        scenarioCoverage.textContent = 'Use when position-line strength matters more than only total team rating. This is still rating-based and does not include attendance or social constraints.';
      }
      if (diffLabel) diffLabel.textContent = 'Rating Difference';
      break;
    case 'expected_active_skill':
      scenarioDesc.innerHTML = '<strong>Scenario:</strong> Expected Active Skill (Attendance+TopTwo) - Covers expected active skill (experience × attendance), top-two spread, and positional balance. Original sort-based model; use CP-SAT/Chuffed, not CBC/COIN-BC.';
      if (csvHint) {
        csvHint.innerHTML = 'CSV with columns: name, experience, attendance_weeks, position (e.g. attendance_weeks 0-7)';
      }
      if (scenarioCoverage) {
        scenarioCoverage.textContent = 'Best when attendance uncertainty matters. Requires expected-skill CSV columns and does not include friend grouping or captain split rules.';
      }
      if (diffLabel) diffLabel.textContent = 'Active Skill Diff';
      break;
    case 'expected_active_skill_mip':
      scenarioDesc.innerHTML = '<strong>Scenario:</strong> Expected Active Skill (MIP) - Covers the same expected-skill goals as the original model but with a MIP-friendly TopTwo formulation for all local solvers (including CBC/COIN-BC).';
      if (csvHint) {
        csvHint.innerHTML = 'CSV with columns: name, experience, attendance_weeks, position (e.g. attendance_weeks 0-7)';
      }
      if (scenarioCoverage) {
        scenarioCoverage.textContent = 'Use this expected-skill variant when running CBC/COIN-BC or when you need broader solver compatibility. Still does not include friend/captain constraints.';
      }
      if (diffLabel) diffLabel.textContent = 'Active Skill Diff';
      break;
    case 'active_skill_plus':
      scenarioDesc.innerHTML = '<strong>Scenario:</strong> Active Skill Plus (Attendance+Top2+Friends+Captains) - Covers expected active skill + top-two + positional balance, and adds friend grouping, exactly two captains split across teams, and high-attendance coverage rules.';
      if (csvHint) {
        csvHint.innerHTML = 'CSV with columns: name, experience, attendance_weeks, position, captain, friend_group_id';
      }
      if (scenarioCoverage) {
        scenarioCoverage.textContent = 'Most complete scenario. Use when you need tactical, reliability, and social constraints together. Requires captain and friend_group_id columns.';
      }
      if (diffLabel) diffLabel.textContent = 'Active Skill Diff';
      break;
    default:
      scenarioDesc.innerHTML = '<strong>Scenario:</strong> Ratings Only - Covers total team rating balance only. It does not enforce positional balance, attendance, top-player spread, captains, or friend constraints.';
      if (csvHint) {
        csvHint.innerHTML = 'CSV with columns: name, rating, position (<a href="./sample-players.csv" download style="color: #667eea;">download sample</a>)';
      }
      if (scenarioCoverage) {
        scenarioCoverage.textContent = 'Fastest and simplest baseline. Great for quick balancing checks when you only care about total skill parity.';
      }
      if (diffLabel) diffLabel.textContent = 'Rating Difference';
  }
}

function validateCSVForScenario(headers, scenario) {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  if (scenario === 'expected_active_skill' || scenario === 'expected_active_skill_mip') {
    const hasName = normalized.includes('name');
    const hasExperience = normalized.includes('experience');
    const hasAttendanceWeeks = normalized.includes('attendance_weeks');
    const hasPosition = normalized.includes('position');
    if (!hasName || !hasExperience || !hasAttendanceWeeks || !hasPosition) {
      return {
        valid: false,
        error:
          "This scenario requires columns: name, experience, attendance_weeks, position",
      };
    }
    return { valid: true };
  }

  if (scenario === 'active_skill_plus') {
    const hasName = normalized.includes('name');
    const hasExperience = normalized.includes('experience');
    const hasAttendanceWeeks = normalized.includes('attendance_weeks');
    const hasPosition = normalized.includes('position');
    const hasCaptain = normalized.includes('captain');
    const hasFriendGroup = normalized.includes('friend_group_id');

    if (!hasName || !hasExperience || !hasAttendanceWeeks || !hasPosition || !hasCaptain || !hasFriendGroup) {
      return {
        valid: false,
        error:
          'This scenario requires columns: name, experience, attendance_weeks, position, captain, friend_group_id',
      };
    }

    return { valid: true };
  }

  if (scenario === 'with_positions' || scenario === 'balanced_positions') {
    const hasName = normalized.includes('name');
    const hasRating = normalized.includes('rating');
    const hasExperience = normalized.includes('experience');
    const hasPosition = normalized.includes('position');
    if (!hasName || (!hasRating && !hasExperience) || !hasPosition) {
      return {
        valid: false,
        error: 'This scenario requires columns: name, rating (or experience), position',
      };
    }
    return { valid: true };
  }

  const hasName = normalized.includes('name');
  const hasRating = normalized.includes('rating');
  const hasExperience = normalized.includes('experience');
  if (!hasName || (!hasRating && !hasExperience)) {
    return {
      valid: false,
      error: 'This scenario requires columns: name and rating (or experience)',
    };
  }
  return { valid: true };
}

function updateSolverOptionsForScenario() {
  const scenario = scenarioSelect?.value;
  if (!solverSelect || !scenario) {
    return;
  }

  if (currentMode === 'local') {
    const originalSolver = solverSelect.value;

    if (scenario === 'expected_active_skill') {
      solverSelect.innerHTML = `
        <option value="chuffed">Chuffed</option>
        <option value="cp-sat" selected>CP-SAT (OR-Tools)</option>
      `;
      if (originalSolver === 'chuffed' || originalSolver === 'cp-sat') {
        solverSelect.value = originalSolver;
      }
      return;
    }

    if (scenario === 'expected_active_skill_mip') {
      solverSelect.innerHTML = `
        <option value="cbc" selected>CBC (Fastest)</option>
        <option value="coinbc">COIN-BC</option>
        <option value="chuffed">Chuffed</option>
        <option value="cp-sat">CP-SAT (OR-Tools)</option>
      `;
      if (['cbc', 'coinbc', 'chuffed', 'cp-sat'].includes(originalSolver)) {
        solverSelect.value = originalSolver;
      }
      return;
    }

    solverSelect.innerHTML = `
      <option value="cbc" selected>CBC (Fastest)</option>
      <option value="coinbc">COIN-BC</option>
      <option value="chuffed">Chuffed</option>
      <option value="cp-sat">CP-SAT (OR-Tools)</option>
    `;
    if (['cbc', 'coinbc', 'chuffed', 'cp-sat'].includes(originalSolver)) {
      solverSelect.value = originalSolver;
    }
    return;
  }

  if (scenario === 'expected_active_skill') {
    solverSelect.innerHTML = `
      <option value="gecode" selected>Gecode (Default)</option>
      <option value="chuffed">Chuffed</option>
    `;
    return;
  }

  solverSelect.innerHTML = `
    <option value="gecode" selected>Gecode (Default)</option>
    <option value="chuffed">Chuffed</option>
    <option value="cbc">CBC</option>
  `;
}

function onScenarioChange() {
  updateScenarioDescription();
  updateSolverOptionsForScenario();
}

// Detect mode and update banner
async function detectMode() {
  try {
    // Try to reach the Express API - if it works, we're in local mode
    const response = await fetch('/api/scenarios');
    
    if (response.ok) {
      setMode('local', 'node');
    } else {
      await initWasmMode();
    }
  } catch (e) {
    // No server available, assume WASM mode
    await initWasmMode();
  }
}

async function initWasmMode() {
  setMode('wasm');
  
  // Show loading state while WASM initializes
  modeDetails.textContent = 'Loading MiniZinc WASM...';
  
  try {
    // Dynamically import MiniZinc (named exports: Model, init, solvers, version, shutdown)
    const module = await import('./minizinc.mjs');
    MiniZinc = module;
    
    // Build absolute URLs for WASM files
    const baseURL = new URL('./', import.meta.url);
    const workerURL = new URL('./minizinc-worker.js', baseURL);
    const wasmURL = new URL('./minizinc.wasm', baseURL);
    const dataURL = new URL('./minizinc.data', baseURL);
    
    console.log('Initializing MiniZinc WASM with:', {
      workerURL: workerURL.toString(),
      wasmURL: wasmURL.toString(),
      dataURL: dataURL.toString(),
    });
    
    await MiniZinc.init({
      workerURL: workerURL,
      wasmURL: wasmURL,
      dataURL: dataURL,
    });
    
    // Verify initialization by checking available solvers
    const solverList = await MiniZinc.solvers();
    console.log('Available WASM solvers:', solverList.map(s => s.id));
    
    wasmInitialized = true;
    modeDetails.textContent = 'MiniZinc WASM Ready';
    console.log('MiniZinc WASM initialized successfully');
  } catch (e) {
    console.error('Failed to initialize MiniZinc WASM:', e);
    modeDetails.textContent = 'WASM init failed: ' + e.message;
  }
}

// Update favicon based on mode
function setFavicon(mode) {
  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon) {
    favicon.href = mode === 'wasm' ? './favicon-wasm.svg' : './favicon.svg';
  }
}

function setMode(mode, serverMode = null) {
  currentMode = mode;
  
  const solverList = document.getElementById('solverList');
  const infoNote = document.getElementById('infoNote');
  
  // Update favicon to match mode
  setFavicon(mode);
  
  if (mode === 'local') {
    modeBanner.classList.remove('wasm-mode');
    modeBanner.classList.add('local-mode');
    modeLabel.textContent = 'Local Mode';
    modeDetails.textContent = 'Using native MiniZinc binary';
    solversAvailable.textContent = 'Solvers: cbc, coinbc, chuffed, cp-sat';
    
    // Update solver dropdown for local mode
    solverSelect.innerHTML = `
      <option value="cbc" selected>CBC (Fastest)</option>
      <option value="coinbc">COIN-BC</option>
      <option value="chuffed">Chuffed</option>
      <option value="cp-sat">CP-SAT (OR-Tools)</option>
    `;
    
    // Update info box
    solverList.innerHTML = `
      <li><strong>CBC</strong> - Fastest (~150ms)</li>
      <li><strong>COIN-BC</strong> - MIP solver (~330ms)</li>
      <li><strong>Chuffed</strong> - Lazy clause gen (~370ms)</li>
      <li><strong>CP-SAT</strong> - OR-Tools (~440ms)</li>
    `;
    infoNote.textContent = 'Gecode is disabled on macOS ARM64 due to a threading bug in the native binary.';
  } else {
    modeBanner.classList.remove('local-mode');
    modeBanner.classList.add('wasm-mode');
    modeLabel.textContent = 'Browser Mode';
    modeDetails.textContent = 'Using MiniZinc WASM';
    solversAvailable.textContent = 'Solvers: gecode, chuffed, cbc';
    
    // Update solver dropdown for WASM mode
    solverSelect.innerHTML = `
      <option value="gecode" selected>Gecode (Default)</option>
      <option value="chuffed">Chuffed</option>
      <option value="cbc">CBC</option>
    `;
    
    // Update info box
    solverList.innerHTML = `
      <li><strong>Gecode</strong> - Default CP solver</li>
      <li><strong>Chuffed</strong> - Lazy clause generation</li>
      <li><strong>CBC</strong> - Linear programming</li>
    `;
    infoNote.textContent = 'CP-SAT is not available in browser/WASM mode.';
  }

  updateSolverOptionsForScenario();
}

// Initialize mode detection
detectMode();
onScenarioChange();

// Click to upload
dropZone.addEventListener('click', () => fileInput.click());

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#667eea';
  dropZone.style.background = '#f5f7ff';
});

dropZone.addEventListener('dragleave', () => {
  dropZone.style.borderColor = '#d0d5dd';
  dropZone.style.background = '#fafbfc';
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = '#d0d5dd';
  dropZone.style.background = '#fafbfc';
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) {
    handleFile(file);
  }
});

// Enable button when file is selected
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    handleFile(file);
  }
});

function handleFile(file) {
  fileName.textContent = file.name;
  dropZone.classList.add('has-file');
  const reader = new FileReader();
  reader.onload = (event) => {
    csvData = event.target.result;
    solveBtn.disabled = false;
  };
  reader.readAsText(file);
}

// Parse CSV to model data
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const players = [];
  const ratings = [];
  const positions = [];
  const positionIndices = [];
  const experiences = [];
  const attendances = [];
  const isCaptain = [];
  const friendGroupIds = [];
  const highAttendanceFlags = [];

  const positionMap = { forward: 1, midfield: 2, defense: 3, unknown: 0 };
  const nameIdx = headers.indexOf('name');
  const ratingIdx = headers.indexOf('rating');
  const positionIdx = headers.indexOf('position');
  const experienceIdx = headers.indexOf('experience');
  const attendanceWeeksIdx = headers.indexOf('attendance_weeks');
  const captainIdx = headers.indexOf('captain');
  const friendGroupIdx = headers.indexOf('friend_group_id');

  const hasNewFormat = experienceIdx !== -1 && attendanceWeeksIdx !== -1;

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    if (values.length >= 2) {
      const name = (nameIdx >= 0 ? values[nameIdx] : '') || `Player ${i}`;
      const position = (positionIdx >= 0 ? values[positionIdx] : 'unknown').toLowerCase() || 'unknown';
      let rating;
      let experience;
      let attendanceWeeks;
      let attendanceProbability;
      let experienceCategory;
      let attendanceCategory;
      let activeSkill;
      let playerIsCaptain;
      let playerFriendGroupId;
      let highAttendance;

      if (hasNewFormat) {
        experience = parseInt(values[experienceIdx], 10);
        attendanceWeeks = parseInt(values[attendanceWeeksIdx], 10);
        if (isNaN(experience) || isNaN(attendanceWeeks)) {
          continue;
        }
        experience = Math.max(1, Math.min(10, experience));
        attendanceWeeks = Math.max(0, Math.min(TOTAL_SEASON_WEEKS, attendanceWeeks));
        attendanceProbability = attendanceWeeks / TOTAL_SEASON_WEEKS;
        experienceCategory =
          experience <= 3 ? 'novice' : experience <= 7 ? 'intermediate' : 'veteran';
        attendanceCategory =
          attendanceWeeks <= 3 ? 'low' : attendanceWeeks <= 5 ? 'mid' : 'high';
        activeSkill = Number((experience * attendanceProbability).toFixed(2));
        rating = experience;
        const captainRaw = captainIdx >= 0 ? values[captainIdx]?.toLowerCase() : '';
        playerIsCaptain = captainRaw === '1' || captainRaw === 'true' || captainRaw === 'yes';
        playerFriendGroupId = friendGroupIdx >= 0 ? parseInt(values[friendGroupIdx], 10) : 0;
        if (isNaN(playerFriendGroupId ?? 0)) {
          playerFriendGroupId = 0;
        }
        highAttendance = attendanceWeeks >= 6;
        experiences.push(experience * 10);
        attendances.push(Math.round(attendanceProbability * 100));
        isCaptain.push(playerIsCaptain ? 1 : 0);
        friendGroupIds.push(playerFriendGroupId ?? 0);
        highAttendanceFlags.push(highAttendance ? 1 : 0);
      } else {
        if (ratingIdx >= 0) {
          rating = parseInt(values[ratingIdx], 10);
        } else if (experienceIdx >= 0) {
          rating = parseInt(values[experienceIdx], 10);
        }
        if (isNaN(rating)) {
          continue;
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
        isCaptain: playerIsCaptain,
        friendGroupId: playerFriendGroupId,
        highAttendance,
      });
      ratings.push(rating);
      positions.push(position);
      positionIndices.push(positionMap[position] || 0);
    }
  }

  return {
    players,
    data: {
      num_players: players.length,
      ratings,
      position_indices: positionIndices,
      ...(hasNewFormat
        ? {
            experiences,
            attendances,
            is_captain: isCaptain,
            friend_group_ids: friendGroupIds,
            high_attendance_flags: highAttendanceFlags,
          }
        : {}),
    },
    headers,
  };
}

// Sort players by position (defense, midfield, forward) then by name
function sortPlayers(players) {
  const positionOrder = { defense: 1, midfield: 2, forward: 3 };
  return [...players].sort((a, b) => {
    const posA = positionOrder[a.position?.toLowerCase()] || 99;
    const posB = positionOrder[b.position?.toLowerCase()] || 99;
    if (posA !== posB) return posA - posB;
    return a.name.localeCompare(b.name);
  });
}

function normalizePosition(position) {
  const pos = String(position || '').toLowerCase().trim();
  if (pos === 'gk' || pos === 'keeper' || pos === 'goalkeeper' || pos === 'goal keeper') {
    return 'goalkeeper';
  }
  if (pos.startsWith('def')) return 'defense';
  if (pos.startsWith('mid')) return 'midfield';
  if (pos.startsWith('for')) return 'forward';
  return 'unknown';
}

function stableNameSort(players) {
  return [...players].sort((a, b) => a.name.localeCompare(b.name));
}

function splitTeamForField(players) {
  const normalized = players.map((p) => ({ ...p, _normPos: normalizePosition(p.position) }));
  let goalkeeper = normalized.find((p) => p._normPos === 'goalkeeper') || null;
  const remaining = [...normalized];

  if (goalkeeper) {
    const idx = remaining.findIndex((p) => p.name === goalkeeper.name);
    if (idx >= 0) remaining.splice(idx, 1);
  }

  let defense = stableNameSort(remaining.filter((p) => p._normPos === 'defense'));
  const midfield = stableNameSort(remaining.filter((p) => p._normPos === 'midfield'));
  const forward = stableNameSort(remaining.filter((p) => p._normPos === 'forward'));

  if (!goalkeeper && defense.length > 0) {
    goalkeeper = defense[0];
    defense = defense.slice(1);
  }

  return {
    goalkeeper,
    lanes: { defense, midfield, forward },
  };
}

function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

function initialsFromName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function getLabelOffsets(number, team) {
  const parsed = Number(number);
  const idx = Number.isFinite(parsed) ? Math.abs(parsed) % 4 : 0;
  const redOffsets = [
    { dx: -48, dy: -16 },
    { dx: -54, dy: -4 },
    { dx: -50, dy: 10 },
    { dx: -44, dy: -10 },
  ];
  const whiteOffsets = [
    { dx: 16, dy: -16 },
    { dx: 20, dy: -2 },
    { dx: 14, dy: 12 },
    { dx: 18, dy: -10 },
  ];
  return team === 'red' ? redOffsets[idx] : whiteOffsets[idx];
}

function drawToken(svg, x, y, number, team, label = '', isCaptain = false) {
  const isRed = team === 'red';
  const circle = createSvgElement('circle', {
    cx: x,
    cy: y,
    r: 11,
    fill: isRed ? '#dc2626' : '#ffffff',
    stroke: isCaptain ? '#2563eb' : isRed ? '#7f1d1d' : '#1f2937',
    'stroke-width': isCaptain ? 3 : 1.2,
  });
  svg.appendChild(circle);

  const txt = createSvgElement('text', {
    x,
    y,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    'font-size': 10,
    'font-family': 'Inter, system-ui, sans-serif',
    fill: isRed ? '#ffffff' : '#1f2937',
    'font-weight': 700,
  });
  txt.textContent = String(number);
  svg.appendChild(txt);

  if (label) {
    const { dx, dy } = getLabelOffsets(number, team);
    const labelX = x + dx;
    const labelY = y + dy;
    const labelWidth = Math.max(38, Math.round(label.length * 5.8));

    const labelBg = createSvgElement('rect', {
      x: labelX - 2,
      y: labelY - 8,
      width: labelWidth,
      height: 14,
      rx: 3,
      fill: '#ffffff',
      stroke: '#d1d5db',
      'stroke-width': 0.6,
      opacity: 0.95,
    });
    svg.appendChild(labelBg);

    const initText = createSvgElement('text', {
      x: labelX,
      y: labelY,
      'text-anchor': 'start',
      'dominant-baseline': 'central',
      'font-size': 9,
      'font-family': 'Inter, system-ui, sans-serif',
      fill: '#374151',
      'font-weight': 600,
    });
    initText.textContent = label;
    svg.appendChild(initText);
  }
}

function splitFullHalf(players) {
  const sorted = stableNameSort(players);
  const fullCount = Math.max(1, Math.floor(sorted.length / 2));
  return {
    full: sorted.slice(0, fullCount),
    half: sorted.slice(fullCount),
  };
}

function drawPairGroup(
  svg,
  redPlayers,
  whitePlayers,
  anchorX,
  centerY,
  side,
  redPositionAbbr,
  whitePositionAbbr,
  fieldBottomY
) {
  const pairGap = 34;
  const rowGap = 44;
  const pairCount = Math.min(redPlayers.length, whitePlayers.length);
  const startY = centerY - ((Math.max(pairCount, 1) - 1) * rowGap) / 2;

  for (let i = 0; i < pairCount; i++) {
    const y = startY + i * rowGap;
    const red = redPlayers[i];
    const white = whitePlayers[i];
    const redNum = red?.displayNumber || i + 1;
    const whiteNum = white?.displayNumber || i + 1;
    drawToken(
      svg,
      anchorX,
      y,
      redNum,
      'red',
      `${initialsFromName(red?.name)} (${redPositionAbbr})`,
      !!red?.isCaptain
    );
    drawToken(
      svg,
      anchorX + pairGap,
      y,
      whiteNum,
      'white',
      `${initialsFromName(white?.name)} (${whitePositionAbbr})`,
      !!white?.isCaptain
    );
  }

  // Overflow off-field, near expected play side/lane
  const overflowRed = redPlayers.slice(pairCount);
  const overflowWhite = whitePlayers.slice(pairCount);

  const overflowBaseX = anchorX;
  const overflowRedY = fieldBottomY + (side === 'left' ? 16 : side === 'right' ? 42 : 28);
  const overflowWhiteY = overflowRedY + 22;

  overflowRed.forEach((p, idx) => {
    const x = overflowBaseX + idx * 34;
    const n = p?.displayNumber || pairCount + idx + 1;
    drawToken(
      svg,
      x,
      overflowRedY,
      n,
      'red',
      `${initialsFromName(p?.name)} (${redPositionAbbr})`,
      !!p?.isCaptain
    );
  });

  overflowWhite.forEach((p, idx) => {
    const x = overflowBaseX + 16 + idx * 34;
    const n = p?.displayNumber || pairCount + idx + 1;
    drawToken(
      svg,
      x,
      overflowWhiteY,
      n,
      'white',
      `${initialsFromName(p?.name)} (${whitePositionAbbr})`,
      !!p?.isCaptain
    );
  });
}

function renderCombinedField(teamAPlayers, teamBPlayers) {
  const svg = document.getElementById('teamFieldSvg');
  if (!svg) return;
  svg.innerHTML = '';

  const a = splitTeamForField(teamAPlayers);
  const b = splitTeamForField(teamBPlayers);

  const field = { x: 80, y: 50, w: 820, h: 300 };

  const outer = createSvgElement('rect', {
    x: 20,
    y: 18,
    width: 940,
    height: 384,
    rx: 12,
    fill: '#f8fafc',
    stroke: '#d1d5db',
  });
  svg.appendChild(outer);

  const fieldRect = createSvgElement('rect', {
    x: field.x,
    y: field.y,
    width: field.w,
    height: field.h,
    rx: 8,
    fill: '#ecfdf5',
    stroke: '#86efac',
  });
  svg.appendChild(fieldRect);

  const fiftyLeft = createSvgElement('line', {
    x1: field.x + 180,
    y1: field.y,
    x2: field.x + 180,
    y2: field.y + field.h,
    stroke: '#22c55e',
    'stroke-width': 1,
    opacity: 0.7,
  });
  const fiftyRight = createSvgElement('line', {
    x1: field.x + field.w - 180,
    y1: field.y,
    x2: field.x + field.w - 180,
    y2: field.y + field.h,
    stroke: '#22c55e',
    'stroke-width': 1,
    opacity: 0.7,
  });
  svg.appendChild(fiftyLeft);
  svg.appendChild(fiftyRight);

  const halfway = createSvgElement('line', {
    x1: field.x + field.w / 2,
    y1: field.y,
    x2: field.x + field.w / 2,
    y2: field.y + field.h,
    stroke: '#6ee7b7',
    'stroke-width': 1.4,
  });
  svg.appendChild(halfway);

  const centerOuter = createSvgElement('circle', {
    cx: field.x + field.w / 2,
    cy: field.y + field.h / 2,
    r: 42,
    fill: 'none',
    stroke: '#22c55e',
    'stroke-width': 1,
  });
  const centerInner = createSvgElement('circle', {
    cx: field.x + field.w / 2,
    cy: field.y + field.h / 2,
    r: 6,
    fill: '#22c55e',
  });
  svg.appendChild(centerOuter);
  svg.appendChild(centerInner);

  // Small and large rectangles near goals
  const leftSmall = createSvgElement('rect', {
    x: field.x,
    y: field.y + field.h / 2 - 36,
    width: 60,
    height: 72,
    fill: 'none',
    stroke: '#22c55e',
    'stroke-width': 1,
  });
  const leftLarge = createSvgElement('rect', {
    x: field.x,
    y: field.y + field.h / 2 - 72,
    width: 120,
    height: 144,
    fill: 'none',
    stroke: '#22c55e',
    'stroke-width': 1,
  });
  const rightSmall = createSvgElement('rect', {
    x: field.x + field.w - 60,
    y: field.y + field.h / 2 - 36,
    width: 60,
    height: 72,
    fill: 'none',
    stroke: '#22c55e',
    'stroke-width': 1,
  });
  const rightLarge = createSvgElement('rect', {
    x: field.x + field.w - 120,
    y: field.y + field.h / 2 - 72,
    width: 120,
    height: 144,
    fill: 'none',
    stroke: '#22c55e',
    'stroke-width': 1,
  });
  svg.appendChild(leftSmall);
  svg.appendChild(leftLarge);
  svg.appendChild(rightSmall);
  svg.appendChild(rightLarge);

  const leftGoal = createSvgElement('rect', {
    x: field.x - 12,
    y: field.y + field.h / 2 - 32,
    width: 12,
    height: 64,
    fill: '#b91c1c',
  });
  const rightGoal = createSvgElement('rect', {
    x: field.x + field.w,
    y: field.y + field.h / 2 - 32,
    width: 12,
    height: 64,
    fill: '#e5e7eb',
  });
  svg.appendChild(leftGoal);
  svg.appendChild(rightGoal);

  const leftLabel = createSvgElement('text', {
    x: field.x + 6,
    y: field.y - 12,
    'font-size': 12,
    fill: '#991b1b',
    'font-family': 'Inter, system-ui, sans-serif',
    'font-weight': 600,
  });
  leftLabel.textContent = 'Red goal (Team A defends)';
  svg.appendChild(leftLabel);

  const rightLabel = createSvgElement('text', {
    x: field.x + field.w - 232,
    y: field.y - 12,
    'font-size': 12,
    fill: '#374151',
    'font-family': 'Inter, system-ui, sans-serif',
    'font-weight': 600,
  });
  rightLabel.textContent = 'White goal (Team A attacks)';
  svg.appendChild(rightLabel);

  // Goalkeepers are intentionally not drawn as markers.

  const aDefense = splitFullHalf(a.lanes.defense || []);
  const bDefense = splitFullHalf(b.lanes.defense || []);
  const aForward = splitFullHalf(a.lanes.forward || []);
  const bForward = splitFullHalf(b.lanes.forward || []);

  // Team A defense vs Team B offense (left side)
  drawPairGroup(
    svg,
    aDefense.full,
    bForward.full,
    170,
    115,
    'left',
    'FB',
    'FF',
    field.y + field.h
  );
  drawPairGroup(
    svg,
    aDefense.half,
    bForward.half,
    300,
    185,
    'left',
    'HB',
    'HF',
    field.y + field.h
  );

  // Midfield (center)
  drawPairGroup(
    svg,
    a.lanes.midfield || [],
    b.lanes.midfield || [],
    470,
    225,
    'mid',
    'MF',
    'MF',
    field.y + field.h
  );

  // Team A offense vs Team B defense (right side)
  drawPairGroup(
    svg,
    aForward.half,
    bDefense.half,
    630,
    265,
    'right',
    'HF',
    'HB',
    field.y + field.h
  );
  drawPairGroup(
    svg,
    aForward.full,
    bDefense.full,
    770,
    305,
    'right',
    'FF',
    'FB',
    field.y + field.h
  );

  const overflowLabel = createSvgElement('text', {
    x: 34,
    y: 388,
    'font-size': 11,
    fill: '#6b7280',
    'font-family': 'Inter, system-ui, sans-serif',
  });
  overflowLabel.textContent = 'Sideline overflow (subs) appears along the bottom touchline across expected positions.';
  svg.appendChild(overflowLabel);
}

// Solve using WASM
async function solveWithWasm(solver, scenario, modelData) {
  if (!wasmInitialized || !MiniZinc) {
    throw new Error('MiniZinc WASM not initialized');
  }

  const startTime = Date.now();
  
  // Select model based on scenario
  let modelCode;
  switch (scenario) {
    case 'with_positions':
      modelCode = WITH_POSITIONS_MODEL;
      break;
    case 'balanced_positions':
      modelCode = BALANCED_POSITIONS_MODEL;
      break;
    case 'expected_active_skill':
      modelCode = EXPECTED_ACTIVE_SKILL_MODEL;
      break;
    case 'expected_active_skill_mip':
      modelCode = EXPECTED_ACTIVE_SKILL_MIP_MODEL;
      break;
    case 'active_skill_plus':
      modelCode = ACTIVE_SKILL_PLUS_MODEL;
      break;
    default:
      modelCode = RATINGS_ONLY_MODEL;
  }

  // Use MiniZinc.Model from named exports
  const model = new MiniZinc.Model();
  model.addFile('team-assignment.mzn', modelCode);
  model.addJson(modelData);

  console.log('Starting solve with solver:', solver, 'scenario:', scenario);

  const solve = model.solve({
    options: {
      solver: solver,
      'time-limit': 30000,
      statistics: true,
    },
  });

  // Wait for solution
  const result = await solve;
  const solveTime = Date.now() - startTime;

  console.log('Solve result:', JSON.stringify(result, null, 2));

  // Extract solution from result
  let solution = null;
  let status = result?.status || 'UNKNOWN';

  if (result?.solution) {
    const output = result.solution.output;
    console.log('Solution output:', JSON.stringify(output, null, 2));
    
    if (output?.json) {
      const json = output.json;
      solution = {
        assignment: json.team_assignment || [],
        total_rating_a: json.total_rating_a,
        total_rating_b: json.total_rating_b,
        rating_difference: json.rating_diff,
        forwards_a: json.forwards_a,
        forwards_b: json.forwards_b,
        midfield_a: json.midfield_a,
        midfield_b: json.midfield_b,
        defense_a: json.defense_a,
        defense_b: json.defense_b,
        position_diff: json.position_diff,
        rating_weight: json.RATING_WEIGHT || 10,
        objective: json.objective,
        active_skill_a: json.active_skill_a,
        active_skill_b: json.active_skill_b,
        attend_a: json.attend_a,
        attend_b: json.attend_b,
        top_two_a: json.top_two_a,
        top_two_b: json.top_two_b,
        active_skill_diff: json.active_skill_diff,
        attend_diff: json.attend_diff,
        top_two_diff: json.top_two_diff,
      };
    }
  }

  return {
    status,
    solution,
    solveTime,
    statistics: result?.statistics || {},
  };
}

// Solve button click handler
solveBtn.addEventListener('click', async () => {
  if (!csvData) {
    alert('Please select a CSV file first');
    return;
  }

  const solver = solverSelect.value;
  const scenario = scenarioSelect?.value || 'ratings_only';

  if (
    scenario === 'expected_active_skill' &&
    (solver === 'cbc' || solver === 'coinbc')
  ) {
    results.innerHTML =
      '<div class="error">CBC/COIN-BC are disabled for Expected Active Skill (Attendance+TopTwo). This model uses global sort constraints with indicator coupling, which MIP backends often struggle with and may return UNKNOWN. Use CP-SAT/Chuffed for this scenario, or switch to Expected Active Skill (MIP).</div>';
    results.classList.add('active');
    return;
  }

  // Show loading
  loading.classList.add('active');
  results.classList.remove('active');
  solveBtn.disabled = true;

  try {
    let data;
    const headerLine = String(csvData).trim().split('\n')[0] || '';
    const headers = headerLine.split(',').map((h) => h.trim());
    const csvValidation = validateCSVForScenario(headers, scenario);
    if (!csvValidation.valid) {
      throw new Error(csvValidation.error);
    }
    const parsedForValidation = parseCSV(csvData);
    if (scenario === 'active_skill_plus') {
      const captainCount = (parsedForValidation.data.is_captain || []).reduce((sum, c) => sum + c, 0);
      if (captainCount !== 2) {
        throw new Error(
          `Active Skill Plus requires exactly 2 captains in CSV (captain=1/true/yes). Found ${captainCount}.`
        );
      }
    }

    if (currentMode === 'local') {
      // Use Express API
      const response = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solver, scenario, csvData }),
      });

      data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unknown error');
      }

      displayResults(data, scenario);
    } else {
      // Use WASM
      const { players, data: modelData } = parsedForValidation;
      const result = await solveWithWasm(solver, scenario, modelData);

      // Build team rosters from assignment
      if (result.solution && result.solution.assignment) {
        const assignment = result.solution.assignment;
        const teamA = [];
        const teamB = [];
        
        assignment.forEach((team, idx) => {
          if (idx < players.length) {
            if (team === 0) {
              teamA.push(players[idx]);
            } else {
              teamB.push(players[idx]);
            }
          }
        });

        // Compute position counts from team rosters if not provided by solver
        if (result.solution.forwards_a === undefined) {
          result.solution.forwards_a = teamA.filter(p => p.position === 'forward').length;
          result.solution.forwards_b = teamB.filter(p => p.position === 'forward').length;
          result.solution.midfield_a = teamA.filter(p => p.position === 'midfield').length;
          result.solution.midfield_b = teamB.filter(p => p.position === 'midfield').length;
          result.solution.defense_a = teamA.filter(p => p.position === 'defense').length;
          result.solution.defense_b = teamB.filter(p => p.position === 'defense').length;
          
          // Compute position_diff
          result.solution.position_diff = 
            Math.abs(result.solution.forwards_a - result.solution.forwards_b) +
            Math.abs(result.solution.midfield_a - result.solution.midfield_b) +
            Math.abs(result.solution.defense_a - result.solution.defense_b);
        }

        // Set default rating_weight if not provided
        if (result.solution.rating_weight === undefined) {
          result.solution.rating_weight = 10;
        }

        displayResults({
          result,
          players,
          teamA: sortPlayers(teamA),
          teamB: sortPlayers(teamB),
          scenario,
        }, scenario);
      }
    }
  } catch (error) {
    console.error('Solve error:', error);
    results.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    results.classList.add('active');
  } finally {
    loading.classList.remove('active');
    solveBtn.disabled = false;
  }
});

// Store last results for CSV download
let lastResults = null;

function displayResults(data, scenario) {
  const { result, teamA, teamB, players } = data;
  const solution = result.solution;

  // Sort teams by position then name
  const sortedTeamA = sortPlayers(teamA).map((p, idx) => ({ ...p, displayNumber: idx + 1 }));
  const sortedTeamB = sortPlayers(teamB).map((p, idx) => ({ ...p, displayNumber: idx + 1 }));

  // Calculate totals
  const totalA = solution?.total_rating_a || sortedTeamA.reduce((sum, p) => sum + p.rating, 0);
  const totalB = solution?.total_rating_b || sortedTeamB.reduce((sum, p) => sum + p.rating, 0);
  const ratingDiff = solution?.rating_difference || Math.abs(totalA - totalB);

  const activeSkillA =
    isExpectedSkillScenario(scenario)
      ? (solution?.active_skill_a ?? 0) / 1000
      : null;
  const activeSkillB =
    isExpectedSkillScenario(scenario)
      ? (solution?.active_skill_b ?? 0) / 1000
      : null;
  const activeSkillDiff =
    isExpectedSkillScenario(scenario)
      ? (solution?.active_skill_diff ?? 0) / 1000
      : null;
  const attendAWeeks =
    isExpectedSkillScenario(scenario) ? (((solution?.attend_a ?? 0) / 100) * TOTAL_SEASON_WEEKS) : null;
  const attendBWeeks =
    isExpectedSkillScenario(scenario) ? (((solution?.attend_b ?? 0) / 100) * TOTAL_SEASON_WEEKS) : null;
  const topTwoA =
    isExpectedSkillScenario(scenario) ? ((solution?.top_two_a ?? 0) / 10) : null;
  const topTwoB =
    isExpectedSkillScenario(scenario) ? ((solution?.top_two_b ?? 0) / 10) : null;

  // Calculate position-wise ratings for balanced_positions scenario
  const forwardRatingA = sortedTeamA.filter(p => p.position === 'forward').reduce((s, p) => s + p.rating, 0);
  const forwardRatingB = sortedTeamB.filter(p => p.position === 'forward').reduce((s, p) => s + p.rating, 0);
  const midfieldRatingA = sortedTeamA.filter(p => p.position === 'midfield').reduce((s, p) => s + p.rating, 0);
  const midfieldRatingB = sortedTeamB.filter(p => p.position === 'midfield').reduce((s, p) => s + p.rating, 0);
  const defenseRatingA = sortedTeamA.filter(p => p.position === 'defense').reduce((s, p) => s + p.rating, 0);
  const defenseRatingB = sortedTeamB.filter(p => p.position === 'defense').reduce((s, p) => s + p.rating, 0);

  // Store results for CSV download
  lastResults = {
    teamA: sortedTeamA,
    teamB: sortedTeamB,
    totalA,
    totalB,
    diff: isExpectedSkillScenario(scenario) ? activeSkillDiff : ratingDiff,
    solveTime: result.solveTime,
    status: result.status,
    playerCount: (players || []).length || (sortedTeamA.length + sortedTeamB.length),
    solution,
    scenario,
    activeSkill: {
      teamA: activeSkillA,
      teamB: activeSkillB,
      diff: activeSkillDiff,
    },
    attendanceWeeks: {
      teamA: attendAWeeks,
      teamB: attendBWeeks,
    },
    topTwo: {
      teamA: topTwoA,
      teamB: topTwoB,
    },
    positionRatings: {
      forwardA: forwardRatingA, forwardB: forwardRatingB,
      midfieldA: midfieldRatingA, midfieldB: midfieldRatingB,
      defenseA: defenseRatingA, defenseB: defenseRatingB,
    },
  };

   // Update DOM - show scenario-specific totals
  if (scenario === 'balanced_positions') {
    document.getElementById('teamATotal').textContent = `(D: ${defenseRatingA}, M: ${midfieldRatingA}, F: ${forwardRatingA} = ${totalA} rating points)`;
    document.getElementById('teamBTotal').textContent = `(D: ${defenseRatingB}, M: ${midfieldRatingB}, F: ${forwardRatingB} = ${totalB} rating points)`;
  } else if (isExpectedSkillScenario(scenario)) {
    document.getElementById('teamATotal').textContent = `(Active: ${(activeSkillA || 0).toFixed(2)} | ExpAttend: ${(attendAWeeks || 0).toFixed(1)} weeks)`;
    document.getElementById('teamBTotal').textContent = `(Active: ${(activeSkillB || 0).toFixed(2)} | ExpAttend: ${(attendBWeeks || 0).toFixed(1)} weeks)`;
  } else {
    document.getElementById('teamATotal').textContent = `(${totalA} rating points)`;
    document.getElementById('teamBTotal').textContent = `(${totalB} rating points)`;
  }

  const teamAList = document.getElementById('teamAList');
  const teamBList = document.getElementById('teamBList');

  teamAList.innerHTML = sortedTeamA
    .map(
      (p, idx) => `
    <li>
      <span class="player-number">${p.displayNumber || idx + 1}.</span>
      <span class="player-name">${p.name}${p.isCaptain ? '<span class="captain-badge">C</span>' : ''}</span>
      <span class="player-details">${
        isExpectedSkillScenario(scenario)
          ? `${p.position} - Active: ${(p.activeSkill ?? 0).toFixed(2)} | Exp: <span class="exp-tag exp-${p.experienceCategory || 'intermediate'}">${p.experience ?? p.rating} (${p.experienceCategory || 'intermediate'})</span>`
          : `${p.position} - Rating: ${p.rating}`
      }</span>
    </li>
  `
    )
    .join('');

  teamBList.innerHTML = sortedTeamB
    .map(
      (p, idx) => `
    <li>
      <span class="player-number">${p.displayNumber || idx + 1}.</span>
      <span class="player-name">${p.name}${p.isCaptain ? '<span class="captain-badge">C</span>' : ''}</span>
      <span class="player-details">${
        isExpectedSkillScenario(scenario)
          ? `${p.position} - Active: ${(p.activeSkill ?? 0).toFixed(2)} | Exp: <span class="exp-tag exp-${p.experienceCategory || 'intermediate'}">${p.experience ?? p.rating} (${p.experienceCategory || 'intermediate'})</span>`
          : `${p.position} - Rating: ${p.rating}`
      }</span>
    </li>
  `
    )
    .join('');

  document.getElementById('ratingDiff').textContent =
    isExpectedSkillScenario(scenario)
      ? (activeSkillDiff || 0).toFixed(2)
      : String(ratingDiff);
  document.getElementById('solveTime').textContent = result.solveTime;
  document.getElementById('status').textContent = result.status;
  document.getElementById('playerCount').textContent = lastResults.playerCount;

  // Show download button
  document.getElementById('downloadBtn').style.display = 'inline-block';

  // Display solver output details
  displaySolverOutput(solution, scenario, totalA, totalB, sortedTeamA, sortedTeamB);

  // Display combined field visualization
  renderCombinedField(sortedTeamA, sortedTeamB);

  results.classList.add('active');
}

function displaySolverOutput(solution, scenario, totalA, totalB, teamA, teamB) {
  const solverOutput = document.getElementById('solverOutput');
  const solverOutputPre = document.getElementById('solverOutputPre');
  
  if (!solverOutput || !solverOutputPre) return;

  // Calculate position-wise ratings
  const forwardRatingA = teamA.filter(p => p.position === 'forward').reduce((s, p) => s + p.rating, 0);
  const forwardRatingB = teamB.filter(p => p.position === 'forward').reduce((s, p) => s + p.rating, 0);
  const midfieldRatingA = teamA.filter(p => p.position === 'midfield').reduce((s, p) => s + p.rating, 0);
  const midfieldRatingB = teamB.filter(p => p.position === 'midfield').reduce((s, p) => s + p.rating, 0);
  const defenseRatingA = teamA.filter(p => p.position === 'defense').reduce((s, p) => s + p.rating, 0);
  const defenseRatingB = teamB.filter(p => p.position === 'defense').reduce((s, p) => s + p.rating, 0);

  const forwardDiff = Math.abs(forwardRatingA - forwardRatingB);
  const midfieldDiff = Math.abs(midfieldRatingA - midfieldRatingB);
  const defenseDiff = Math.abs(defenseRatingA - defenseRatingB);

  let output = '';
  
  output += '=== MiniZinc Solver Output ===\n\n';
  
  // Scenario name
  let scenarioName = 'Ratings Only';
  if (scenario === 'with_positions') scenarioName = 'Ratings + Positions';
  if (scenario === 'balanced_positions') scenarioName = 'Position-wise Ratings';
  if (scenario === 'expected_active_skill') {
    scenarioName = 'Expected Active Skill (Attendance+TopTwo)';
  }
  if (scenario === 'expected_active_skill_mip') {
    scenarioName = 'Expected Active Skill (MIP)';
  }
  if (scenario === 'active_skill_plus') {
    scenarioName = 'Active Skill Plus (Attendance+Top2+Friends+Captains)';
  }
  output += `Scenario: ${scenarioName}\n`;
  output += `Status: ${solution?.status || 'OPTIMAL'}\n\n`;
  
  output += '--- Rating Balance ---\n';
  output += `Team A Total Rating: ${totalA}\n`;
  output += `Team B Total Rating: ${totalB}\n`;
  output += `Rating Difference: ${Math.abs(totalA - totalB)}\n\n`;
  
  if (scenario === 'with_positions' && solution) {
    const ratingWeight = solution.rating_weight || 10;
    
    output += '--- Position Balance ---\n';
    output += `Forwards:  Team A = ${solution.forwards_a ?? 'N/A'}, Team B = ${solution.forwards_b ?? 'N/A'} (diff: ${Math.abs((solution.forwards_a || 0) - (solution.forwards_b || 0))})\n`;
    output += `Midfield:  Team A = ${solution.midfield_a ?? 'N/A'}, Team B = ${solution.midfield_b ?? 'N/A'} (diff: ${Math.abs((solution.midfield_a || 0) - (solution.midfield_b || 0))})\n`;
    output += `Defense:   Team A = ${solution.defense_a ?? 'N/A'}, Team B = ${solution.defense_b ?? 'N/A'} (diff: ${Math.abs((solution.defense_a || 0) - (solution.defense_b || 0))})\n\n`;
    
    const positionDiff = solution.position_diff ?? (
      Math.abs((solution.forwards_a || 0) - (solution.forwards_b || 0)) +
      Math.abs((solution.midfield_a || 0) - (solution.midfield_b || 0)) +
      Math.abs((solution.defense_a || 0) - (solution.defense_b || 0))
    );
    const ratingDiff = Math.abs(totalA - totalB);
    const objectiveValue = solution.objective ?? (ratingDiff * ratingWeight + positionDiff);
    
    output += '--- Objective Function ---\n';
    output += `Objective = rating_diff * ${ratingWeight} + position_diff\n`;
    output += `         = ${ratingDiff} * ${ratingWeight} + ${positionDiff}\n`;
    output += `         = ${objectiveValue}\n\n`;
    output += `Note: Rating balance is prioritized (weight=${ratingWeight}) over position balance (weight=1).\n`;
  }

  if (scenario === 'balanced_positions') {
    output += '--- Position-wise Rating Balance ---\n';
    output += `Forwards:  Team A = ${forwardRatingA}, Team B = ${forwardRatingB} (diff: ${forwardDiff})\n`;
    output += `Midfield:  Team A = ${midfieldRatingA}, Team B = ${midfieldRatingB} (diff: ${midfieldDiff})\n`;
    output += `Defense:   Team A = ${defenseRatingA}, Team B = ${defenseRatingB} (diff: ${defenseDiff})\n\n`;
    
    const objectiveValue = forwardDiff + midfieldDiff + defenseDiff;
    
    output += '--- Objective Function ---\n';
    output += `Objective = forward_rating_diff + midfield_rating_diff + defense_rating_diff\n`;
    output += `         = ${forwardDiff} + ${midfieldDiff} + ${defenseDiff}\n`;
    output += `         = ${objectiveValue}\n\n`;
    output += `Note: Each position group is balanced for skill, ensuring equal strength at forwards, midfield, and defense.\n`;
  }

  if (isExpectedSkillScenario(scenario) && solution) {
    const activeA = (solution.active_skill_a || 0) / 1000;
    const activeB = (solution.active_skill_b || 0) / 1000;
    const activeDiff = (solution.active_skill_diff || 0) / 1000;
    const attendAWeeks = ((solution.attend_a || 0) / 100) * TOTAL_SEASON_WEEKS;
    const attendBWeeks = ((solution.attend_b || 0) / 100) * TOTAL_SEASON_WEEKS;
    const attendDiffWeeks = ((solution.attend_diff || 0) / 100) * TOTAL_SEASON_WEEKS;
    const topTwoA = (solution.top_two_a || 0) / 10;
    const topTwoB = (solution.top_two_b || 0) / 10;
    const topTwoDiff = (solution.top_two_diff || 0) / 10;

    output += '--- Expected Active Skill ---\n';
    output += `Team A: ${activeA.toFixed(2)}\n`;
    output += `Team B: ${activeB.toFixed(2)}\n`;
    output += `Diff: ${activeDiff.toFixed(2)}\n\n`;

    output += '--- Attendance (Expected Weeks) ---\n';
    output += `Team A: ${attendAWeeks.toFixed(1)} weeks\n`;
    output += `Team B: ${attendBWeeks.toFixed(1)} weeks\n`;
    output += `Diff: ${attendDiffWeeks.toFixed(1)} weeks\n\n`;

    output += '--- TopTwo Experience ---\n';
    output += `Team A: ${topTwoA.toFixed(1)}\n`;
    output += `Team B: ${topTwoB.toFixed(1)}\n`;
    output += `Diff: ${topTwoDiff.toFixed(1)}\n\n`;

    output += '--- Weighted Objective ---\n';
    output += 'Objective = 60*active_diff + 25*attendance_diff + 15*top_two_diff\n';
    output += `Objective = ${solution.objective ?? 'N/A'}\n`;
  }
  
  output += '\n--- Team Rosters (sorted by position, then name) ---\n\n';
  
  output += 'Team A:\n';
  teamA.forEach((p, idx) => {
    output += `  ${idx + 1}. ${p.name.padEnd(12)} | ${p.position.padEnd(8)} | Rating: ${p.rating}\n`;
  });
  
  output += '\nTeam B:\n';
  teamB.forEach((p, idx) => {
    output += `  ${idx + 1}. ${p.name.padEnd(12)} | ${p.position.padEnd(8)} | Rating: ${p.rating}\n`;
  });

  solverOutputPre.textContent = output;
  solverOutput.style.display = 'block';
}

// Download results as CSV
function downloadResultsCSV() {
  if (!lastResults) return;

  const { teamA, teamB, totalA, totalB, diff, scenario, solution } = lastResults;
  
  // Build CSV content
  const csvLines = [
    isExpectedSkillScenario(scenario)
      ? 'Team,Number,Name,Position,Experience,AttendanceWeeks,AttendanceProbability,ActiveSkill'
      : 'Team,Number,Name,Position,Rating',
  ];

  teamA.forEach((p, idx) => {
    if (isExpectedSkillScenario(scenario)) {
      csvLines.push(
        `Team A,${idx + 1},${p.name},${p.position},${p.experience ?? p.rating},${p.attendanceWeeks ?? ''},${
          p.attendanceProbability ?? ''
        },${p.activeSkill ?? ''}`
      );
      return;
    }
    csvLines.push(`Team A,${idx + 1},${p.name},${p.position},${p.rating}`);
  });

  teamB.forEach((p, idx) => {
    if (isExpectedSkillScenario(scenario)) {
      csvLines.push(
        `Team B,${idx + 1},${p.name},${p.position},${p.experience ?? p.rating},${p.attendanceWeeks ?? ''},${
          p.attendanceProbability ?? ''
        },${p.activeSkill ?? ''}`
      );
      return;
    }
    csvLines.push(`Team B,${idx + 1},${p.name},${p.position},${p.rating}`);
  });

  // Add summary
  csvLines.push('');
  csvLines.push('Summary');
  let scenarioTitle = 'Ratings Only';
  if (scenario === 'with_positions') scenarioTitle = 'Ratings + Positions';
  if (scenario === 'balanced_positions') scenarioTitle = 'Position-wise Ratings';
  if (scenario === 'expected_active_skill') scenarioTitle = 'Expected Active Skill (Attendance+TopTwo)';
  if (scenario === 'expected_active_skill_mip') scenarioTitle = 'Expected Active Skill (MIP)';
  if (scenario === 'active_skill_plus') scenarioTitle = 'Active Skill Plus (Attendance+Top2+Friends+Captains)';
  csvLines.push(`Scenario,${scenarioTitle}`);

  if (isExpectedSkillScenario(scenario)) {
    csvLines.push(`Team A Active Skill,${((solution?.active_skill_a || 0) / 1000).toFixed(2)}`);
    csvLines.push(`Team B Active Skill,${((solution?.active_skill_b || 0) / 1000).toFixed(2)}`);
    csvLines.push(`Active Skill Difference,${((solution?.active_skill_diff || 0) / 1000).toFixed(2)}`);
    csvLines.push(`Team A Expected Attendance (weeks),${(((solution?.attend_a || 0) / 100) * TOTAL_SEASON_WEEKS).toFixed(2)}`);
    csvLines.push(`Team B Expected Attendance (weeks),${(((solution?.attend_b || 0) / 100) * TOTAL_SEASON_WEEKS).toFixed(2)}`);
    csvLines.push(`TopTwo Team A,${((solution?.top_two_a || 0) / 10).toFixed(1)}`);
    csvLines.push(`TopTwo Team B,${((solution?.top_two_b || 0) / 10).toFixed(1)}`);
  } else {
    csvLines.push(`Team A Total Rating,${totalA}`);
    csvLines.push(`Team B Total Rating,${totalB}`);
    csvLines.push(`Rating Difference,${diff}`);
  }
  
  if ((scenario === 'with_positions' || isExpectedSkillScenario(scenario)) && solution) {
    csvLines.push(`Team A Forwards,${solution.forwards_a}`);
    csvLines.push(`Team B Forwards,${solution.forwards_b}`);
    csvLines.push(`Team A Midfield,${solution.midfield_a}`);
    csvLines.push(`Team B Midfield,${solution.midfield_b}`);
    csvLines.push(`Team A Defense,${solution.defense_a}`);
    csvLines.push(`Team B Defense,${solution.defense_b}`);
  }

  const csvContent = csvLines.join('\n');
  
  // Create and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'team-assignments.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Attach download handler (robust fallback for browsers with strict click handling)
document.getElementById('downloadBtn')?.addEventListener('click', (event) => {
  event.preventDefault();
  downloadResultsCSV();
});

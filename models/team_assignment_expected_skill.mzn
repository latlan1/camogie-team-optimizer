% Camogie Team Assignment Model (expected active skill + attendance + top-two)
% Balances expected active skill and attendance while spreading top players.
% Also keeps position counts balanced.
% Emits JSON for easier parsing.

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

% Indicator variables for top-two players in each team.
array[1..num_players] of var 0..1: is_top2_a;
array[1..num_players] of var 0..1: is_top2_b;

constraint forall(p in 1..num_players)(is_top2_a[p] <= (1 - team_assignment[p]));
constraint forall(p in 1..num_players)(is_top2_b[p] <= team_assignment[p]);

constraint sum(p in 1..num_players)(is_top2_a[p]) = 2;
constraint sum(p in 1..num_players)(is_top2_b[p]) = 2;

% Dominance constraints ensure selected players are truly top-two by experience.
constraint forall(i in 1..num_players, j in 1..num_players where i != j)(
  ((1 - team_assignment[i]) = 1 /\ (1 - team_assignment[j]) = 1 /\
   is_top2_a[i] = 1 /\ is_top2_a[j] = 0)
  -> experiences[i] >= experiences[j]
);

constraint forall(i in 1..num_players, j in 1..num_players where i != j)(
  (team_assignment[i] = 1 /\ team_assignment[j] = 1 /\
   is_top2_b[i] = 1 /\ is_top2_b[j] = 0)
  -> experiences[i] >= experiences[j]
);

% Sorting-based auxiliary vectors with indicators applied (others become 0).
array[1..num_players] of var 0..MAX_EXP: top2_exp_a_raw;
array[1..num_players] of var 0..MAX_EXP: top2_exp_b_raw;

constraint forall(p in 1..num_players)(
  top2_exp_a_raw[p] = experiences[p] * is_top2_a[p]
);
constraint forall(p in 1..num_players)(
  top2_exp_b_raw[p] = experiences[p] * is_top2_b[p]
);

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

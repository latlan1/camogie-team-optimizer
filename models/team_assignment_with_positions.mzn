% Camogie Team Assignment Model (ratings + position balance)
% Balances both total ratings AND position distribution across teams
% Emits JSON for easier parsing

int: num_players;
array[1..num_players] of int: ratings;
array[1..num_players] of int: position_indices;

% Position constants (must match CSV parsing)
int: NUM_POSITIONS = 3;
int: POS_FORWARD = 1;
int: POS_MIDFIELD = 2;
int: POS_DEFENSE = 3;

% team_assignment[p] = 0 means Team A, 1 means Team B
array[1..num_players] of var 0..1: team_assignment;

var int: team_a_size = sum(p in 1..num_players)(1 - team_assignment[p]);
var int: team_b_size = num_players - team_a_size;
constraint abs(team_a_size - team_b_size) <= 1;

var int: total_rating_a = sum(p in 1..num_players)(ratings[p] * (1 - team_assignment[p]));
var int: total_rating_b = sum(p in 1..num_players)(ratings[p] * team_assignment[p]);
var int: rating_diff = abs(total_rating_a - total_rating_b);

% Position counts for Team A
var int: forwards_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then (1 - team_assignment[p]) else 0 endif
);
var int: midfield_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then (1 - team_assignment[p]) else 0 endif
);
var int: defense_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then (1 - team_assignment[p]) else 0 endif
);

% Position counts for Team B (derived)
var int: forwards_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then team_assignment[p] else 0 endif
);
var int: midfield_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then team_assignment[p] else 0 endif
);
var int: defense_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then team_assignment[p] else 0 endif
);

% Total position counts in dataset
int: total_forwards = sum(p in 1..num_players)(if position_indices[p] == POS_FORWARD then 1 else 0 endif);
int: total_midfield = sum(p in 1..num_players)(if position_indices[p] == POS_MIDFIELD then 1 else 0 endif);
int: total_defense = sum(p in 1..num_players)(if position_indices[p] == POS_DEFENSE then 1 else 0 endif);

% Position balance constraints (difference <= 1 for each position type)
constraint abs(forwards_a - forwards_b) <= 1;
constraint abs(midfield_a - midfield_b) <= 1;
constraint abs(defense_a - defense_b) <= 1;

% Objective: minimize weighted sum of rating diff and position imbalances
var int: forward_diff = abs(forwards_a - forwards_b);
var int: midfield_diff = abs(midfield_a - midfield_b);
var int: defense_diff = abs(defense_a - defense_b);
var int: position_diff = forward_diff + midfield_diff + defense_diff;

% Weight: position balance is secondary to rating balance
var int: objective = rating_diff * 10 + position_diff;

solve minimize objective;

output [
  "{",
  "\"status\": \"OPTIMAL\",",
  "\"solution\": {",
  "\"team_a_size\": ", show(team_a_size), ",",
  "\"team_b_size\": ", show(team_b_size), ",",
  "\"total_rating_a\": ", show(total_rating_a), ",",
  "\"total_rating_b\": ", show(total_rating_b), ",",
  "\"rating_difference\": ", show(rating_diff), ",",
  "\"forwards_a\": ", show(forwards_a), ",",
  "\"forwards_b\": ", show(forwards_b), ",",
  "\"midfield_a\": ", show(midfield_a), ",",
  "\"midfield_b\": ", show(midfield_b), ",",
  "\"defense_a\": ", show(defense_a), ",",
  "\"defense_b\": ", show(defense_b), ",",
  "\"assignment\": ", show(team_assignment), "},",
  "\"statistics\": {}",
  "}"
];

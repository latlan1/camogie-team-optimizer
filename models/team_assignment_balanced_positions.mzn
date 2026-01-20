% Camogie Team Assignment Model (position-wise rating balance)
% Minimizes the sum of rating differences within each position group
% This ensures each team has balanced skill at forwards, midfield, AND defense
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

% Team size balance constraint
var int: team_a_size = sum(p in 1..num_players)(1 - team_assignment[p]);
var int: team_b_size = num_players - team_a_size;
constraint abs(team_a_size - team_b_size) <= 1;

% Overall ratings (for display purposes)
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

% Rating sums BY POSITION for Team A
var int: forward_rating_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then ratings[p] * (1 - team_assignment[p]) else 0 endif
);
var int: midfield_rating_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then ratings[p] * (1 - team_assignment[p]) else 0 endif
);
var int: defense_rating_a = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then ratings[p] * (1 - team_assignment[p]) else 0 endif
);

% Rating sums BY POSITION for Team B
var int: forward_rating_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_FORWARD then ratings[p] * team_assignment[p] else 0 endif
);
var int: midfield_rating_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_MIDFIELD then ratings[p] * team_assignment[p] else 0 endif
);
var int: defense_rating_b = sum(p in 1..num_players)(
  if position_indices[p] == POS_DEFENSE then ratings[p] * team_assignment[p] else 0 endif
);

% Position-wise rating differences
var int: forward_rating_diff = abs(forward_rating_a - forward_rating_b);
var int: midfield_rating_diff = abs(midfield_rating_a - midfield_rating_b);
var int: defense_rating_diff = abs(defense_rating_a - defense_rating_b);

% Objective: minimize sum of position-wise rating differences
% This ensures balanced skill at each position, not just overall
var int: objective = forward_rating_diff + midfield_rating_diff + defense_rating_diff;

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
  "\"forward_rating_a\": ", show(forward_rating_a), ",",
  "\"forward_rating_b\": ", show(forward_rating_b), ",",
  "\"forward_rating_diff\": ", show(forward_rating_diff), ",",
  "\"midfield_rating_a\": ", show(midfield_rating_a), ",",
  "\"midfield_rating_b\": ", show(midfield_rating_b), ",",
  "\"midfield_rating_diff\": ", show(midfield_rating_diff), ",",
  "\"defense_rating_a\": ", show(defense_rating_a), ",",
  "\"defense_rating_b\": ", show(defense_rating_b), ",",
  "\"defense_rating_diff\": ", show(defense_rating_diff), ",",
  "\"objective\": ", show(objective), ",",
  "\"assignment\": ", show(team_assignment), "},",
  "\"statistics\": {}",
  "}"
];

% Camogie Team Assignment Model (balanced by ratings)
% Emits JSON for easier parsing

int: num_players;
array[1..num_players] of int: ratings;
array[1..num_players] of int: position_indices;

% team_assignment[p] = 0 means Team A, 1 means Team B
array[1..num_players] of var 0..1: team_assignment;

var int: team_a_size = sum(p in 1..num_players)(1 - team_assignment[p]);
var int: team_b_size = num_players - team_a_size;
constraint abs(team_a_size - team_b_size) <= 1;

var int: total_rating_a = sum(p in 1..num_players)(ratings[p] * (1 - team_assignment[p]));
var int: total_rating_b = sum(p in 1..num_players)(ratings[p] * team_assignment[p]);
var int: rating_diff = abs(total_rating_a - total_rating_b);

solve minimize rating_diff;

output [
  "{",
  "\"status\": \"OPTIMAL\",",
  "\"solution\": {",
  "\"team_a_size\": ", show(team_a_size), ",",
  "\"team_b_size\": ", show(team_b_size), ",",
  "\"total_rating_a\": ", show(total_rating_a), ",",
  "\"total_rating_b\": ", show(total_rating_b), ",",
  "\"rating_difference\": ", show(rating_diff), ",",
  "\"assignment\": ", show(team_assignment), "},",
  "\"statistics\": {}",
  "}"
];

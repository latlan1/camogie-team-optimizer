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

// Update scenario description when selection changes
scenarioSelect?.addEventListener('change', updateScenarioDescription);

function updateScenarioDescription() {
  const scenarioDesc = document.getElementById('scenarioDescription');
  if (!scenarioDesc) return;
  
  switch (scenarioSelect.value) {
    case 'with_positions':
      scenarioDesc.innerHTML = '<strong>Scenario:</strong> Ratings + Positions - Teams balanced by skill rating AND position distribution.';
      break;
    case 'balanced_positions':
      scenarioDesc.innerHTML = '<strong>Scenario:</strong> Position-wise Ratings - Balance skill ratings within each position group (forwards, midfield, defense).';
      break;
    default:
      scenarioDesc.innerHTML = '<strong>Scenario:</strong> Ratings Only - Teams balanced by total skill rating only.';
  }
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
}

// Initialize mode detection
detectMode();

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
  const players = [];
  const ratings = [];
  const positions = [];
  const positionIndices = [];

  const positionMap = { forward: 1, midfield: 2, defense: 3, unknown: 0 };

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length >= 2) {
      const name = values[0].trim();
      const rating = parseInt(values[1].trim(), 10);
      const position = values[2] ? values[2].trim().toLowerCase() : 'unknown';

      if (!isNaN(rating)) {
        players.push({ name, rating, position });
        ratings.push(rating);
        positions.push(position);
        positionIndices.push(positionMap[position] || 0);
      }
    }
  }

  return {
    players,
    data: {
      num_players: players.length,
      ratings,
      position_indices: positionIndices,
    },
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

  // Show loading
  loading.classList.add('active');
  results.classList.remove('active');
  solveBtn.disabled = true;

  try {
    let data;

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
      const { players, data: modelData } = parseCSV(csvData);
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
  const sortedTeamA = sortPlayers(teamA);
  const sortedTeamB = sortPlayers(teamB);

  // Calculate totals
  const totalA = solution?.total_rating_a || sortedTeamA.reduce((sum, p) => sum + p.rating, 0);
  const totalB = solution?.total_rating_b || sortedTeamB.reduce((sum, p) => sum + p.rating, 0);
  const diff = solution?.rating_difference || Math.abs(totalA - totalB);

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
    diff,
    solveTime: result.solveTime,
    status: result.status,
    playerCount: (players || []).length || (sortedTeamA.length + sortedTeamB.length),
    solution,
    scenario,
    positionRatings: {
      forwardA: forwardRatingA, forwardB: forwardRatingB,
      midfieldA: midfieldRatingA, midfieldB: midfieldRatingB,
      defenseA: defenseRatingA, defenseB: defenseRatingB,
    },
  };

  // Update DOM - show position-wise breakdown for balanced_positions
  if (scenario === 'balanced_positions') {
    document.getElementById('teamATotal').textContent = `(F:${forwardRatingA} M:${midfieldRatingA} D:${defenseRatingA} = ${totalA})`;
    document.getElementById('teamBTotal').textContent = `(F:${forwardRatingB} M:${midfieldRatingB} D:${defenseRatingB} = ${totalB})`;
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
      <span class="player-number">${idx + 1}.</span>
      <span class="player-name">${p.name}</span>
      <span class="player-details">${p.position} - Rating: ${p.rating}</span>
    </li>
  `
    )
    .join('');

  teamBList.innerHTML = sortedTeamB
    .map(
      (p, idx) => `
    <li>
      <span class="player-number">${idx + 1}.</span>
      <span class="player-name">${p.name}</span>
      <span class="player-details">${p.position} - Rating: ${p.rating}</span>
    </li>
  `
    )
    .join('');

  document.getElementById('ratingDiff').textContent = diff;
  document.getElementById('solveTime').textContent = result.solveTime;
  document.getElementById('status').textContent = result.status;
  document.getElementById('playerCount').textContent = lastResults.playerCount;

  // Show download button
  document.getElementById('downloadBtn').style.display = 'inline-block';

  // Display solver output details
  displaySolverOutput(solution, scenario, totalA, totalB, sortedTeamA, sortedTeamB);

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
    'Team,Number,Name,Position,Rating',
  ];

  teamA.forEach((p, idx) => {
    csvLines.push(`Team A,${idx + 1},${p.name},${p.position},${p.rating}`);
  });

  teamB.forEach((p, idx) => {
    csvLines.push(`Team B,${idx + 1},${p.name},${p.position},${p.rating}`);
  });

  // Add summary
  csvLines.push('');
  csvLines.push('Summary');
  csvLines.push(`Scenario,${scenario === 'with_positions' ? 'Ratings + Positions' : 'Ratings Only'}`);
  csvLines.push(`Team A Total Rating,${totalA}`);
  csvLines.push(`Team B Total Rating,${totalB}`);
  csvLines.push(`Rating Difference,${diff}`);
  
  if (scenario === 'with_positions' && solution) {
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

// Attach download handler
document.getElementById('downloadBtn')?.addEventListener('click', downloadResultsCSV);

// Client-side JS with dual-mode support (Express API + WASM)

const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const solverSelect = document.getElementById('solver');
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
// Note: WASM uses --output-mode json, so we just need the model without custom output
const MODEL_CODE = `
% Camogie Team Assignment Model
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
`;

// Detect mode and update banner
async function detectMode() {
  try {
    // Try to reach the Express API - if it works, we're in local mode
    const response = await fetch('/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ solver: 'cbc', csvData: 'name,rating\nTest,5' })
    });
    
    if (response.ok) {
      const data = await response.json();
      setMode('local', data.mode === 'node' ? 'node' : 'browser');
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

function setMode(mode, serverMode = null) {
  currentMode = mode;
  
  const solverList = document.getElementById('solverList');
  const infoNote = document.getElementById('infoNote');
  
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

// Solve using WASM
async function solveWithWasm(solver, modelData) {
  if (!wasmInitialized || !MiniZinc) {
    throw new Error('MiniZinc WASM not initialized');
  }

  const startTime = Date.now();

  // Use MiniZinc.Model from named exports
  const model = new MiniZinc.Model();
  model.addFile('team-assignment.mzn', MODEL_CODE);
  model.addJson(modelData);

  console.log('Starting solve with solver:', solver);

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
  // WASM result format: { status, solution: { output: { json: {...} } }, statistics }
  let solution = null;
  let status = result?.status || 'UNKNOWN';

  if (result?.solution) {
    const output = result.solution.output;
    console.log('Solution output:', JSON.stringify(output, null, 2));
    
    // With jsonOutput: true, variables are in output.json
    if (output?.json) {
      const json = output.json;
      solution = {
        assignment: json.team_assignment || [],
        total_rating_a: json.total_rating_a,
        total_rating_b: json.total_rating_b,
        rating_difference: json.rating_diff,
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
        body: JSON.stringify({ solver, csvData }),
      });

      data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unknown error');
      }

      displayResults(data, csvData);
    } else {
      // Use WASM
      const { players, data: modelData } = parseCSV(csvData);
      const result = await solveWithWasm(solver, modelData);

      // Calculate totals from assignment if not provided
      if (result.solution && result.solution.assignment) {
        const assignment = result.solution.assignment;
        let totalA = 0, totalB = 0;
        assignment.forEach((team, idx) => {
          if (idx < players.length) {
            if (team === 0) {
              totalA += players[idx].rating;
            } else {
              totalB += players[idx].rating;
            }
          }
        });
        result.solution.total_rating_a = totalA;
        result.solution.total_rating_b = totalB;
        result.solution.rating_difference = Math.abs(totalA - totalB);
      }

      displayResults({ result }, csvData);
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

function displayResults(data, originalCsv) {
  const { result } = data;
  const solution = result.solution;

  // Parse original CSV to get player names
  const lines = originalCsv.trim().split('\n');
  const players = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length >= 2) {
      players.push({
        name: values[0].trim(),
        rating: parseInt(values[1].trim(), 10),
        position: values[2] ? values[2].trim() : 'unknown',
      });
    }
  }

  // Get team assignments
  const assignment = solution?.assignment || [];
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

  // Calculate totals
  const totalA = solution?.total_rating_a || teamA.reduce((sum, p) => sum + p.rating, 0);
  const totalB = solution?.total_rating_b || teamB.reduce((sum, p) => sum + p.rating, 0);
  const diff = solution?.rating_difference || Math.abs(totalA - totalB);

  // Update DOM
  document.getElementById('teamATotal').textContent = `(${totalA} points)`;
  document.getElementById('teamBTotal').textContent = `(${totalB} points)`;

  const teamAList = document.getElementById('teamAList');
  const teamBList = document.getElementById('teamBList');

  teamAList.innerHTML = teamA
    .map(
      (p) => `
    <li>
      <span class="player-name">${p.name}</span>
      <span class="player-details">${p.position} - Rating: ${p.rating}</span>
    </li>
  `
    )
    .join('');

  teamBList.innerHTML = teamB
    .map(
      (p) => `
    <li>
      <span class="player-name">${p.name}</span>
      <span class="player-details">${p.position} - Rating: ${p.rating}</span>
    </li>
  `
    )
    .join('');

  document.getElementById('ratingDiff').textContent = diff;
  document.getElementById('solveTime').textContent = result.solveTime;
  document.getElementById('status').textContent = result.status;
  document.getElementById('playerCount').textContent = players.length;

  results.classList.add('active');
}

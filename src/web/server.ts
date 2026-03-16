import express from 'express';
import { MiniZincService } from '../solver/service.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  SCENARIOS,
  DEFAULT_SCENARIO,
  DEFAULT_TIME_LIMIT,
  type ScenarioId,
} from '../shared/constants.js';
import {
  parseCSV,
  validateCSVForScenario,
  sortPlayersByPosition,
  splitIntoTeams,
  countPositions,
} from '../shared/utils.js';

const app = express();
const port = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// API: List available scenarios
app.get('/api/scenarios', (_req, res) => {
  const scenarios = Object.entries(SCENARIOS).map(([id, s]) => ({
    id,
    name: s.name,
    description: s.description,
  }));
  res.json({ scenarios });
});

// API: List available solvers
app.get('/api/solvers', async (_req, res) => {
  try {
    const service = new MiniZincService();
    await service.init({
      minizinc: process.env.MINIZINC_BIN || 'minizinc',
    });
    res.json({
      mode: service.getMode(),
      solvers: service.getAvailableSolvers(),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Serve index.html for root
app.get('/', (_req, res) => {
  res.sendFile(resolve('public/index.html'));
});

// API: Solve team optimization
app.post('/api/solve', async (req, res) => {
  try {
    const { solver = 'cbc', csvData, scenario = DEFAULT_SCENARIO } = req.body;

    if (!csvData) {
      return res.status(400).json({ error: 'CSV data is required' });
    }

    // Validate scenario
    if (!SCENARIOS[scenario as ScenarioId]) {
      return res.status(400).json({
        error: `Unknown scenario: ${scenario}. Available: ${Object.keys(SCENARIOS).join(', ')}`,
      });
    }

    const scenarioConfig = SCENARIOS[scenario as ScenarioId];

    if (
      scenario === 'expected_active_skill' &&
      (solver === 'cbc' || solver === 'coinbc')
    ) {
      return res.status(400).json({
        error:
          'CBC/COIN-BC are disabled for expected_active_skill. This original model uses global sort constraints with indicator coupling, which MIP backends often struggle to prove/close and may return UNKNOWN. Use expected_active_skill_mip for CBC/COIN-BC.',
      });
    }

    const csvLines = String(csvData).trim().split('\n');
    const headers = csvLines[0]?.split(',')?.map((h: string) => h.trim()) || [];
    const csvValidation = validateCSVForScenario(headers, scenario);
    if (!csvValidation.valid) {
      return res.status(400).json({ error: csvValidation.error });
    }

    // Initialize solver service
    const service = new MiniZincService();
    await service.init({
      minizinc: process.env.MINIZINC_BIN || 'minizinc',
    });

    // Load model
    const modelFile: string = scenarioConfig.modelFile;

    const modelPath = resolve(`./models/${modelFile}`);
    const modelCode = readFileSync(modelPath, 'utf8');

    // Parse CSV data using shared utility
    const data = parseCSV(csvData);

    if (scenario === 'active_skill_plus') {
      const captains = (data.is_captain || []).reduce((sum, c) => sum + c, 0);
      if (captains !== 2) {
        return res.status(400).json({
          error:
            `Active Skill Plus requires exactly 2 captains in CSV (captain=1/true/yes). Found ${captains}.`,
        });
      }
    }

    const config = {
      solver,
      timeLimit:
        scenario === 'expected_active_skill' ||
        scenario === 'expected_active_skill_mip' ||
        scenario === 'active_skill_plus'
          ? 60000
          : DEFAULT_TIME_LIMIT,
    };

    // Solve
    const result = await service.solve(modelCode, data, config, modelFile);

    // Build team rosters from assignment array
    const assignment = result.solution?.assignment || [];
    if (!Array.isArray(assignment) || assignment.length !== data.num_players) {
      return res.status(422).json({
        error:
          `Solver returned status ${result.status} without a complete assignment. ` +
          `Try solver cp-sat for this scenario or retry with a higher time limit.`,
      });
    }
    const { teamA, teamB } = splitIntoTeams(data.players, assignment);

    // Sort teams by position then name
    const sortedTeamA = sortPlayersByPosition(teamA);
    const sortedTeamB = sortPlayersByPosition(teamB);

    // Calculate position counts for response
    const positionsA = countPositions(teamA);
    const positionsB = countPositions(teamB);

    // Enhance result with position data if not present
    if (
      result.solution &&
      (scenario === 'with_positions' ||
        scenario === 'expected_active_skill' ||
        scenario === 'expected_active_skill_mip' ||
        scenario === 'active_skill_plus')
    ) {
      const sol = result.solution as any;
      if (sol.forwards_a === undefined) {
        sol.forwards_a = positionsA.forward;
        sol.forwards_b = positionsB.forward;
        sol.midfield_a = positionsA.midfield;
        sol.midfield_b = positionsB.midfield;
        sol.defense_a = positionsA.defense;
        sol.defense_b = positionsB.defense;
      }
    }

    res.json({
      solver,
      scenario,
      mode: service.getMode(),
      result,
      players: data.players,
      teamA: sortedTeamA,
      teamB: sortedTeamB,
    });
  } catch (error) {
    console.error('Solve error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

app.listen(port, () => {
  console.log(`
============================================
  Camogie Team Optimization Server
============================================
  URL: http://localhost:${port}
  Mode: ${process.env.NODE_ENV || 'development'}
  
  Endpoints:
    GET  /api/scenarios  - List available scenarios
    GET  /api/solvers    - List available solvers
    POST /api/solve      - Solve team optimization
============================================
`);
});

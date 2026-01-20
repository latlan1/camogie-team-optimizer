#!/usr/bin/env node

/**
 * CLI for testing MiniZinc team optimization
 * 
 * Usage:
 *   npx tsx src/cli/commands.ts [options]
 * 
 * Options:
 *   --solver, -s    Solver to use (cbc, coinbc, cp-sat, chuffed, gecode, all)
 *   --scenario, -c  Scenario to run (ratings_only, with_positions, all)
 *   --file, -f      CSV file path (default: data/test-players.csv)
 *   --help, -h      Show help
 * 
 * Examples:
 *   npx tsx src/cli/commands.ts --solver cbc --scenario with_positions
 *   npx tsx src/cli/commands.ts -s all -c all
 *   npx tsx src/cli/commands.ts --file data/my-team.csv
 */

import * as fs from 'fs';
import * as path from 'path';
import { MiniZincService } from '../solver/service.js';
import type { SolverConfig } from '../solver/types.js';
import {
  SCENARIOS,
  SOLVERS,
  DEFAULT_SOLVER,
  DEFAULT_SCENARIO,
  DEFAULT_TIME_LIMIT,
  RATING_WEIGHT,
  type ScenarioId,
} from '../shared/constants.js';
import {
  parseCSV,
  sortPlayersByPosition,
  splitIntoTeams,
  countPositions,
  calculateTotalRating,
  formatPlayer,
} from '../shared/utils.js';

// CLI argument parsing
interface CLIOptions {
  solver: string;
  scenario: string;
  file: string;
  help: boolean;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    solver: DEFAULT_SOLVER,
    scenario: DEFAULT_SCENARIO,
    file: 'data/test-players.csv',
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--solver':
      case '-s':
        if (nextArg) {
          options.solver = nextArg;
          i++;
        }
        break;
      case '--scenario':
      case '-c':
        if (nextArg) {
          options.scenario = nextArg;
          i++;
        }
        break;
      case '--file':
      case '-f':
        if (nextArg) {
          options.file = nextArg;
          i++;
        }
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        // Legacy support: first positional arg is solver
        if (!arg.startsWith('-') && i === 0) {
          options.solver = arg;
        }
        break;
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
Camogie Team Optimization CLI

Usage:
  npx tsx src/cli/commands.ts [options]

Options:
  --solver, -s    Solver to use (default: ${DEFAULT_SOLVER})
                  Available: ${SOLVERS.local.join(', ')}, all
  
  --scenario, -c  Scenario to run (default: ${DEFAULT_SCENARIO})
                  Available: ${Object.keys(SCENARIOS).join(', ')}, all
  
  --file, -f      CSV file path (default: data/test-players.csv)
  
  --help, -h      Show this help message

Examples:
  # Test with CBC solver and ratings+positions scenario
  npx tsx src/cli/commands.ts --solver cbc --scenario with_positions

  # Test all solvers with all scenarios
  npx tsx src/cli/commands.ts -s all -c all

  # Use custom CSV file
  npx tsx src/cli/commands.ts --file data/my-team.csv --solver coinbc

  # Legacy: just specify solver (uses default scenario)
  npx tsx src/cli/commands.ts cbc

Scenarios:
${Object.entries(SCENARIOS)
  .map(([id, s]) => `  ${id.padEnd(16)} - ${s.description}`)
  .join('\n')}
`);
}

async function runSolve(
  service: MiniZincService,
  solver: string,
  scenarioId: ScenarioId,
  csvPath: string
): Promise<void> {
  const scenario = SCENARIOS[scenarioId];
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Solver: ${solver.toUpperCase()} | Scenario: ${scenario.name}`);
  console.log(`${'='.repeat(60)}`);

  // Load model and data
  const modelPath = path.resolve(`./models/${scenario.modelFile}`);
  if (!fs.existsSync(modelPath)) {
    console.error(`Model file not found: ${modelPath}`);
    return;
  }

  const modelCode = fs.readFileSync(modelPath, 'utf8');
  
  // Load and parse CSV
  const csvFullPath = path.resolve(csvPath);
  if (!fs.existsSync(csvFullPath)) {
    console.error(`CSV file not found: ${csvFullPath}`);
    return;
  }
  
  const csvData = fs.readFileSync(csvFullPath, 'utf8');
  const data = parseCSV(csvData);
  
  console.log(`\nLoaded ${data.num_players} players from ${csvPath}`);

  // Check solver availability
  const available = service.getAvailableSolvers();
  if (!available.includes(solver)) {
    console.warn(`Warning: Solver "${solver}" not in available list (${available.join(', ')})`);
    console.warn('Attempting to proceed anyway...');
  }

  const config: SolverConfig = {
    solver: solver as SolverConfig['solver'],
    timeLimit: DEFAULT_TIME_LIMIT,
  };

  try {
    const result = await service.solve(modelCode, data, config, scenario.modelFile);

    if (result.status === 'ERROR') {
      console.error(`\nError: ${result.errorMessage || 'Solver failed'}`);
      return;
    }

    console.log(`\nStatus: ${result.status}`);
    console.log(`Solve Time: ${result.solveTime}ms`);

    if (result.solution) {
      const solution = result.solution as any;
      const assignment = solution.assignment || solution.output?.json?.team_assignment || [];
      
      if (assignment.length > 0) {
        const { teamA, teamB } = splitIntoTeams(data.players, assignment);
        const sortedA = sortPlayersByPosition(teamA);
        const sortedB = sortPlayersByPosition(teamB);
        
        const totalA = solution.total_rating_a ?? calculateTotalRating(teamA);
        const totalB = solution.total_rating_b ?? calculateTotalRating(teamB);
        const ratingDiff = Math.abs(totalA - totalB);

        // Display Team A
        console.log(`\n--- Team A (${totalA} rating points) ---`);
        sortedA.forEach((p, i) => console.log(formatPlayer(p, i)));

        // Display Team B
        console.log(`\n--- Team B (${totalB} rating points) ---`);
        sortedB.forEach((p, i) => console.log(formatPlayer(p, i)));

        console.log(`\n--- Summary ---`);
        console.log(`Rating Difference: ${ratingDiff}`);

        // Position balance (for with_positions scenario)
        if (scenarioId === 'with_positions') {
          const posA = countPositions(teamA);
          const posB = countPositions(teamB);
          
          console.log(`\nPosition Distribution:`);
          console.log(`  Team A: ${posA.forward} forwards, ${posA.midfield} midfield, ${posA.defense} defense`);
          console.log(`  Team B: ${posB.forward} forwards, ${posB.midfield} midfield, ${posB.defense} defense`);
          
          const positionDiff = 
            Math.abs(posA.forward - posB.forward) +
            Math.abs(posA.midfield - posB.midfield) +
            Math.abs(posA.defense - posB.defense);
          
          const objective = ratingDiff * RATING_WEIGHT + positionDiff;
          
          console.log(`\nObjective Function:`);
          console.log(`  objective = rating_diff * ${RATING_WEIGHT} + position_diff`);
          console.log(`           = ${ratingDiff} * ${RATING_WEIGHT} + ${positionDiff}`);
          console.log(`           = ${objective}`);
        }

        // Position-wise rating balance (for balanced_positions scenario)
        if (scenarioId === 'balanced_positions') {
          const posA = countPositions(teamA);
          const posB = countPositions(teamB);
          
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
          const objective = forwardDiff + midfieldDiff + defenseDiff;
          
          console.log(`\nPosition Distribution:`);
          console.log(`  Team A: ${posA.forward} forwards, ${posA.midfield} midfield, ${posA.defense} defense`);
          console.log(`  Team B: ${posB.forward} forwards, ${posB.midfield} midfield, ${posB.defense} defense`);
          
          console.log(`\nPosition-wise Ratings:`);
          console.log(`  Forwards:  Team A = ${forwardRatingA}, Team B = ${forwardRatingB} (diff: ${forwardDiff})`);
          console.log(`  Midfield:  Team A = ${midfieldRatingA}, Team B = ${midfieldRatingB} (diff: ${midfieldDiff})`);
          console.log(`  Defense:   Team A = ${defenseRatingA}, Team B = ${defenseRatingB} (diff: ${defenseDiff})`);
          
          console.log(`\nObjective Function:`);
          console.log(`  objective = forward_diff + midfield_diff + defense_diff`);
          console.log(`           = ${forwardDiff} + ${midfieldDiff} + ${defenseDiff}`);
          console.log(`           = ${objective}`);
        }
      }
    }

    // Statistics
    if (result.statistics && Object.keys(result.statistics).length > 0) {
      console.log(`\n--- Statistics ---`);
      const stats = result.statistics;
      if (stats.nodes) console.log(`  Nodes: ${stats.nodes}`);
      if (stats.failures) console.log(`  Failures: ${stats.failures}`);
      if (stats.restarts) console.log(`  Restarts: ${stats.restarts}`);
    }
  } catch (error) {
    console.error(`\nError running solver:`, error);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    return;
  }

  // Initialize MiniZinc service
  const service = new MiniZincService();
  await service.init({
    minizinc: process.env.MINIZINC_BIN || 'minizinc',
  });

  console.log('Camogie Team Optimization CLI');
  console.log(`Available solvers: ${service.getAvailableSolvers().join(', ')}`);

  // Determine which solvers to test
  const solversToTest: string[] =
    options.solver === 'all' ? [...SOLVERS.local] : [options.solver];

  // Determine which scenarios to test
  const scenariosToTest: ScenarioId[] =
    options.scenario === 'all'
      ? (Object.keys(SCENARIOS) as ScenarioId[])
      : [options.scenario as ScenarioId];

  // Validate scenario
  for (const s of scenariosToTest) {
    if (!SCENARIOS[s]) {
      console.error(`Unknown scenario: ${s}`);
      console.error(`Available: ${Object.keys(SCENARIOS).join(', ')}`);
      process.exit(1);
    }
  }

  // Run all combinations
  for (const solver of solversToTest) {
    for (const scenario of scenariosToTest) {
      await runSolve(service, solver, scenario, options.file);
      
      // Small delay between runs
      if (solversToTest.length > 1 || scenariosToTest.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Testing Complete');
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

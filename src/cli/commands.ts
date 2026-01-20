#!/usr/bin/env node

import * as fs from 'fs';
import { MiniZincService } from '../solver/service.js';
import type { SolverConfig } from '../solver/types.js';

async function runTests(initialSolver: string) {
  const service = new MiniZincService();
  await service.init({
    minizinc: process.env.MINIZINC_BIN || 'minizinc',
  });

  const modelCode = fs.readFileSync('./models/team-assignment.mzn', 'utf8');
  
  const data = {
    num_players: 10,
    ratings: [8, 6, 7, 9, 5, 6, 8, 7, 9, 6],
    positions: ['forward', 'defense', 'midfield', 'forward', 'defense', 'midfield', 'forward', 'defense', 'midfield', 'forward'],
    position_indices: [1,2,3,1,2,3,1,2,3,1],
  };

  const trySolver = async (solver: string) => {
    console.log(`\n=== Testing with ${solver.toUpperCase()} solver ===`);
    console.log('================================================');

    const available = service.getAvailableSolvers();
    if (!available.includes(solver)) {
      console.warn(`Requested solver "${solver}" not found in available list (${available.join(', ')}).`);
      console.warn('Attempting to proceed anyway; ensure the system MiniZinc has this solver tag.');
    }

    // Force override when requested solver is missing: remap to coinbc if absent
    const solverToUse = available.includes(solver) ? solver : 'coinbc';

    const config: SolverConfig = {
      solver: solverToUse as any,
      timeLimit: 10000,
    };

    const startTime = Date.now();
    const result = await service.solve(modelCode, data, config);
    const endTime = Date.now();

    if (process.env.DEBUG_SOLVER === '1') {
      console.log('\nRaw result:', JSON.stringify(result, null, 2));
    }

    console.log(`\nSolver: ${solver.toUpperCase()}`);
    console.log(`Status: ${result.status}`);
    console.log(`Solve Time: ${result.solveTime}ms`);

    if (result.status === 'ERROR') {
      throw new Error(result.errorMessage || 'Solver failed; ensure a solver with the requested tag exists (e.g., use coinbc if gecode is unavailable).');
    }

    if (result.solution) {
      const solution = result.solution as any;

      const totalA = solution.total_rating_a ?? 'n/a';
      const totalB = solution.total_rating_b ?? 'n/a';
      const diff = solution.rating_difference ?? solution.rating_diff ?? 'n/a';

      console.log(`\nTeam A (${totalA} points):`);
      if (solution.assignment) {
        const teamA = (solution.assignment as number[]).map((v, idx) => ({ idx: idx + 1, side: v }));
        teamA
          .filter((p) => p.side === 0)
          .forEach((p) => console.log(`  Player ${p.idx}`));
      }

      console.log(`\nTeam B (${totalB} points):`);
      if (solution.assignment) {
        const teamB = (solution.assignment as number[]).map((v, idx) => ({ idx: idx + 1, side: v }));
        teamB
          .filter((p) => p.side === 1)
          .forEach((p) => console.log(`  Player ${p.idx}`));
      }
      console.log(`\nRating Difference: ${diff}`);
    }

    if (result.statistics) {
      console.log('\nStatistics:');
      console.log('  Nodes:', result.statistics.nodes || result.statistics['nodes']);
      console.log('  Failures:', result.statistics.failures || result.statistics['failures']);
      console.log('  Restarts:', result.statistics.restartCount || result.statistics['restarts']);
    }
  };

  try {
    await trySolver(initialSolver);
  } catch (error) {
    if (initialSolver !== 'coinbc') {
      console.warn(`Falling back to coinbc due to solver error: ${error}`);
      await trySolver('coinbc');
    } else if (initialSolver !== 'cbc') {
      console.warn(`Falling back to cbc due to solver error: ${error}`);
      await trySolver('cbc');
    } else {
      console.error(`\nError with ${initialSolver} solver:`, error);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  let solver = 'gecode';

  if (args.length > 0) {
    solver = args[0];
  }

  if (solver === 'all') {
    // Test all installed solvers
    const solvers = ['coinbc', 'cbc', 'cp-sat', 'chuffed'];
    // gecode crashes on macOS ARM64 (Homebrew threading bug)

    for (const s of solvers) {
      await runTests(s);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } else {
    await runTests(solver);
  }

  console.log('\n=== Testing Complete ===');
}

main().catch((error) => {
  console.error('Error running tests:', error);
  process.exit(1);
});

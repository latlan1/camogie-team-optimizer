import { MiniZincService } from '../solver/service.js';

const service = new MiniZincService();

let modelCodes: Record<string, string> = {};

export async function initApp(): Promise<void> {
  try {
    await service.init();
    console.log('MiniZinc initialized in browser mode');
    console.log('Available solvers:', service.getAvailableSolvers());

    await loadModels();
  } catch (error) {
    console.error('Failed to initialize MiniZinc:', error);
    throw error;
  }
}

async function loadModels(): Promise<void> {
  const loadModel = async (filename: string): Promise<string> => {
    const response = await fetch(`./${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to load model: ${filename}`);
    }
    return response.text();
  };

  modelCodes = {
    ratings_only: await loadModel('team_assignment_ratings_only.mzn'),
    with_positions: await loadModel('team_assignment_with_positions.mzn'),
  };

  console.log('Loaded models:', Object.keys(modelCodes));
}

export async function solveModel(
  scenario: string,
  data: any,
  solver: string,
  onProgress?: (status: string) => void,
  onSolution?: (solution: any) => void,
  onStatistics?: (stats: any) => void,
): Promise<any> {
  const modelCode = modelCodes[scenario];
  if (!modelCode) {
    throw new Error(`Unknown scenario: ${scenario}. Available: ${Object.keys(modelCodes).join(', ')}`);
  }

  try {
    const config = {
      solver: solver as 'gecode' | 'chuffed' | 'cbc' | 'coinbc' | 'cp-sat',
      timeLimit: 10000,
    };

    if (onProgress) {
      onProgress(`Starting ${solver} solver for ${scenario} scenario...`);
    }

    const result = await service.solve(modelCode, data, config);

    if (result.status === 'ERROR') {
      throw new Error('Solver failed. Ensure MiniZinc binary is installed and available in PATH for local mode.');
    }

    if (onSolution && result.solution) {
      onSolution(result.solution);
    }

    if (onStatistics && result.statistics) {
      onStatistics(result.statistics);
    }

    return result;
  } catch (error) {
    console.error('Solver error:', error);
    throw error;
  }
}

export function getAvailableSolvers(): string[] {
  return service.getAvailableSolvers();
}

export function getCurrentMode(): string {
  return service.getMode();
}

export function getScenarios(): string[] {
  return Object.keys(modelCodes);
}

export function parseCSV(csvText: string): any {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header and one data row');
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const nameIdx = headers.indexOf('name');
  const ratingIdx = headers.indexOf('rating');
  const positionIdx = headers.indexOf('position');

  if (nameIdx === -1 || ratingIdx === -1) {
    throw new Error('CSV must contain "name" and "rating" columns');
  }

  const players: any[] = [];
  const ratings: number[] = [];
  const positions: string[] = [];
  const positionIndices: number[] = [];

  const positionMap: Record<string, number> = {
    'forward': 1,
    'defense': 3,
    'midfield': 2,
  };

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length >= 2) {
      const player = values[nameIdx]?.trim() || `Player ${i}`;
      const rating = parseInt(values[ratingIdx]?.trim(), 10);
      const position = positionIdx !== -1 ? values[positionIdx]?.trim()?.toLowerCase() || 'unknown' : 'unknown';

      if (!isNaN(rating)) {
        players.push(player);
        ratings.push(rating);
        positions.push(position);
        positionIndices.push(positionMap[position] || 0);
      }
    }
  }

  return {
    num_players: players.length,
    players: players.map((p, i) => ({ name: p, rating: ratings[i], position: positions[i], positionIndex: positionIndices[i] })),
    ratings,
    positions,
    position_indices: positionIndices,
  };
}

export function displayResults(solution: any): void {
  console.log('\n=== Solution Results ===');
  
  if (solution.status === 'OPTIMAL' || solution.status === 'SATISFIED') {
    console.log(`Status: ${solution.status}`);
    console.log(`Solve Time: ${solution.solveTime}ms`);

    if (solution.solution) {
      const sol = solution.solution;
      console.log(`\nTeam A (${sol.total_rating_a} points):`);
      if (sol.team_a) {
        sol.team_a.forEach((player: any, i: number) => {
          console.log(`  ${i + 1}. ${player.name} (${player.position}, rating: ${player.rating})`);
        });
      }

      console.log(`\nTeam B (${sol.total_rating_b}} points):`);
      if (sol.team_b) {
        sol.team_b.forEach((player: any, i: number) => {
          console.log(`  ${i + 1}. ${player.name} (${player.position}, rating: ${player.rating})`);
        });
      }

      console.log(`\nRating Difference: ${sol.rating_difference}`);

      if (sol.forwards_a !== undefined) {
        console.log('\nPosition Distribution:');
        console.log(`  Team A: ${sol.forwards_a} forwards, ${sol.midfield_a} midfield, ${sol.defense_a} defense`);
        console.log(`  Team B: ${sol.forwards_b} forwards, ${sol.midfield_b} midfield, ${sol.defense_b} defense`);
      }
    }
  } else {
    console.log(`Status: ${solution.status}`);
    console.log('No solution found');
  }

  if (solution.statistics) {
    console.log('\nStatistics:');
    const stats = solution.statistics;
    console.log('  Nodes:', stats.nodes || stats['nodes']);
    console.log('  Failures:', stats.failures || stats['failures']);
    console.log('  Restarts:', stats.restartCount || stats['restarts']);
  }
}

/**
 * Browser UI utilities for MiniZinc solver
 * 
 * Note: The main browser functionality is currently in public/bundle.js
 * This module provides utilities that can be used when bundling with a build tool.
 */

import { MiniZincService } from '../solver/service.js';
import {
  SCENARIOS,
  POSITIONS,
  type ScenarioId,
  type PositionName,
} from '../shared/constants.js';
import type { Player, ModelData } from '../solver/types.js';

// Re-export shared utilities for browser use
export {
  parseCSV,
  sortPlayersByPosition,
  splitIntoTeams,
  countPositions,
  calculateTotalRating,
} from '../shared/utils.js';

const service = new MiniZincService();

let modelCodes: Record<string, string> = {};

/**
 * Initialize the MiniZinc service for browser mode
 */
export async function initMiniZinc(): Promise<void> {
  try {
    await service.init();
    console.log('MiniZinc initialized in browser mode');
    console.log('Available solvers:', service.getAvailableSolvers());
  } catch (error) {
    console.error('Failed to initialize MiniZinc:', error);
    throw error;
  }
}

/**
 * Load MiniZinc model code from URL
 */
export async function loadModel(filename: string): Promise<string> {
  const response = await fetch(`./${filename}`);
  if (!response.ok) {
    throw new Error(`Failed to load model: ${filename}`);
  }
  return response.text();
}

/**
 * Load all available model files
 */
export async function loadAllModels(): Promise<void> {
  for (const [id, scenario] of Object.entries(SCENARIOS)) {
    modelCodes[id] = await loadModel(scenario.modelFile);
  }
  console.log('Loaded models:', Object.keys(modelCodes));
}

/**
 * Solve a model with the given data and configuration
 */
export async function solveModel(
  scenarioId: ScenarioId,
  data: ModelData,
  solver: string
): Promise<any> {
  const modelCode = modelCodes[scenarioId];
  if (!modelCode) {
    throw new Error(`Model not loaded for scenario: ${scenarioId}`);
  }

  const config = {
    solver: solver as 'gecode' | 'chuffed' | 'cbc' | 'coinbc' | 'cp-sat',
    timeLimit: 10000,
  };

  return service.solve(modelCode, data, config);
}

/**
 * Get list of available solvers for current mode
 */
export function getAvailableSolvers(): string[] {
  return service.getAvailableSolvers();
}

/**
 * Get current execution mode (browser or node)
 */
export function getCurrentMode(): string {
  return service.getMode();
}

/**
 * Get list of loaded scenarios
 */
export function getScenarios(): string[] {
  return Object.keys(modelCodes);
}

/**
 * Get scenario configuration by ID
 */
export function getScenarioConfig(scenarioId: ScenarioId) {
  return SCENARIOS[scenarioId];
}

/**
 * Get position configuration by name
 */
export function getPositionConfig(positionName: PositionName) {
  return POSITIONS[positionName];
}

/**
 * Display results in console (for debugging)
 */
export function displayResults(result: any): void {
  console.log('\n=== Solution Results ===');
  
  if (result.status === 'OPTIMAL' || result.status === 'SATISFIED') {
    console.log(`Status: ${result.status}`);
    console.log(`Solve Time: ${result.solveTime}ms`);

    if (result.solution) {
      const sol = result.solution;
      console.log(`\nTeam A: ${sol.total_rating_a} points`);
      console.log(`Team B: ${sol.total_rating_b} points`);
      console.log(`Rating Difference: ${sol.rating_difference}`);

      if (sol.forwards_a !== undefined) {
        console.log('\nPosition Distribution:');
        console.log(`  Team A: ${sol.forwards_a} forwards, ${sol.midfield_a} midfield, ${sol.defense_a} defense`);
        console.log(`  Team B: ${sol.forwards_b} forwards, ${sol.midfield_b} midfield, ${sol.defense_b} defense`);
      }
    }
  } else {
    console.log(`Status: ${result.status}`);
    console.log('No solution found');
  }
}

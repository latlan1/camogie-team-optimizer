export interface Player {
  name: string;
  rating: number;
  position: string;
}

export interface TeamAssignment {
  team_a: Player[];
  team_b: Player[];
  total_rating_a: number;
  total_rating_b: number;
  rating_difference: number;
}

export interface SolverConfig {
  solver: 'cp-sat' | 'gecode' | 'chuffed' | 'cbc' | 'coinbc';
  timeLimit?: number;
  allSolutions?: boolean;
}

export interface SolverResult {
  status: 'OPTIMAL' | 'SATISFIED' | 'UNSATISFIABLE' | 'UNKNOWN' | 'ERROR';
  solution: TeamAssignment | null;
  statistics: Record<string, number> | null;
  solveTime: number;
  errorMessage?: string;
}

export type ExecutionMode = 'browser' | 'node';

export interface MiniZincInitConfig {
  mode: ExecutionMode;
  wasmURL?: string;
  workerURL?: string;
  dataURL?: string;
  minizinc?: string;
  minizincPaths?: string[];
}

export interface ModelData {
  num_players: number;
  ratings: number[];
  positions: string[];
  position_indices?: number[];
  players?: Player[];
}

import * as MiniZinc from 'minizinc';
import type {
  ExecutionMode,
  MiniZincInitConfig,
  ModelData,
  SolverConfig,
  SolverResult,
  TeamAssignment,
} from './types';

export class MiniZincService {
  private mode: ExecutionMode;
  private initialized: boolean = false;

  constructor() {
    this.mode = typeof window === 'undefined' ? 'node' : 'browser';
  }

  async init(config?: MiniZincInitConfig): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.mode === 'browser') {
      await MiniZinc.init({
        workerURL: config?.workerURL || './minizinc-worker.js',
        wasmURL: config?.wasmURL || './minizinc.wasm',
        dataURL: config?.dataURL || './minizinc.data',
      });
    } else {
      // Note: minizinc-js has a known bug with `minizincPaths` in Node builds;
      // prefer setting an absolute `minizinc` path instead of paths array.
      await MiniZinc.init({
        minizinc: config?.minizinc || process.env.MINIZINC_BIN || 'minizinc',
      });
    }

    this.initialized = true;
  }

  isSolverAvailable(solver: string): boolean {
    if (this.mode === 'browser') {
      const wasmSolvers = ['gecode', 'chuffed', 'cbc'];
      return wasmSolvers.includes(solver);
    }
    return true;
  }

  async solve(modelCode: string, data: ModelData, config: SolverConfig): Promise<SolverResult> {
    if (!this.initialized) {
      await this.init();
    }

    if (this.mode === 'browser' && !this.isSolverAvailable(config.solver)) {
      throw new Error(
        `Solver "${config.solver}" is not available in WASM mode. ` +
        `Available solvers: gecode, chuffed, cbc. ` +
        `Use local Node.js mode for cp-sat.`
      );
    }

    const startTime = Date.now();

    try {
      const model = new MiniZinc.Model();
      model.addFile('team-assignment.mzn', modelCode);
      model.addJson(data);

      const solve = model.solve({
        options: {
          solver: config.solver,
          'time-limit': config.timeLimit || 10000,
          'all-solutions': config.allSolutions || false,
          statistics: true,
          // If solver tag not found, MiniZinc will throw. Caller handles fallback.
        },
      });

      const result = await solve; // minizinc-js returns a promise-like solve handle
      const solveTime = Date.now() - startTime;

      // Try to parse JSON from solver output blocks
      let parsed: any = null;
      const rawOutput =
        typeof result?.output === 'string'
          ? result.output
          : typeof result?.solution?.output?.default === 'string'
            ? result.solution.output.default
            : null;
      if (rawOutput) {
        try {
          parsed = JSON.parse(rawOutput.trim());
        } catch (e) {
          // ignore
        }
      }

      const status =
        parsed?.status ||
        result?.status ||
        result?.result?.status ||
        result?.solution?.status ||
        (parsed ? 'OPTIMAL' : 'UNKNOWN');
      const extractedSolution =
        parsed?.solution ||
        result?.solution?.solution ||
        result?.solution ||
        result?.result ||
        null;
      const statistics = parsed?.statistics || result?.statistics || result?.result?.statistics || null;

      return {
        status,
        solution: extractedSolution,
        statistics,
        solveTime,
      };
    } catch (error: any) {
      const solveTime = Date.now() - startTime;
      
      // Better error message formatting
      let errorMessage = 'Unknown error';
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.toString && error.toString() !== '[object Object]') {
        errorMessage = error.toString();
      } else {
        errorMessage = JSON.stringify(error);
      }
      
      return {
        status: 'ERROR',
        solution: null,
        statistics: error?.statistics || null,
        solveTime,
        errorMessage,
      };
    }
  }

  private async waitForSolution(solve: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let lastSolution: any = null;

      solve.on('solution', (solution: any) => {
        lastSolution = solution;
      });

      solve.on('statistics', (stats: any) => {
        lastSolution = lastSolution || stats;
      });

      solve.on('exit', (exit: any) => {
        if (exit.code === 0) {
          resolve(lastSolution);
        } else {
          reject(new Error(`MiniZinc exited with code ${exit.code}`));
        }
      });

      if (typeof solve.catch === 'function') {
        solve.catch(reject);
      } else if (typeof solve.then === 'function') {
        solve.then(() => undefined, reject);
      }
    });
  }

  getMode(): ExecutionMode {
    return this.mode;
  }

  getAvailableSolvers(): string[] {
    if (this.mode === 'browser') {
      return ['gecode', 'chuffed', 'cbc'];
    }
    const envList = process.env.MINIZINC_AVAILABLE_SOLVERS;
    if (envList && envList.trim().length > 0) {
      return envList.split(',').map((s) => s.trim()).filter(Boolean);
    }
    // Default list for macOS ARM64:
    // - coinbc/cbc: MIP solvers, work perfectly
    // - cp-sat: OR-Tools CP-SAT, works
    // - chuffed: Lazy clause generation, manually installed, works
    // - gecode: crashes on ARM64 (Homebrew threading bug)
    return ['coinbc', 'cbc', 'cp-sat', 'chuffed'];
  }
}

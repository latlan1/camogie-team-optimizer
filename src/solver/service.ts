import * as MiniZinc from 'minizinc';
import type {
  ExecutionMode,
  MiniZincInitConfig,
  ModelData,
  SolverConfig,
  SolverResult,
} from './types.js';

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

  async solve(
    modelCode: string,
    data: ModelData,
    config: SolverConfig,
    modelFilename: string = 'model.mzn'
  ): Promise<SolverResult> {
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
      model.addFile(modelFilename, modelCode);
      model.addJson(data);

      const solve = model.solve({
        options: {
          solver: config.solver,
          'time-limit': config.timeLimit || 10000,
          'all-solutions': config.allSolutions || false,
          statistics: true,
        },
      });

      const result = await solve;
      const solveTime = Date.now() - startTime;

      // Extract solution data from minizinc result
      // The result structure varies between Node and WASM modes
      const resultAny = result as any;

      // Try to parse JSON from solver output blocks
      let parsed: any = null;
      const rawOutput =
        resultAny?.output ??
        resultAny?.solution?.output?.default ??
        null;

      if (typeof rawOutput === 'string') {
        try {
          parsed = JSON.parse(rawOutput.trim());
        } catch {
          // ignore parsing errors
        }
      }

      // Extract status - try multiple locations
      const status =
        parsed?.status ||
        resultAny?.status ||
        resultAny?.result?.status ||
        resultAny?.solution?.status ||
        (parsed ? 'OPTIMAL' : 'UNKNOWN');

      // Extract solution - try multiple locations
      const extractedSolution =
        parsed?.solution ||
        resultAny?.solution?.output?.json ||
        resultAny?.solution?.solution ||
        resultAny?.solution ||
        resultAny?.result ||
        null;

      // Extract statistics
      const statistics =
        parsed?.statistics ||
        resultAny?.statistics ||
        resultAny?.result?.statistics ||
        null;

      return {
        status,
        solution: extractedSolution,
        statistics,
        solveTime,
      };
    } catch (error: unknown) {
      const solveTime = Date.now() - startTime;

      // Better error message formatting
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        const errObj = error as Record<string, unknown>;
        if (typeof errObj.message === 'string') {
          errorMessage = errObj.message;
        } else if (errObj.toString && errObj.toString() !== '[object Object]') {
          errorMessage = String(errObj);
        } else {
          errorMessage = JSON.stringify(error);
        }
      }

      return {
        status: 'ERROR',
        solution: null,
        statistics: null,
        solveTime,
        errorMessage,
      };
    }
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
    return ['cbc', 'coinbc', 'cp-sat', 'chuffed'];
  }
}

# AGENTS.md

This document provides guidelines and commands for agentic coding agents working on this repository.

## Project Overview
Web interface for converting CSV player data to MiniZinc (.dzn) files and optimizing team assignments via linear programming. Uses dual-mode architecture with native MiniZinc (local) and WASM (browser) support.

## Tech Stack
- **Language**: TypeScript + HTML (static, no build framework)
- **Solver**: MiniZinc (via `minizinc` npm package)
- **Local solvers**: cbc, coinbc, cp-sat, chuffed
- **WASM solvers**: gecode, chuffed, cbc
- **Server**: Express.js (local dev only)

## Commands

### Development
```bash
# Install dependencies
npm install

# Start Express server (port 3000, local mode)
npm run dev

# Start static server for WASM mode (port 8080)
npx serve public/ -p 8080

# Run TypeScript compiler to check types
npm run typecheck
```

### CLI Testing

The CLI supports flexible testing across solvers and scenarios.

```bash
# Show CLI help
npm run cli:help

# Run with defaults (cbc solver, ratings_only scenario)
npm run cli

# Test specific solver
npm run test:cbc
npm run test:coinbc
npm run test:cp-sat
npm run test:chuffed

# Test specific scenario
npm run test:ratings        # ratings_only scenario
npm run test:positions      # with_positions scenario

# Test all solvers
npm run test:all-solvers

# Test all scenarios
npm run test:all-scenarios

# Full matrix: all solvers x all scenarios
npm run test:all
npm run test:matrix
```

**Advanced CLI usage:**
```bash
# Custom solver and scenario
npx tsx src/cli/commands.ts --solver cbc --scenario with_positions

# Short flags
npx tsx src/cli/commands.ts -s coinbc -c ratings_only

# Custom CSV file
npx tsx src/cli/commands.ts --file data/my-team.csv

# Combine all options
npx tsx src/cli/commands.ts -s all -c all --file data/test-players.csv
```

### MiniZinc Operations
```bash
# Compile and solve a model directly
minizinc models/team_assignment_ratings_only.mzn data.dzn --solver gecode

# List available solvers
minizinc --solvers

# Validate model syntax
minizinc --model-check-only models/team_assignment_with_positions.mzn
```

### Linting & Formatting
```bash
# Run ESLint (add ESLint config later)
npm run lint

# Format code with Prettier (add Prettier config later)
npm run format
```

## Code Style Guidelines

### File Organization
```
src/
├── shared/              # Shared utilities and constants
│   ├── constants.ts     # Scenarios, positions, solvers
│   ├── utils.ts         # CSV parsing, player utilities
│   └── index.ts         # Re-exports
├── solver/
│   ├── service.ts       # MiniZinc service abstraction
│   └── types.ts         # TypeScript interfaces
├── cli/
│   └── commands.ts      # CLI entry point
├── web/
│   └── server.ts        # Express API server
└── browser/
    └── ui.ts            # Browser UI helpers
```

### TypeScript Guidelines
- Use strict mode in tsconfig.json
- Prefer `const` and `let` over `var`
- Use explicit return types for functions
- Import from shared modules: `import { parseCSV } from '../shared/utils.js'`
- Use interfaces for object shapes, types for unions/primitives
- Avoid `any` - use `unknown` for truly dynamic data

### Import Style
- Always use `.js` extension for local imports (ESM requirement)
- Group imports: external libs -> internal modules -> relative modules
- Use named imports when possible: `import { foo } from 'bar'`

### Naming Conventions
- Files: `kebab-case.ts`
- Variables/Functions: `camelCase`
- Classes/Interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- MiniZinc variables: `snake_case` (follow MiniZinc conventions)

### Error Handling
- Always handle promise rejections
- Use try-catch for synchronous code that may throw
- Provide meaningful error messages to users
- Log errors to console for debugging

### Shared Constants
Use constants from `src/shared/constants.ts`:
```typescript
import { SCENARIOS, POSITIONS, SOLVERS, DEFAULT_SOLVER } from '../shared/constants.js';
```

### Shared Utilities
Use utilities from `src/shared/utils.ts`:
```typescript
import { parseCSV, sortPlayersByPosition, splitIntoTeams, countPositions } from '../shared/utils.js';
```

### CSV/DZN Conversion
- Use `parseCSV()` from shared utils for consistent parsing
- Validate CSV structure before conversion
- Handle missing/malformed data gracefully
- Support flexible CSV column ordering (match by headers)

### MiniZinc Model Guidelines
- Use clear, descriptive variable names
- Add inline comments explaining constraints
- Structure: parameters -> variables -> constraints -> solve item
- Output JSON for easier parsing in TypeScript
- Use RATING_WEIGHT constant (currently 10) for objective weighting

### HTML/CSS Guidelines
- Use semantic HTML5 elements
- Keep CSS inline or in `<style>` tags (no preprocessors needed)
- Ensure accessibility (labels, ARIA attributes where needed)
- Responsive design for mobile compatibility

## Scenarios

| ID | Name | Model File | Description |
|----|------|------------|-------------|
| `ratings_only` | Ratings Only | `team_assignment_ratings_only.mzn` | Balance by total ratings only |
| `with_positions` | Ratings + Positions | `team_assignment_with_positions.mzn` | Balance ratings AND position counts |
| `balanced_positions` | Position-wise Ratings | `team_assignment_balanced_positions.mzn` | Balance ratings within each position |

## Testing New Features

1. **Add new scenario:**
   - Create model in `models/` directory
   - Add entry to `SCENARIOS` in `src/shared/constants.ts`
   - Test via CLI: `npx tsx src/cli/commands.ts -s cbc -c new_scenario`

2. **Add new solver:**
   - Add to `SOLVERS.local` or `SOLVERS.wasm` in constants
   - Update `getAvailableSolvers()` in service.ts if needed
   - Test via CLI: `npm run test:new-solver`

3. **Modify shared utilities:**
   - Update `src/shared/utils.ts`
   - Ensure server.ts and commands.ts both use the updated functions
   - Run `npm run typecheck` to verify

## Solver Notes

- **cbc**: Fastest (~145ms), recommended default
- **coinbc**: Alternative MIP solver (~333ms)
- **cp-sat**: OR-Tools, local only (~441ms)
- **chuffed**: Lazy clause generation (~367ms)
- **gecode**: Crashes on macOS ARM64 locally, works in WASM

## Quick Reference

```bash
# Start local dev server
npm run dev

# Start WASM server
npx serve public/ -p 8080

# Run full test matrix
npm run test:all

# Type check
npm run typecheck

# Show CLI help
npm run cli:help
```

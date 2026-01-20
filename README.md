# Camogie Team Optimization with MiniZinc

Web interface for converting CSV player data to MiniZinc (.dzn) files and optimizing team assignments via linear programming.

## Architecture

This project uses a **dual-mode architecture** that shares the same codebase for both local development and browser deployment:

- **Local Environment (Node.js)**: Access to working solvers: cp-sat, coinbc, cbc, chuffed
- **Browser Environment (WebAssembly)**: Limited to WASM-compiled solvers (gecode, chuffed, cbc)

> **Note on Gecode**: The Homebrew build of Gecode 6.2.0 crashes on Apple Silicon (ARM64) with a threading bug. Use `coinbc`, `cbc`, or `cp-sat` for local development on macOS ARM. Gecode works fine in WASM/browser mode.

### Why Dual-Mode?

- Single codebase = no duplication
- Bug fixes apply to both environments
- Consistent API across Node.js and browser
- Shared TypeScript types and utilities

## Solver Availability

| Solver | Local (Node.js) | WASM (Browser) | Notes |
|---------|-------------------|------------------|-------|
| **cbc** | Available | Available | Fastest (~145ms), recommended |
| **coinbc** | Available | Available | Alternative MIP solver (~333ms) |
| **cp-sat** | Available | Not available | OR-Tools (~441ms) |
| **chuffed** | Available (manual) | Available | Lazy clause generation (~367ms) |
| **gecode** | Crashes on ARM64 | Available | WASM only; crashes locally on macOS ARM |

> **Important**: The cp-sat solver is only available when running locally via Express server. It will NOT work when deployed to GitHub Pages (WASM build).

## Project Structure

```
camogie-team-minizinc-optimization/
├── src/
│   ├── shared/
│   │   ├── constants.ts        # Shared constants (scenarios, positions, solvers)
│   │   ├── utils.ts            # CSV parsing, player sorting utilities
│   │   └── index.ts            # Shared module exports
│   ├── solver/
│   │   ├── service.ts          # Dual-mode MiniZinc abstraction
│   │   └── types.ts            # Shared TypeScript types
│   ├── browser/
│   │   └── ui.ts               # Browser-specific UI code
│   ├── cli/
│   │   └── commands.ts         # Node.js CLI for local testing
│   └── web/
│       └── server.ts           # Express server for local dev
├── public/
│   ├── index.html              # Main web interface
│   ├── bundle.js               # Browser bundle (WASM only)
│   └── minizinc*.wasm          # WASM files from npm package
├── models/
│   ├── team_assignment_ratings_only.mzn    # Balance by ratings only
│   └── team_assignment_with_positions.mzn  # Balance ratings + positions
├── data/
│   └── test-players.csv        # Sample input data (20 players)
├── package.json
├── tsconfig.json
├── AGENTS.md
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- MiniZinc installed locally (for local mode)

### Installation

```bash
# Install dependencies
npm install

# Copy WASM files to public directory
npm run copy-wasm
```

## Running the Application

### Local Mode (Express Server)

Full web UI with access to all solvers including cp-sat. Uses native MiniZinc binary.

**Start the server:**
```bash
npm run dev
```

Open http://localhost:3000

**Stop the server:**
- Press `Ctrl+C` in the terminal

**Features available:**
- CSV file upload and parsing
- Live MiniZinc solving
- All solvers: cbc, coinbc, cp-sat, chuffed
- Scenario selection (Ratings Only / Ratings + Positions)

---

### WASM Mode (Static File Server)

Browser-only mode using MiniZinc compiled to WebAssembly. No native MiniZinc required.

**Start the server:**
```bash
npx serve public/ -p 8080
```

Open http://localhost:8080

**Stop the server:**
- Press `Ctrl+C` in the terminal

**Features available:**
- CSV file upload and parsing
- MiniZinc solving via WASM (gecode, chuffed, cbc)
- cp-sat NOT available (requires native binary)
- Scenario selection (Ratings Only / Ratings + Positions)

---

### CLI Mode (Solver Testing)

Test solver performance directly without web UI. Supports both solvers and scenarios.

**Basic usage:**
```bash
# Show help
npm run cli:help

# Run with defaults (cbc solver, ratings_only scenario)
npm run cli
```

**Solver-specific tests:**
```bash
# Test with specific solver
npm run test:cbc
npm run test:coinbc
npm run test:cp-sat
npm run test:chuffed

# Test with ALL solvers
npm run test:all-solvers
```

**Scenario-specific tests:**
```bash
# Test ratings-only scenario
npm run test:ratings

# Test ratings + positions scenario
npm run test:positions

# Test ALL scenarios
npm run test:all-scenarios
```

**Full matrix testing:**
```bash
# Test ALL solvers x ALL scenarios
npm run test:all
npm run test:matrix
```

**Advanced CLI options:**
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

**CLI Options:**
| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--solver` | `-s` | `cbc` | Solver to use (cbc, coinbc, cp-sat, chuffed, gecode, all) |
| `--scenario` | `-c` | `ratings_only` | Scenario to run (ratings_only, with_positions, balanced_positions, all) |
| `--file` | `-f` | `data/test-players.csv` | Path to CSV file |
| `--help` | `-h` | - | Show help message |

No server to stop - CLI commands exit automatically.

## Optimization Scenarios

Three optimization scenarios are available:

| Scenario | Model File | Description |
|----------|------------|-------------|
| **Ratings Only** | `team_assignment_ratings_only.mzn` | Minimize total rating difference between teams |
| **Ratings + Positions** | `team_assignment_with_positions.mzn` | Minimize rating difference AND balance position counts |
| **Position-wise Ratings** | `team_assignment_balanced_positions.mzn` | Minimize rating difference *within each position group* |

### Scenario Comparison

Each scenario optimizes for different goals and can produce different team assignments:

| Scenario | Optimizes For | Example Result |
|----------|---------------|----------------|
| Ratings Only | Total team rating balance | May have 5 defenders on one team |
| Ratings + Positions | Rating balance + position count balance | 3-4 players per position per team |
| Position-wise Ratings | Rating balance *per position* | Each position equally skilled across teams |

### Ratings + Positions Objective

The **Ratings + Positions** model uses a weighted objective function:
```
objective = rating_diff * 10 + position_diff
```

Where:
- `rating_diff` = absolute difference in total ratings between teams
- `position_diff` = sum of position count imbalances
- Weight of 10 prioritizes rating balance while also distributing positions evenly

### Position-wise Ratings Objective

The **Position-wise Ratings** model minimizes the sum of rating differences within each position:
```
objective = forward_rating_diff + midfield_rating_diff + defense_rating_diff
```

Example output:
```
Position-wise Ratings:
  Forwards:  Team A = 27, Team B = 26 (diff: 1)
  Midfield:  Team A = 24, Team B = 25 (diff: 1)
  Defense:   Team A = 21, Team B = 21 (diff: 0)

Objective Function:
  objective = forward_diff + midfield_diff + defense_diff
           = 1 + 1 + 0
           = 2
```

This ensures each position group is balanced in skill, not just player count.

## CSV Input Format

The CSV should contain player data with these columns:

| Column | Type | Required | Description |
|---------|-------|----------|-------------|
| `name` | string | Yes | Player name |
| `rating` | number | Yes | Skill level (1-10) |
| `position` | string | No | Position: forward, midfield, defense |

Example:
```csv
name,rating,position
Alice,8,forward
Bob,6,defense
Charlie,7,midfield
Diana,9,forward
```

## API Endpoints (Local Mode)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scenarios` | GET | List available scenarios |
| `/api/solvers` | GET | List available solvers |
| `/api/solve` | POST | Solve team optimization |

## Deployment

### GitHub Pages

Deploy WASM-only build:

```bash
# Build optimized bundle
npm run build

# Deploy to GitHub Pages
git push origin gh-pages
```

The deployed version will:
- Work entirely in browser (no server required)
- Support gecode, chuffed, and cbc solvers
- Disable/hide cp-sat option with warning message

## Scripts Reference

| Script | Description |
|---------|-------------|
| `npm run dev` | Start Express server (port 3000) |
| `npm run cli` | Run CLI with defaults |
| `npm run cli:help` | Show CLI help |
| `npm run test:cbc` | Test with CBC solver |
| `npm run test:coinbc` | Test with COINBC solver |
| `npm run test:cp-sat` | Test with CP-SAT solver |
| `npm run test:chuffed` | Test with Chuffed solver |
| `npm run test:all-solvers` | Test all solvers |
| `npm run test:ratings` | Test ratings-only scenario |
| `npm run test:positions` | Test ratings+positions scenario |
| `npm run test:all-scenarios` | Test all scenarios |
| `npm run test:all` | Test all solvers x all scenarios |
| `npm run test:matrix` | Same as test:all |
| `npm run copy-wasm` | Copy WASM files to public/ |
| `npm run typecheck` | Run TypeScript type checking |

## Technologies

- **Language**: TypeScript
- **Solver**: MiniZinc (via `minizinc` npm package)
- **Local solvers**: cbc, coinbc, cp-sat, chuffed
- **WASM solvers**: gecode, chuffed, cbc
- **Server**: Express.js (dev only)
- **Deployment**: GitHub Pages (static HTML)

## Known Limitations

- cp-sat solver is **not available** in browser/WebAssembly builds
- gecode solver **crashes on macOS ARM64** (Homebrew build issue) - use coinbc/cbc locally
- WASM binaries add ~2-5s initial load time
- Complex models may run slower in browser than native MiniZinc
- Browser memory limits apply to WASM heap

## Future Enhancements

- [ ] WASM solver comparison UI (gecode vs chuffed performance)
- [ ] Save/load solver configurations
- [ ] Export results to CSV/JSON
- [ ] Additional scenarios (skill-based matchups, captain selection)

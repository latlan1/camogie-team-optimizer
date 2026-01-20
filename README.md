# Camogie Team Optimization with MiniZinc

Web interface for converting CSV player data to MiniZinc (.dzn) files and optimizing team assignments via linear programming.

## Architecture

This project uses a **dual-mode architecture** that shares the same codebase for both local development and browser deployment:

- **Local Environment (Node.js)**: Access to working solvers: cp-sat, coinbc, cbc
- **Browser Environment (WebAssembly)**: Limited to WASM-compiled solvers (gecode, chuffed, cbc)

> **Note on Gecode**: The Homebrew build of Gecode 6.2.0 crashes on Apple Silicon (ARM64) with a threading bug. Use `coinbc`, `cbc`, or `cp-sat` for local development on macOS ARM. Gecode works fine in WASM/browser mode.

### Why Dual-Mode?

- Single codebase = no duplication
- Bug fixes apply to both environments
- Consistent API across Node.js and browser
- Shared TypeScript types and tests

## Solver Availability

| Solver | Local (Node.js) | WASM (Browser) | Notes |
|---------|-------------------|------------------|-------|
| **cbc** | ✅ Available | ✅ Available | Fastest (145ms), recommended |
| **coinbc** | ✅ Available | ✅ Available | Alternative MIP solver (333ms) |
| **cp-sat** | ✅ Available | ❌ Not available | OR-Tools (441ms) |
| **chuffed** | ✅ Available (manual) | ✅ Available | Lazy clause generation (367ms) |
| **gecode** | ❌ Crashes on ARM64 | ✅ Available | WASM only; crashes locally on macOS ARM |

> **Important**: The cp-sat solver is only available when running locally via Express server. It will NOT work when deployed to GitHub Pages (WASM build).

> **Gecode vs Chuffed**: Gecode has a bug in the Homebrew ARM64 build (crashes). Chuffed was manually compiled and works perfectly. Both work in WASM/browser mode.

## Project Structure

```
camogie-team-minizinc-optimization/
├── src/
│   ├── solver/
│   │   ├── service.ts          # Dual-mode MiniZinc abstraction
│   │   └── types.ts            # Shared TypeScript types
│   ├── browser/
│   │   └── ui.ts               # Browser-specific UI code
│   ├── cli/
│   │   └── commands.ts          # Node.js CLI for local testing
│   └── web/
│       └── server.ts            # Express server for local dev
├── public/
│   ├── index.html              # Main web interface
│   ├── bundle.js               # Browser bundle (WASM only)
│   └── minizinc*.wasm          # WASM files from npm package
├── models/
│   └── team-assignment.mzn     # MiniZinc model for team splitting
├── data/
│   └── example.csv            # Sample input data
├── scripts/
│   └── test-local.sh           # Solver comparison script
├── package.json
├── tsconfig.json
├── AGENTS.md
└── README.md
```

## Getting Started

### Installation

```bash
# Install dependencies
npm install

# Copy WASM files to public directory
npm run copy-wasm
```

## Development Workflows

### 1. Local CLI Testing (Solver Comparison)

Test solver performance directly without web UI:

```bash
# Test with cbc (fastest, recommended)
npm run test:cbc

# Test with coinbc (alternative MIP)
npm run test:coinbc

# Test with cp-sat (OR-Tools, local only)
npm run test:cp-sat

# Test with chuffed (lazy clause generation)
npm run test:chuffed

# Test with all available solvers
npm run test:all
```

### 2. Local Web Development (Express Server)

Full web UI with access to all solvers (including cp-sat):

```bash
# Start Express server
npm run dev
```

Open http://localhost:3000

**Features available:**
- ✅ CSV file upload and parsing
- ✅ Live MiniZinc solving
- ✅ Working solvers: cbc, coinbc, cp-sat, chuffed
- ⚠️ gecode disabled (crashes on macOS ARM64)
- ✅ Solver comparison interface

### 3. Browser Testing (WASM Preview)

Preview WASM build before GitHub Pages deployment:

```bash
# Build for WASM
npm run build:wasm

# Serve static files
npx serve public/ -p 8080
```

**Features available:**
- ✅ CSV file upload and parsing
- ✅ MiniZinc solving (gecode, chuffed, cbc)
- ⚠️ cp-sat disabled (not available in WASM)
- ✅ Production-ready preview

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

## Usage

### CSV Input Format

The CSV should contain player data with these columns:

| Column | Type | Description |
|---------|-------|-------------|
| `name` | string | Player name |
| `rating` | number | Skill level (1-10) |
| `position` | string | Preferred position |

Example:
```csv
name,rating,position
Alice,8,forward
Bob,6,defense
Charlie,7,midfield
Diana,9,forward
```

### MiniZinc Model

The `team-assignment.mzn` model:

- **Parameters**: Loaded from parsed CSV (players, ratings, positions)
- **Decision Variables**: `team_a`, `team_b` assignments
- **Constraints**: Balanced total rating, equal team sizes, position distribution
- **Objective**: Minimize rating difference between teams

### Solving

```typescript
import { MiniZincService } from './solver/service';

const service = new MiniZincService();
await service.init();

const modelCode = fs.readFileSync('models/team-assignment.mzn', 'utf8');
const data = {
  num_players: players.length,
  ratings: players.map(p => p.rating),
  positions: players.map(p => p.position)
};

const result = await service.solve(modelCode, data, 'gecode');
console.log(result.solution);
```

## Solver Comparison Results

Local testing recommended workflow:

1. **Phase 1**: Test cp-sat and coinbc/cbc locally
   - Compare solve times
   - Compare solution quality
   - Identify optimal solver for your problem type
   - cp-sat typically fastest for constraint programming

2. **Phase 2**: Pivot to WASM deployment
   - Switch to gecode/chuffed/cbc in browser
   - Verify results match local benchmarks
   - Deploy to GitHub Pages

## Scripts

| Script | Description | Environment |
|---------|-------------|-------------|
| `npm run dev` | Start Express server with full solver access | Local |
| `npm run build` | Build WASM bundle for production | Any |
| `npm run copy-wasm` | Copy MiniZinc WASM files to public/ | Any |
| `npm run test:cbc` | Run solver test with cbc (fastest) | Local CLI |
| `npm run test:coinbc` | Run solver test with coinbc | Local CLI |
| `npm run test:cp-sat` | Run solver test with cp-sat | Local CLI |
| `npm run test:chuffed` | Run solver test with chuffed | Local CLI |
| `npm run test:all` | Test all available solvers | Local CLI |

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
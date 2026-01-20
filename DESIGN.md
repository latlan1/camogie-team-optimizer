# Design Document

## Overview

Building "A WASM-embedded optimization engine wrapped in a static TypeScript UI" - a web interface for converting CSV player data to MiniZinc files and optimizing team assignments via linear programming.

## Phase 1: Local Development

### Technology Stack
- **Language**: TypeScript
- **HTML**: Static (no build framework)
- **Solver**: MiniZinc (installed locally)
- **Runtime**: Node.js for local testing, browsers for deployment

### Initial Focus
Local version development to test with different solvers before WASM deployment.

### Reference Implementation
This project is based on the scheduling approach described at:
https://spin.atomicobject.com/optimization-minizinc-google-or/

Reference repository for local MiniZinc integration:
https://github.com/garytur/ao-spin-minizinc-ortools

## Architecture

### Dual-Mode Design

The application supports two execution modes with a shared codebase:

**Local Mode (Node.js)**
- Access to working MiniZinc solvers: cp-sat, coinbc, cbc
- Full feature set for development and testing
- Express server provides web UI with complete solver access
- Note: gecode crashes on macOS ARM64 (Homebrew build issue)

**Browser Mode (WebAssembly)**
- Limited to WASM-compiled solvers (gecode, chuffed, cbc)
- No server required, runs entirely in browser
- Static HTML deployment to GitHub Pages
- gecode works fine in WASM (no threading issues)

### Benefits of Dual-Mode
- Single codebase eliminates duplication
- Bug fixes apply to both environments
- Consistent API across Node.js and browser
- Shared TypeScript types and test suite

### Project Structure

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
│   ├── bundle.js               # Browser code (from solver + browser modules)
│   └── minizinc*.wasm          # WASM files
├── models/
│   └── team-assignment.mzn     # MiniZinc model for team splitting
├── scripts/
│   └── test-local.sh           # Run local solver comparisons
└── package.json
```

## Solver Architecture

### Solver Availability

| Solver | Local (Node.js) | WASM (Browser) | Best Use Case |
|---------|-------------------|------------------|---------------|
| **cbc** | ✅ Available | ✅ Available | Pure linear programming (MIP), fastest |
| **coinbc** | ✅ Available | ✅ Available | Alternative MIP solver |
| **cp-sat** | ✅ Available | ❌ Not available | OR-Tools CP-SAT |
| **chuffed** | ✅ Available (manual) | ✅ Available | Lazy clause generation CP |
| **gecode** | ❌ Crashes on ARM64 | ✅ Available | General CP (WASM only) |

> **Note on Gecode**: The Homebrew build of Gecode 6.2.0 has a known threading bug on Apple Silicon (ARM64) that causes crashes with `thread::detach failed: No such process`. For local development on macOS ARM, use the other solvers. Gecode works fine in WASM mode for browser deployment.

> **Note on Chuffed**: Manually compiled and installed from source (not available via Homebrew). Works perfectly on ARM64.

### Solver Selection Strategy

**Phase 1: Local Testing**
- Test cp-sat and coinbc/cbc with real data
- Compare solve times and solution quality
- Identify optimal solver for team splitting problem
- Avoid gecode on macOS ARM64 due to threading bugs

**Phase 2: WASM Deployment**
- Switch to gecode/chuffed/cbc for browser deployment
- Validate that WASM results match local benchmarks
- Deploy to GitHub Pages

> **Important**: The cp-sat solver is only available in local Node.js environment. It will NOT work when deployed to GitHub Pages (WASM build).

## Workflows

### Local Testing (CLI)

Direct solver comparison without web UI:

```bash
# Test with cbc (fastest, recommended)
npm run test:cbc

# Test with coinbc (alternative MIP)
npm run test:coinbc

# Test with cp-sat (local only)
npm run test:cp-sat

# Test with chuffed (lazy clause generation)
npm run test:chuffed

# Test all available solvers
npm run test:all
```

### Local Development (Express Server)

Full web UI with access to all solvers (including cp-sat):

```bash
npm run dev
```

Open http://localhost:3000

Features available:
- ✅ CSV file upload and parsing
- ✅ Live MiniZinc solving
- ✅ Working solvers: cbc, coinbc, cp-sat, chuffed
- ⚠️ gecode disabled (crashes on macOS ARM64)
- ✅ Solver comparison interface
- ✅ Real-time results display

### Browser Testing (WASM Preview)

Preview WASM build before GitHub Pages deployment:

```bash
npm run build:wasm
npx serve public/ -p 8080
```

Features available:
- ✅ CSV file upload and parsing
- ✅ MiniZinc solving (gecode, chuffed, cbc)
- ⚠️ cp-sat disabled (not available in WASM)
- ✅ Production-ready preview

## Deployment Strategy

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
- Load WASM binaries on first request (~2-5s)

## MiniZinc Model Design

### Team Assignment Model

**Objective**: Split players into two balanced teams based on skill ratings and positions.

**Parameters**:
- `num_players`: Total number of players
- `player_ratings`: Array of skill ratings (1-10)
- `player_positions`: Array of preferred positions

**Decision Variables**:
- `team_a_players`: Binary array indicating team A membership
- `team_b_players`: Binary array indicating team B membership

**Constraints**:
1. **Equal team sizes**: Each team has exactly half the players
2. **Balanced ratings**: Total rating difference minimized
3. **Position distribution**: Fair distribution of positions across teams
4. **Complete assignment**: Every player assigned to exactly one team

**Output**:
- Team A members with ratings
- Team B members with ratings
- Total rating per team
- Assignment metrics

## WASM Considerations

### Key Constraints

When compiling MiniZinc to WebAssembly, many features are disabled at build time:

**Disabled Features**:
- Multi-threading (single-threaded execution only)
- Advanced search engines (limited to basic backtracking)
- Native timing APIs (limited JavaScript access)
- File I/O operations (MEMFS only)
- Dynamic memory allocation (fixed heap size)

### Performance Implications

**Loading Time**:
- WASM binaries are several MB in size
- Initial load typically takes 2-5 seconds
- Consider loading indicators for user experience

**Solving Time**:
- Complex models may run 2-10x slower than native MiniZinc
- Browser memory constraints apply
- JavaScript main thread blocked during solving

**Memory Limits**:
- Browser heap limits typically 256MB-2GB
- Large models may require chunking
- Consider memory-efficient modeling

### Common Pitfalls

**Arbitrary Solver Flags**
When compiling MiniZinc + solver to WASM, many features are disabled. Allowing arbitrary solver flags would let users:

- Allocate huge memory beyond browser limits
- Spawn pseudo-threads (not supported in WASM)
- Write large files to MEMFS
- Lock the UI with blocking operations

This is the most common "why doesn't this work?" trap.

### Flag Handling Strategy

**Local Development**: Full flag support available through native MiniZinc CLI
**WASM Deployment**: Only documented flags supported; unknown flags may be ignored or cause errors

**Documentation Reference**: Always check MiniZinc WASM solver documentation before using advanced flags

## CSV Format

### Input Schema

```csv
name,rating,position
Alice,8,forward
Bob,6,defense
Charlie,7,midfield
Diana,9,forward
```

### Fields

| Column | Type | Required | Description |
|---------|-------|----------|-------------|
| `name` | string | Yes | Player identifier |
| `rating` | number | Yes | Skill level (1-10) |
| `position` | string | No | Preferred position (forward, defense, midfield) |

### Parsing Logic

- Validate CSV structure before processing
- Handle missing/malformed data gracefully
- Type-check numeric values (ratings must be 1-10)
- Support flexible column ordering (match by headers)

## Future Enhancements

### Phase 1.5 (Post-Local Testing)
- [ ] Automatic solver selection based on problem type
- [ ] Benchmark results dashboard
- [ ] CSV validation and error reporting UI
- [ ] Save/load solver configurations

### Phase 2+ (Post-WASM Deployment)
- [ ] WASM solver comparison UI (gecode vs chuffed performance)
- [ ] Export results to CSV/JSON
- [ ] Batch processing for multiple CSV files
- [ ] Mobile-responsive design optimization
- [ ] Progressive solving with intermediate results
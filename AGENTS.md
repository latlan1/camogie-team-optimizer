# AGENTS.md

This document provides guidelines and commands for agentic coding agents working on this repository.

## Project Overview
Web interface for converting CSV player data to MiniZinc (.dzn) files and optimizing team assignments via linear programming. Currently uses local MiniZinc with plans for WASM deployment.

## Tech Stack
- **Language**: TypeScript + HTML (static, no build framework)
- **Solver**: MiniZinc (local installation) with Gecode/Coin-BC solvers
- **Future**: minizinc-js for WASM deployment on GitHub Pages

## Commands

### Development
```bash
# Install dependencies (will add package.json later)
npm install

# Start local development server
npx serve . -p 8080

# Run TypeScript compiler to check types
npx tsc --noEmit

# Watch for changes and typecheck
npx tsc --watch --noEmit
```

### Testing
```bash
# Run all tests (add test framework later)
npm test

# Run specific test file
npm test -- --grep "team-splitting"

# Run tests in watch mode
npm test -- --watch
```

### Linting & Formatting
```bash
# Run ESLint (add ESLint config later)
npm run lint

# Run ESLint with auto-fix
npm run lint -- --fix

# Format code with Prettier (add Prettier config later)
npm run format

# Check formatting without changing files
npm run format:check
```

### MiniZinc Operations
```bash
# Compile and solve a model
minizinc model.mzn data.dzn --solver gecode

# List available solvers
minizinc --solvers

# Test with different solvers
minizinc model.mzn data.dzn --solver fzn-coin-or

# Validate model syntax
minizinc --model-check-only model.mzn data.dzn
```

## Code Style Guidelines

### File Organization
```
/
├── index.html              # Main web interface
├── src/
│   ├── types/             # TypeScript type definitions
│   ├── csv-parser.ts      # CSV to DZN conversion
│   ├── solver.ts          # MiniZinc solver interface
│   └── ui.ts              # DOM manipulation and event handlers
├── models/
│   └── team-assignment.mzn # MiniZinc model for team splitting
├── data/
│   └── example.csv        # Sample input data
├── test/
│   ├── csv-parser.test.ts
│   └── solver.test.ts
└── AGENTS.md              # This file
```

### TypeScript Guidelines
- Use strict mode in tsconfig.json
- Prefer `const` and `let` over `var`
- Use explicit return types for functions
- Leverage utility types (`Partial<T>`, `Pick<T>`, `Record<K,V>`)
- Use interfaces for object shapes, types for unions/primitives
- Avoid `any` - use `unknown` for truly dynamic data

### Import Style
- Group imports: external libs → internal modules → relative modules
- Use named imports when possible: `import { foo } from 'bar'`
- Use default imports for React-like components (if added later)
- Order: 1) React/types, 2) External libraries, 3) Internal modules

### Naming Conventions
- Files: `kebab-case.ts`
- Variables/Functions: `camelCase`
- Classes/Interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Private members: `_prefix` or `#private` syntax
- MiniZinc variables: `snake_case` (follow MiniZinc conventions)

### Error Handling
- Always handle promise rejections
- Use try-catch for synchronous code that may throw
- Provide meaningful error messages to users
- Log errors to console for debugging
- Never expose sensitive data in error messages

### CSV/DZN Conversion
- Validate CSV structure before conversion
- Handle missing/malformed data gracefully
- Generate valid MiniZinc syntax for .dzn files
- Support flexible CSV column ordering (match by headers)
- Type-check numeric values (ratings, skill levels, etc.)

### MiniZinc Model Guidelines
- Use clear, descriptive variable names
- Add inline comments explaining constraints
- Structure: parameters → variables → constraints → solve item
- Use arrays and sets efficiently
- Consider solver hints (e.g., `int_search`, `first_fail`)
- Test with multiple solvers to ensure portability

### HTML/CSS Guidelines
- Use semantic HTML5 elements
- Keep CSS inline or in `<style>` tags (no preprocessors needed)
- Ensure accessibility (labels, ARIA attributes where needed)
- Responsive design for mobile compatibility
- Clean, simple UI focused on file upload and results display

### Testing
- Unit tests for CSV parsing logic
- Integration tests for MiniZinc solver calls
- Mock MiniZinc subprocess calls in tests
- Test with edge cases (empty CSV, malformed data)
- Verify generated .dzn files are syntactically valid

## Phase 2: WASM Migration Considerations
- Swap local `minizinc` CLI calls for `minizinc-js` library
- Handle WASM binary loading with progress indicators
- Test performance limits in browser environment
- Ensure generated models work with Gecode WASM solver
- Consider loading strategies (eager/lazy) for WASM files

## Solver Selection Guidance
- **Gecode**: Good default, handles general CP problems well
- **Coin-BC**: Better for pure linear programming (no integer constraints)
- Test both during local development to inform WASM choice
- Allow users to select solver via UI in future iterations
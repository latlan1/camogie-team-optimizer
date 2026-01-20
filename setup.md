# Setup Guide

## Prerequisites
- Node.js 18+ (recommended: 20+)
- npm 9+
- Homebrew (macOS) for MiniZinc/or-tools installation

## Install MiniZinc and OR-Tools (macOS)

Install via Homebrew:
```bash
brew install minizinc or-tools
```

Verify installation:
```bash
which minizinc
minizinc --version
```

Set environment variables (if minizinc is not on PATH):
```bash
export MINIZINC_BIN=$(which minizinc)
export MINIZINC_PATHS="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
```

You can place these in your shell profile (e.g., ~/.zshrc) for persistence.

## Project Setup

Install dependencies:
```bash
npm install
```

Copy WASM assets for browser mode:
```bash
npm run copy-wasm
```

## Running Locally

### CLI solver test
```bash
npm run test:gecode
```
(Requires MiniZinc CLI available via PATH or MINIZINC_BIN.)

### Dev server (Express)
```bash
npm run dev
```
Then open http://localhost:3000

## Notes on Solvers
- Local (Node): cp-sat, gecode, chuffed, cbc (full access)
- Browser (WASM): gecode, chuffed, cbc (cp-sat not available)

## Troubleshooting
- `spawn minizinc ENOENT`: set `MINIZINC_BIN` and `MINIZINC_PATHS`, ensure Homebrew bin is in PATH.
- WASM slow first load: expect 2–5s initial load.
- Large models: may hit browser memory limits; test locally first.

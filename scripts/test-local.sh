#!/bin/bash

# Test-local.sh - Script for running solver comparisons

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "========================================="
echo "Camogie Team Optimization - Solver Tests"
echo "========================================="
echo ""

if [ "$1" = "cp-sat" ]; then
  echo "Running tests with cp-sat solver (local only)..."
  npm run test:cp-sat
elif [ "$1" = "gecode" ]; then
  echo "Running tests with gecode solver..."
  npm run test:gecode
elif [ "$1" = "all" ]; then
  echo "Running tests with all available solvers..."
  npm run test:all
else
  echo "Usage: ./scripts/test-local.sh [solver]"
  echo "  solver: cp-sat, gecode, chuffed, cbc, all"
  echo ""
  echo "Examples:"
  echo "  ./scripts/test-local.sh cp-sat    # Test cp-sat (local only)"
  echo "  ./scripts/test-local.sh gecode    # Test gecode (works everywhere)"
  echo "  ./scripts/test-local.sh all        # Test all solvers"
  echo ""
  echo "Note: cp-sat is only available in local Node.js mode."
  echo "      WASM mode only supports: gecode, chuffed, cbc"
  exit 1
fi

echo ""
echo "========================================="
echo "Tests completed"
echo "========================================="

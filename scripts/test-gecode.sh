#!/bin/bash
set -e
export MINIZINC_BIN=${MINIZINC_BIN:-/opt/homebrew/bin/minizinc}
echo "Using MINIZINC_BIN=$MINIZINC_BIN"
npm run test:gecode

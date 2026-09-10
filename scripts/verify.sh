#!/bin/sh
# Single source of truth for "does this project pass its own gate" — the
# same script backs .githooks/pre-commit, .githooks/pre-push, and every
# test-related step in .woodpecker.yml. A step in CI is a name plus which
# subcommand here, never separately-maintained logic (see ci-lokaal-parity).
set -eu

cd "$(dirname "$0")/.."

run_unit() {
    echo "==> unit-tests (node:test)"
    node --test
}

run_bdd() {
    echo "==> bdd-tests (cucumber-js)"
    npx cucumber-js
}

run_coverage() {
    echo "==> unit-tests with lcov coverage (for SonarQube)"
    node --test --experimental-test-coverage \
        --test-reporter=lcov --test-reporter-destination=coverage.lcov \
        --test-reporter=spec --test-reporter-destination=stdout
}

case "${1:-all}" in
    unit) run_unit ;;
    bdd) run_bdd ;;
    coverage) run_coverage ;;
    all) run_unit; run_bdd ;;
    *)
        echo "Onbekend argument: $1 (verwacht: unit|bdd|coverage|all)" >&2
        exit 2
        ;;
esac

echo "==> verify.sh geslaagd."

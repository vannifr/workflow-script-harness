#!/bin/sh
# Secret-scanning and quality-gate checks shared between .githooks/ and
# .woodpecker.yml — one script, no separately-maintained CI-inline copy
# (see ci-lokaal-parity). --strict turns a missing tool/unreachable
# service into a hard failure (used in CI, where every step has the
# right tool by design); without it, a missing tool degrades to a
# warning (relevant on a developer machine).
set -u

cd "$(dirname "$0")/.."

STRICT=0
if [ "${1:-}" = "--strict" ]; then
    STRICT=1
    shift
fi
CHECK="${1:-all}"

warn_or_fail() {
    if [ "$STRICT" -eq 1 ]; then
        echo "FAIL: $1" >&2
        return 1
    fi
    echo "WAARSCHUWING: $1 (CI dekt dit alsnog)." >&2
    return 0
}

check_env_guard() {
    echo "==> env-guard"
    # A CI container's user (often root) rarely matches the checkout's
    # file owner, which git's "dubious ownership" safety check refuses by
    # default (fatal: detected dubious ownership in repository) — harmless
    # here (a disposable, single-use CI container), so allow it explicitly
    # rather than have the whole check silently fail with an unrelated-
    # looking git error.
    git config --global --add safe.directory "$(pwd)" 2>/dev/null || true
    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        echo "FAIL: env-guard kan git niet gebruiken in deze directory (git rev-parse faalde)." >&2
        return 1
    fi
    if git ls-files | grep -E '(^|/)(\.env|\.env\.[a-z]+)$' | grep -v '\.env\.example$'; then
        echo "FAIL: .env-bestand gevonden in git-tracked bestanden. Verwijder met git rm --cached <file>." >&2
        return 1
    fi
    echo "OK: geen .env in git-tracked bestanden."
}

check_gitleaks() {
    echo "==> gitleaks"
    if ! command -v gitleaks >/dev/null 2>&1; then
        warn_or_fail "gitleaks niet geïnstalleerd, stap overgeslagen."
        return $?
    fi
    if [ -n "${CI_PREV_COMMIT_SHA:-}" ]; then
        gitleaks git -v --log-opts="$CI_PREV_COMMIT_SHA..$CI_COMMIT_SHA" .
    else
        gitleaks protect --staged -v .
    fi
}

check_sonarqube() {
    echo "==> sonarqube"
    : "${SONAR_HOST_URL:=http://localhost:9000}"
    if [ -z "${SONAR_TOKEN:-}" ]; then
        warn_or_fail "SONAR_TOKEN niet gezet, sonarqube-check overgeslagen."
        return $?
    fi
    if ! command -v sonar-scanner >/dev/null 2>&1; then
        warn_or_fail "sonar-scanner niet geïnstalleerd, sonarqube-check overgeslagen."
        return $?
    fi
    if [ "$STRICT" -ne 1 ] && ! curl -sS -o /dev/null -m 2 "$SONAR_HOST_URL/api/system/status" 2>/dev/null; then
        warn_or_fail "SonarQube ($SONAR_HOST_URL) niet bereikbaar, sonarqube-check overgeslagen."
        return $?
    fi
    export SONAR_HOST_URL SONAR_TOKEN
    sonar-scanner -Dsonar.qualitygate.wait=true
}

FAIL=0
case "$CHECK" in
    env-guard) check_env_guard || FAIL=1 ;;
    gitleaks) check_gitleaks || FAIL=1 ;;
    sonarqube) check_sonarqube || FAIL=1 ;;
    all)
        check_env_guard || FAIL=1
        check_gitleaks || FAIL=1
        check_sonarqube || FAIL=1
        ;;
    *)
        echo "Onbekende check: $CHECK (verwacht: env-guard|gitleaks|sonarqube|all)" >&2
        exit 2
        ;;
esac

if [ "$FAIL" -ne 0 ]; then
    echo "==> local-ci-checks.sh: gefaald, zie hierboven." >&2
    exit 1
fi
echo "==> local-ci-checks.sh geslaagd (zie eventuele waarschuwingen over overgeslagen stappen hierboven)."

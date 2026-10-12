#!/bin/sh
set -eu

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

expected_count() {
    git log --format='COMMIT %H' --numstat | awk '/^COMMIT /{if(c&&f)n++; c=1; f=0; next} NF&&$1!="0"&&$1!="-"{f=1} END{if(c&&f)n++; print n+0}'
}

baseline_count() {
    grep -o '"RuleID"' "$1" | wc -l | tr -d ' '
}

scan() {
    dir=$1
    report="$WORK/report.json"
    log="$WORK/scan.log"
    rc=0
    set -- --no-color --redact --verbose --report-format json --report-path "$report"
    if [ -n "${SCAN_BASELINE:-}" ]; then
        set -- "$@" --baseline-path "$SCAN_BASELINE"
    fi
    if [ -n "${SCAN_CONFIG:-}" ]; then
        set -- "$@" --config "$SCAN_CONFIG"
    fi
    gitleaks git "$@" "$dir" >"$log" 2>&1 || rc=$?
    cat "$log"
    SCAN_RC=$rc
    SCAN_REPORT=$report
    SCAN_SCANNED=$(sed -n 's/.* \([0-9][0-9]*\) commits scanned.*/\1/p' "$log" | tail -1)
}

selftest() {
    for v in $(git rev-parse --local-env-vars); do
        unset "$v"
    done
    SCAN_BASELINE=
    SCAN_CONFIG=
    [ ! -f .gitleaks.toml ] || SCAN_CONFIG="$(pwd)/.gitleaks.toml"
    tmp="$WORK/repo"
    mkdir "$tmp"
    git -C "$tmp" init -q
    git -C "$tmp" config user.email t@example.invalid
    git -C "$tmp" config user.name t
    printf 'clean\n' >"$tmp/clean.txt"
    git -C "$tmp" add clean.txt
    git -C "$tmp" commit -q -m clean
    scan "$tmp"
    [ "$SCAN_RC" -eq 0 ] || { echo "selftest: clean repo must pass"; exit 1; }
    p1=ghp_
    p2=Q7vK2mX9aB4nR8tL1cZ6wE3yU5hJ0dFgS2pA
    printf 'token = "%s%s"\n' "$p1" "$p2" >"$tmp/planted.txt"
    git -C "$tmp" add planted.txt
    git -C "$tmp" commit -q -m planted
    scan "$tmp"
    [ "$SCAN_RC" -ne 0 ] || { echo "selftest: planted secret must fail"; exit 1; }
    grep -q '"RuleID"' "$SCAN_REPORT" || { echo "selftest: no finding in report (tool error?)"; exit 1; }
    echo "selftest ok: clean passes, planted secret reported (config: ${SCAN_CONFIG:-default})"
}

case "${1:-}" in
    selftest) selftest; exit 0 ;;
    expected-count) expected_count; exit 0 ;;
    baseline-count) baseline_count "$2"; exit 0 ;;
esac

[ "$(git rev-parse --is-shallow-repository)" = false ] || { echo "FAIL: shallow clone, history incomplete"; exit 1; }
[ -z "$(git config --get remote.origin.partialclonefilter || true)" ] || { echo "FAIL: partial clone, history incomplete"; exit 1; }
[ -z "$(git config --get extensions.partialclone || true)" ] || { echo "FAIL: partial clone, history incomplete"; exit 1; }
SCAN_BASELINE=${GITLEAKS_BASELINE:-}
SCAN_CONFIG=
if [ -n "$SCAN_BASELINE" ]; then
    echo "baseline: ${SCAN_BASELINE} ($(baseline_count "$SCAN_BASELINE") entries)"
else
    echo "baseline: none"
fi
expected=$(expected_count)
scan .
[ "$SCAN_RC" -eq 0 ] || exit "$SCAN_RC"
if [ -z "$SCAN_SCANNED" ] || [ "$SCAN_SCANNED" -le 0 ]; then
    echo "FAIL: scanner reported no commits scanned"
    exit 1
fi
[ "$SCAN_SCANNED" -ge "$expected" ] || { echo "FAIL: scanned $SCAN_SCANNED, expected at least $expected commits with added non-binary lines (shallow or partial clone?)"; exit 1; }
echo "secret scan covered $SCAN_SCANNED commits (at least $expected expected)"

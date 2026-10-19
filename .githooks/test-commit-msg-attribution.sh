#!/bin/sh
set -u
here=$(cd "$(dirname "$0")" && pwd)
t=$(mktemp -d)
trap 'rm -rf "$t"' EXIT
git init -q "$t/r"
cd "$t/r" || exit 1
mkdir .githooks
cp "$here/commit-msg-attribution" .githooks/
cat > .githooks/commit-msg <<'HOOK'
#!/bin/sh
exec "$(dirname "$0")/commit-msg-attribution" "$1"
HOOK
chmod +x .githooks/commit-msg
git config core.hooksPath .githooks
git config user.name vannifr
git config user.email t@example.invalid
fail=0
expect() {
  want=$1; msg=$2
  echo x >> f; git add f
  if git commit -q -m "$msg" >/dev/null 2>&1; then got=pass; else got=reject; fi
  if [ "$got" = "$want" ]; then echo "ok   $want: $(printf %s "$msg" | tail -n 1)"; else echo "FAIL want=$want got=$got: $msg"; fail=1; fi
}
expect pass "feat: clean commit"
expect pass "fix: co-authored-by mentioned mid-sentence"
expect reject "feat: x

Co-Authored-By: Claude <noreply@anthropic.com>"
expect reject "feat: x

co-authored-by: Someone <a@b.c>"
expect reject "feat: x

CO-AUTHORED-BY: Someone <a@b.c>"
expect reject "feat: x

Generated with Claude Code"
expect reject "feat: x

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
expect pass "docs: ok

Done with care"
exit $fail

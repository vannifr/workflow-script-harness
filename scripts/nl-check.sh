#!/bin/sh
# Public repo: all tracked text is English. Fails on a line that holds three or
# more distinct Dutch function words. Vendored validators are excluded; they
# carry their own word lists.
set -eu

DUTCH='de het een en van niet wordt worden zijn dat die met ook maar naar geen wel nog moet kan dit deze bij aan door hier omdat zonder tussen voor wat hoe waarom alleen'

detect() {
    awk -v words="$DUTCH" '
    BEGIN { n = split(words, w, " "); for (i = 1; i <= n; i++) nl[w[i]] = 1 }
    {
        line = tolower($0); delete seen; cnt = 0
        m = split(line, toks, /[^a-z]+/)
        for (i = 1; i <= m; i++) if (toks[i] in nl && !(toks[i] in seen)) { seen[toks[i]] = 1; cnt++ }
        if (cnt >= 3) printf "%s:%d: %d Dutch words: %s\n", FILENAME, FNR, cnt, $0
    }' "$@"
}

selftest() {
    WORK=$(mktemp -d)
    trap 'rm -rf "$WORK"' EXIT
    printf 'Dit is een zin die niet in het Engels is.\n' > "$WORK/planted.txt"
    printf 'This sentence is written in English only.\n' > "$WORK/clean.txt"
    if [ -z "$(detect "$WORK/planted.txt")" ]; then
        echo "nl-check selftest: planted Dutch sentence was not detected" >&2
        exit 1
    fi
    if [ -n "$(detect "$WORK/clean.txt")" ]; then
        echo "nl-check selftest: English sentence was flagged" >&2
        exit 1
    fi
    echo "nl-check selftest ok"
}

scan() {
    cd "$(dirname "$0")/.."
    files=$(git ls-files | grep -Ev '^scripts/docs-check/|^scripts/nl-check\.sh$|package-lock\.json$|\.(png|jpe?g|gif|ico|woff2?)$')
    text=""
    for f in $files; do
        if grep -Iq . "$f" 2>/dev/null; then text="$text $f"; fi
    done
    if [ -z "$text" ]; then
        echo "nl-check ok: no text files"
        return 0
    fi
    hits=$(detect $text)
    if [ -n "$hits" ]; then
        printf '%s\n' "$hits" >&2
        echo "nl-check: Dutch text found in a public repo (English only)" >&2
        exit 1
    fi
    echo "nl-check ok: no Dutch text in tracked files"
}

case "${1:-scan}" in
    selftest) selftest ;;
    scan) selftest && scan ;;
    *)
        echo "usage: nl-check.sh [selftest|scan]" >&2
        exit 2
        ;;
esac

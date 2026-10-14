import argparse
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RATCHET = ".docs-ratchet.json"
OPTIONS = ".repo-docs.json"


def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def lines_of(path):
    return path.read_text(encoding="utf-8", errors="replace").splitlines()


def dutch_count(text, words):
    tokens = re.findall(r"[a-zà-ÿ']+", text.lower())
    wanted = set(words)
    return sum(1 for t in tokens if t in wanted)


PATH_EXT = r"(?:md|json|ya?ml|toml|py|sh|js|mjs|cjs|ts|tsx|jsx|txt|cfg|ini|sql|html|css|env\\.example)"
BACKTICK = re.compile(r"`([^`\n]+)`")
MD_LINK = re.compile(r"\]\(([^)\s]+)\)")
SKIP_FENCE = re.compile(r"^(```|~~~)")


def referenced_paths(text):
    found, fenced = [], False
    for line in text.splitlines():
        if SKIP_FENCE.match(line.strip()):
            fenced = not fenced
            continue
        if fenced:
            continue
        candidates = [re.sub(r"(#.*|:\d+(-\d+)?)$", "", m.group(1).strip()) for m in BACKTICK.finditer(line)]
        candidates += [m.group(1).split("#")[0] for m in MD_LINK.finditer(line)]
        for c in candidates:
            if not c or c.startswith(("http://", "https://", "mailto:", "~", "/", "#", "-", "@", "$", ".")) and not c.startswith("./") and not c.startswith("../"):
                continue
            if re.search(r"[\s*?<>{}$|&;=()\[\]]", c):
                continue
            if "/" in c or re.search(r"\." + PATH_EXT + "$", c):
                found.append(c.rstrip("/").rstrip(".,:"))
    return found


SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".astro", "coverage", ".cache", ".tessl"}
SLUG = re.compile(r"^[\w.-]+/[\w.-]+$")


def basename_exists(root, name):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        if name in filenames or name in dirnames:
            return True
    return False


def check_references(root, conf, warnings):
    for name in ("AGENTS.md", "CLAUDE.md", "README.md"):
        path = root / name
        if not path.is_file():
            continue
        seen = set()
        for ref in referenced_paths(path.read_text(encoding="utf-8", errors="replace")):
            if ref in seen or ref.startswith("../"):
                continue
            seen.add(ref)
            if "/" not in ref and "." not in ref:
                continue
            if "/" in ref and SLUG.match(ref) and not re.search(r"\." + PATH_EXT + "$", ref):
                continue
            if (root / ref).exists() or ("/" not in ref and basename_exists(root, ref)):
                continue
            warnings.append("%s refers to %s, which does not exist" % (name, ref))


def check_agents(root, conf, errors, warnings):
    agents = root / "AGENTS.md"
    claude = root / "CLAUDE.md"
    if not agents.is_file():
        errors.append("AGENTS.md is missing")
        return None
    text = agents.read_text(encoding="utf-8", errors="replace")
    if not claude.is_file():
        errors.append("CLAUDE.md is missing, so AGENTS.md is not loaded in Claude Code")
    else:
        body = claude.read_text(encoding="utf-8", errors="replace")
        if body.strip() == text.strip():
            errors.append("CLAUDE.md is a copy of AGENTS.md: replace it by the single line %s" % conf["claude_import_line"])
        elif conf["claude_import_line"] not in [ln.strip() for ln in body.splitlines()]:
            errors.append("CLAUDE.md does not import AGENTS.md (needs a line %s)" % conf["claude_import_line"])
    heading = conf["agents_pointer_heading"]
    section = re.search(r"^%s\s*$(.*?)(?=^## |\Z)" % re.escape(heading), text, re.M | re.S)
    if not section:
        errors.append("AGENTS.md lacks the section '%s' (see tools/docs-check/snippets/agents-working-rules.md)" % heading)
    elif conf["agents_pointer_marker"] not in section.group(1):
        errors.append("section '%s' does not point to %s" % (heading, conf["agents_pointer_marker"]))
    for marker in conf["global_copy_markers"]:
        if marker in text:
            errors.append("AGENTS.md copies global rule text (%r): point to the global rules instead" % marker)
    return len(text.splitlines())


def check_readme(root, conf, errors, warnings):
    readme = root / "README.md"
    if not readme.is_file():
        errors.append("README.md is missing")
        return None
    rows = lines_of(readme)
    text = "\n".join(rows)
    first = next((r for r in rows if r.strip()), "")
    if not re.match(r"^# \S", first):
        errors.append("README.md does not start with a '# Title' line")
    window = rows[: conf["readme_purpose_window"]]
    if not any(r.strip() and not r.lstrip().startswith(("#", "<", "![", "[!", "---", "```")) for r in window[1:]):
        errors.append("README.md has no purpose sentence in its first %d lines" % conf["readme_purpose_window"])
    for mention in conf["readme_required_mentions"]:
        if mention == "BACKLOG.md" and not (root / "BACKLOG.md").is_file():
            continue
        if mention not in text:
            errors.append("README.md does not mention %s" % mention)
    low = text.lower()
    if not re.search(r"quick ?start|getting started|install|usage|run|snel starten|gebruik", low):
        warnings.append("README.md says nothing about how to start or use the project")
    if "test" not in low:
        warnings.append("README.md says nothing about how to test")
    return len(rows)


def check_language(root, conf, errors):
    options = load_json(root / OPTIONS) or {}
    if not options.get("public"):
        return
    for name in ("AGENTS.md", "README.md", "CLAUDE.md"):
        path = root / name
        if path.is_file():
            hits = dutch_count(path.read_text(encoding="utf-8", errors="replace"), conf["dutch_stopwords"])
            if hits >= conf["dutch_threshold"]:
                errors.append("%s looks Dutch (%d stopword hits) in a public repository: English only" % (name, hits))


def check_ratchet(root, sizes, conf, errors, warnings, write):
    path = root / RATCHET
    current = {"agents_lines": sizes.get("agents"), "readme_lines": sizes.get("readme")}
    current = {k: v for k, v in current.items() if v is not None}
    if write:
        old = load_json(path) or {}
        merged = {k: min(v, old.get(k, v)) for k, v in current.items()}
        path.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")
        return
    recorded = load_json(path)
    limit = conf["agents_max_lines"]
    if sizes.get("agents") and sizes["agents"] > limit:
        if recorded is None:
            warnings.append("AGENTS.md has %d lines (target %d); record the current size with --write-ratchet so it can only shrink" % (sizes["agents"], limit))
        elif sizes["agents"] > recorded.get("agents_lines", sizes["agents"]):
            errors.append("AGENTS.md grew to %d lines, above the recorded %d (ratchet)" % (sizes["agents"], recorded["agents_lines"]))
        else:
            warnings.append("AGENTS.md has %d lines (target %d, ratchet %d)" % (sizes["agents"], limit, recorded.get("agents_lines", 0)))
    if recorded and sizes.get("readme") and sizes["readme"] > recorded.get("readme_lines", sizes["readme"]):
        errors.append("README.md grew to %d lines, above the recorded %d (ratchet)" % (sizes["readme"], recorded["readme_lines"]))


def check_repo(root, conf, write_ratchet=False):
    root = Path(root)
    errors, warnings = [], []
    sizes = {}
    sizes["agents"] = check_agents(root, conf, errors, warnings)
    sizes["readme"] = check_readme(root, conf, errors, warnings)
    check_language(root, conf, errors)
    check_references(root, conf, warnings)
    if not (root / "BACKLOG.md").is_file():
        warnings.append("BACKLOG.md is missing (the backlog-system check rolls this out)")
    check_ratchet(root, sizes, conf, errors, warnings, write_ratchet)
    return errors, warnings


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--config", default=str(HERE / "conventions.json"))
    ap.add_argument("--name", default=None)
    ap.add_argument("--format", choices=("text", "json"), default="text")
    ap.add_argument("--write-ratchet", action="store_true")
    args = ap.parse_args(argv)
    conf = load_json(args.config)
    if conf is None:
        print("cannot read config %s" % args.config, file=sys.stderr)
        return 2
    root = Path(args.repo).resolve()
    errors, warnings = check_repo(root, conf, args.write_ratchet)
    name = args.name or root.name
    if args.format == "json":
        print(json.dumps({"repo": name, "errors": errors, "warnings": warnings}))
    else:
        for e in errors:
            print("%s: error: %s" % (name, e))
        for w in warnings:
            print("%s: warning: %s" % (name, w))
        print("%d error(s), %d warning(s)" % (len(errors), len(warnings)))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

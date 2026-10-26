import json
import re
from datetime import date
from pathlib import Path

DEFAULTS_FILE = Path(__file__).resolve().parent.parent / "convention.json"
OVERRIDE_NAME = "backlog-convention.json"
INSTANCE_KEYS = ("commitment_register",)
NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")
FOLDED = (">-", ">", "|", "|-")

DONE_STATUSES = ("done",)
BLOCKED_STATUSES = ("blocked",)
PARKED_STATUSES = ("parked", "on hold")


def read(path):
    return Path(path).read_text(encoding="utf-8", errors="replace")


def _scalar(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        inner = value[1:-1]
        return inner.replace("''", "'") if value[0] == "'" else inner
    return value


def load_config(instance=None):
    config = json.loads(read(DEFAULTS_FILE))
    overridden = []
    if instance is not None:
        override = Path(instance) / OVERRIDE_NAME
        if override.is_file():
            data = json.loads(read(override))
            overridden = sorted(k for k in data if k not in INSTANCE_KEYS and config.get(k) != data[k])
            config.update(data)
    config["_overridden"] = overridden
    return config


def read_registry(instance):
    names = []
    invalid = []
    registry = Path(instance) / "repos.txt"
    if registry.is_file():
        for raw in read(registry).splitlines():
            name = raw.strip()
            if not name or name.startswith("#"):
                continue
            (names if NAME_RE.match(name) else invalid).append(name)
    return names, invalid


def read_inventory(instance):
    entries = {}
    problems = []
    path = Path(instance) / "inventory.txt"
    if not path.is_file():
        return entries, problems
    for number, raw in enumerate(read(path).splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 3 or not parts[2]:
            problems.append("inventory.txt:%d: format is '<repo> | <status> | <reason>'" % number)
            continue
        if len(parts) > 6:
            problems.append("inventory.txt:%d: too many columns (format '<repo> | <status> | <reason> | <goal> | <kind> | <herzien op>'; a reason must not contain '|')" % number)
            continue
        if not NAME_RE.match(parts[0]):
            problems.append("inventory.txt:%d: invalid repo name '%s'" % (number, parts[0]))
            continue
        if parts[0] in entries:
            problems.append("inventory.txt:%d: '%s' is listed twice" % (number, parts[0]))
            continue
        entries[parts[0]] = (parts[1], parts[2])
    return entries, problems


def read_inventory_goals(instance):
    goals = {}
    path = Path(instance) / "inventory.txt"
    if not path.is_file():
        return goals
    for raw in read(path).splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if 3 < len(parts) <= 6 and parts[2] and parts[3] and NAME_RE.match(parts[0]):
            goals.setdefault(parts[0], parts[3])
    return goals


def read_inventory_review_dates(instance):
    dates = {}
    path = Path(instance) / "inventory.txt"
    if not path.is_file():
        return dates
    for raw in read(path).splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) == 6 and NAME_RE.match(parts[0]):
            dates.setdefault(parts[0], parts[5])
    return dates


def read_inventory_kinds(instance):
    kinds = {}
    path = Path(instance) / "inventory.txt"
    if not path.is_file():
        return kinds
    for raw in read(path).splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) in (5, 6) and parts[2] and parts[4] and NAME_RE.match(parts[0]):
            kinds.setdefault(parts[0], parts[4])
    return kinds


GOAL_ID_RE = re.compile(r"^D[1-9]\d*$")
GOAL_HORIZONS = ("H1", "H2", "H3")
GOAL_REPO_RE = re.compile(r"^[A-Za-z0-9._-]+\+?$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def read_goals(instance):
    objectives = []
    problems = []
    path = Path(instance) / "goals.txt"
    if not path.is_file():
        return objectives, problems
    seen = set()
    for number, raw in enumerate(read(path).splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 5:
            problems.append("goals.txt:%d: expected 5 columns '<id> | <title> | <H1|H2|H3> | <decision date> | <repos>', found %d" % (number, len(parts)))
            continue
        gid, title, horizon, decision, repos = parts
        if not GOAL_ID_RE.match(gid):
            problems.append("goals.txt:%d: invalid id '%s' (use D<number>)" % (number, gid))
            continue
        if gid in seen:
            problems.append("goals.txt:%d: '%s' is listed twice" % (number, gid))
            continue
        seen.add(gid)
        if not title:
            problems.append("goals.txt:%d: %s has no title" % (number, gid))
        if not horizon:
            problems.append("goals.txt:%d: %s has no horizon (use H1, H2 or H3)" % (number, gid))
        elif horizon not in GOAL_HORIZONS:
            problems.append("goals.txt:%d: invalid horizon '%s' (use H1, H2 or H3)" % (number, horizon))
            horizon = ""
        if not decision:
            problems.append("goals.txt:%d: %s has no decision date (use YYYY-MM-DD)" % (number, gid))
        else:
            try:
                if not DATE_RE.match(decision):
                    raise ValueError(decision)
                date.fromisoformat(decision)
            except ValueError:
                problems.append("goals.txt:%d: invalid decision date '%s' (use YYYY-MM-DD)" % (number, decision))
                decision = ""
        tokens = [t.strip() for t in repos.split(",") if t.strip()]
        if not tokens:
            problems.append("goals.txt:%d: %s lists no repos" % (number, gid))
        primary = []
        secondary = []
        for token in tokens:
            if not GOAL_REPO_RE.match(token):
                problems.append("goals.txt:%d: invalid repo '%s' (use <repo> or <repo>+)" % (number, token))
                continue
            repo = token.rstrip("+")
            if repo in primary or repo in secondary:
                problems.append("goals.txt:%d: '%s' is listed twice in %s" % (number, repo, gid))
                continue
            (primary if token.endswith("+") else secondary).append(repo)
        objectives.append({"id": gid, "title": title, "horizon": horizon, "decision": decision, "primary": primary, "secondary": secondary, "line": number})
    return objectives, problems


def read_milestones(instance):
    found = {}
    folder = Path(instance) / "backlog" / "milestones"
    if not folder.is_dir():
        return found
    for path in sorted(folder.glob("*.md")):
        match = re.match(r"^---\n(.*?)\n---", read(path), re.S)
        if not match:
            continue
        fields = dict(
            (m.group(1), _scalar(m.group(2)))
            for m in (re.match(r"^([a-z_]+):\s*(.*)$", line) for line in match.group(1).splitlines()) if m)
        if fields.get("id") and fields.get("title"):
            found[fields["id"]] = fields["title"]
    return found


def task_objective(task, milestones):
    title = milestones.get(task.get("milestone", ""), "")
    return title if GOAL_ID_RE.match(title) else None


def parse_task(path):
    text = read(path)
    match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not match:
        return None
    task = {"path": str(path), "labels": [], "dependencies": [], "references": []}
    key = None
    lines = match.group(1).splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        index += 1
        item = re.match(r"^\s+-\s+(.*)$", line)
        if item and key in ("labels", "dependencies", "references"):
            value = item.group(1).strip()
            if value in (">-", ">", "|", "|-"):
                folded = []
                while index < len(lines) and re.match(r"^\s{3,}\S", lines[index]) and not re.match(r"^\s+-\s", lines[index]):
                    folded.append(lines[index].strip())
                    index += 1
                value = " ".join(folded)
            task[key].append(_scalar(value))
            continue
        pair = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if not pair:
            continue
        key = pair.group(1)
        value = pair.group(2).strip()
        if value in FOLDED:
            folded = []
            while index < len(lines) and re.match(r"^\s+\S", lines[index]) and not re.match(r"^[a-z_]+:", lines[index]):
                folded.append(lines[index].strip())
                index += 1
            value = " ".join(folded)
        if key in ("labels", "dependencies", "references"):
            if value.startswith("[") and value.endswith("]"):
                inner = value[1:-1].strip()
                task[key] = [_scalar(v) for v in inner.split(",")] if inner else []
        else:
            task[key] = _scalar(value)
    if "id" not in task or "title" not in task:
        return None
    body = re.search(r"<!-- SECTION:DESCRIPTION:BEGIN -->\n(.*?)\n<!-- SECTION:DESCRIPTION:END -->", text, re.S)
    task["description"] = " ".join(body.group(1).split()) if body else ""
    return task


def load_tasks(instance):
    tasks = []
    for path in sorted((Path(instance) / "backlog" / "tasks").glob("*.md")):
        task = parse_task(path)
        if task:
            tasks.append(task)
    return tasks


def is_done(task):
    return task.get("status", "").lower() in DONE_STATUSES


def is_blocked_status(task):
    return task.get("status", "").lower() in BLOCKED_STATUSES


def is_parked(task):
    return task.get("status", "").lower() in PARKED_STATUSES

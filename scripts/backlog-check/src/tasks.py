import json
import re
from pathlib import Path

DEFAULTS_FILE = Path(__file__).resolve().parent.parent / "convention.json"
OVERRIDE_NAME = "backlog-convention.json"
NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")
FOLDED = (">-", ">", "|", "|-")

DONE_STATUSES = ("done",)
BLOCKED_STATUSES = ("blocked",)


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
            overridden = sorted(k for k in data if config.get(k) != data[k])
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
        if not NAME_RE.match(parts[0]):
            problems.append("inventory.txt:%d: invalid repo name '%s'" % (number, parts[0]))
            continue
        if parts[0] in entries:
            problems.append("inventory.txt:%d: '%s' is listed twice" % (number, parts[0]))
            continue
        entries[parts[0]] = (parts[1], parts[2])
    return entries, problems


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

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tasks as tk  # noqa: E402

ITEM_START = re.compile(r"^- \[(.)\] ")
ITEM = re.compile(r"^- \[ \] \*\*(.+?)\*\* \(([^)]*)\) — ")
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])(,\s.*)?$")
TASK_LINK = re.compile(r"^TASK-(\d+)$")
LEGACY_BACKLOG_NAMES = ("backlog.md",)


load_config = tk.load_config


def valid_date(value):
    try:
        date.fromisoformat(value)
        return True
    except ValueError:
        return False


def parse_meta(meta, config):
    errors = []
    parts = [p.strip() for p in meta.split(" · ")]
    actors = "|".join(re.escape(a) for a in config["actors"])
    if not re.match(r"^(%s)\b" % actors, parts[0]):
        errors.append("actor must start with one of %s: '%s'" % ("/".join(config["actors"]), parts[0]))
    contexts = tuple(config["contexts"])
    deadline = None
    task_id = None
    has_context = False
    for part in parts[1:]:
        if part.startswith("task:"):
            value = part[len("task:"):].strip().upper()
            link = TASK_LINK.match(value)
            if link:
                task_id = "TASK-%d" % int(link.group(1))
            else:
                errors.append("task link must be TASK-<number>: '%s'" % part[len("task:"):].strip())
        elif part.startswith("deadline:"):
            value = part[len("deadline:"):].strip()
            if DATE.match(value) and valid_date(value):
                deadline = value
            elif not MONTH.match(value):
                errors.append("deadline must be YYYY-MM-DD (or YYYY-MM): '%s'" % value)
        elif part.startswith("context:"):
            has_context = True
            value = part[len("context:"):].strip()
            if (value.split() or [""])[0] not in contexts:
                errors.append("context must be one of %s: '%s'" % ("|".join(contexts), value))
    if not has_context:
        errors.append("context is missing")
    return errors, deadline, task_id


def check_file(name, path, config):
    errors = []
    deadlines = []
    items = []
    sections = config["sections"]
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    prefix = config["title_prefix"] + name
    if not lines or not lines[0].startswith(prefix):
        errors.append("%s: first line must start with '%s'" % (name, prefix))
    if config["convention_word"] not in text:
        errors.append("%s: reference to the convention ('%s') is missing" % (name, config["convention_word"]))
    section = None
    seen = []
    counts = Counter()
    markers = Counter()
    marker = config.get("empty_marker")
    for number, line in enumerate(lines, 1):
        heading = re.match(r"^## (.+?)\s*$", line)
        if heading:
            title = heading.group(1)
            if title not in sections:
                errors.append("%s:%d: unknown section '%s' (allowed: %s)" % (name, number, title, ", ".join(sections)))
                section = None
                continue
            if title in seen:
                errors.append("%s:%d: section '%s' is duplicated" % (name, number, title))
            elif seen and sections.index(title) < sections.index(seen[-1]):
                errors.append("%s:%d: section '%s' is out of order (fixed: %s)" % (name, number, title, ", ".join(sections)))
            seen.append(title)
            section = title
            continue
        if marker and section is not None and line.strip() == marker:
            markers[section] += 1
            continue
        start = ITEM_START.match(line)
        if not start:
            continue
        where = "%s:%d" % (name, number)
        if start.group(1) != " ":
            errors.append("%s: finished item is still listed, remove it" % where)
            continue
        if section is None:
            errors.append("%s: item is outside a section" % where)
            continue
        counts[section] += 1
        match = ITEM.match(line)
        if not match:
            errors.append("%s: item format is '- [ ] **Title** (actor · deadline · context) — sentence'" % where)
            continue
        meta_errors, deadline, task_id = parse_meta(match.group(2), config)
        errors.extend("%s: %s" % (where, e) for e in meta_errors)
        items.append({"title": match.group(1), "section": section, "deadline": deadline, "task": task_id, "where": where})
        if deadline:
            deadlines.append((deadline, match.group(1)))
    if config.get("require_all_sections"):
        for title in sections:
            if title not in seen:
                errors.append("%s: section '%s' is missing (all sections stay, an empty one shows '%s')" % (name, title, marker))
            elif counts[title] == 0 and markers[title] == 0:
                errors.append("%s: section '%s' is empty, add '%s'" % (name, title, marker))
            elif counts[title] > 0 and markers[title] > 0:
                errors.append("%s: section '%s' has items and the empty marker" % (name, title))
    if counts[config["now_section"]] > config["now_max"]:
        errors.append("%s: %s has %d items, maximum %d" % (name, config["now_section"], counts[config["now_section"]], config["now_max"]))
    return errors, deadlines, items


PATH_EXTENSIONS = (".md", ".py", ".sh", ".js", ".mjs", ".ts", ".json", ".yml", ".yaml", ".toml", ".txt", ".pdf", ".astro")
REF_SKIP = re.compile(r"[~<>*{}$|\s]|://|^-|^/|^\.\.?$")


def looks_like_path(token):
    if REF_SKIP.search(token):
        return False
    base = re.sub(r":\d+(-\d+)?$", "", token)
    return "/" in base or base.endswith(PATH_EXTENSIONS)


def repo_basenames(repo_root):
    try:
        result = subprocess.run(["git", "-C", str(repo_root), "ls-files"], capture_output=True, text=True, errors="replace")
    except OSError:
        result = None
    if result is not None and result.returncode == 0 and result.stdout:
        return {Path(f).name for f in result.stdout.splitlines()}
    return {p.name for p in Path(repo_root).rglob("*") if ".git" not in p.parts and "node_modules" not in p.parts}


def check_source_refs(name, path, repo_root, projects=None):
    warnings = []
    basenames = None
    for number, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        if not ITEM_START.match(line):
            continue
        for token in re.findall(r"`([^`]+)`", line):
            if not looks_like_path(token):
                continue
            target = re.sub(r":\d+(-\d+)?$", "", token).rstrip("/")
            if "/" not in target:
                if basenames is None:
                    basenames = repo_basenames(repo_root)
                if target in basenames or (repo_root / target).exists():
                    continue
            if not ((repo_root / target).exists() or (projects is not None and (Path(projects) / target).exists())):
                warnings.append("%s:%d: referenced path '%s' does not exist" % (name, number, token))
    return warnings


def check_task_refs(instance, projects):
    warnings = []
    for task in tk.load_tasks(instance):
        for ref in task["references"]:
            if "://" in ref:
                continue
            if not ((Path(projects) / ref).exists() or (Path(instance) / ref).exists()):
                warnings.append("%s: reference '%s' does not exist" % (task["id"], ref))
    return warnings


def line_ages(path):
    try:
        result = subprocess.run(
            ["git", "-C", str(path.parent), "blame", "--line-porcelain", path.name],
            capture_output=True, text=True, errors="replace",
        )
    except OSError:
        return None
    if result.returncode != 0:
        return None
    ages = []
    stamp = None
    for line in result.stdout.splitlines():
        if line.startswith("author-time "):
            stamp = int(line.split()[1])
        elif line.startswith("\t"):
            ages.append(stamp)
    return ages


def check_staleness(name, path, today, stale_days):
    ages = line_ages(path)
    if ages is None:
        return []
    warnings = []
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    for number, line in enumerate(lines, 1):
        if not ITEM_START.match(line) or number > len(ages) or ages[number - 1] is None:
            continue
        touched = datetime.fromtimestamp(ages[number - 1], timezone.utc).date()
        days = (today - touched).days
        if days > stale_days:
            title = re.match(r"^- \[ \] \*\*(.+?)\*\*", line)
            warnings.append("%s:%d: '%s' not touched for %d days" % (name, number, title.group(1) if title else "item", days))
    return warnings


def check_links(name, items, tasks_by_id, config, seen_links):
    errors = []
    warnings = []
    blocked_section = config.get("blocked_section", "Geblokkeerd")
    for item in items:
        if not item["task"]:
            continue
        where = item["where"]
        task = tasks_by_id.get(item["task"])
        if task is None:
            errors.append("%s: linked task %s does not exist in the instance" % (where, item["task"]))
            continue
        if item["task"] in seen_links:
            warnings.append("%s: %s is already linked from %s" % (where, item["task"], seen_links[item["task"]]))
        else:
            seen_links[item["task"]] = where
        if task.get("project") and task["project"] != name:
            warnings.append("%s: %s belongs to project '%s', not '%s'" % (where, item["task"], task["project"], name))
        if tk.is_done(task):
            warnings.append("%s: %s is Done but the item is still listed ('%s'); remove it" % (where, item["task"], item["title"]))
            continue
        if tk.is_blocked_status(task) and item["section"] != blocked_section:
            warnings.append("%s: %s is Blocked but the item is in %s, not %s" % (where, item["task"], item["section"], blocked_section))
        if item["section"] == blocked_section and not tk.is_blocked_status(task):
            warnings.append("%s: item is in %s but %s has status %s" % (where, blocked_section, item["task"], task.get("status", "?")))
        task_due = task.get("due_date") or None
        if task_due != item["deadline"]:
            warnings.append("%s: deadline differs, item %s, %s %s" % (where, item["deadline"] or "none", item["task"], task_due or "none"))
    return errors, warnings


ALLOWED_PRIORITIES = ("high", "medium", "low")


def read_instance_config(instance):
    path = Path(instance) / "backlog" / "config.yml"
    text = path.read_text(encoding="utf-8", errors="replace") if path.is_file() else ""
    statuses = []
    match = re.search(r"^statuses:\s*(\[.*\])\s*$", text, re.M)
    if match:
        try:
            statuses = json.loads(match.group(1))
        except ValueError:
            statuses = []
    projects = []
    block = re.search(r"^projects:\s*\n((?:\s+-\s+\S+\n?)+)", text, re.M)
    if block:
        projects = [line.strip()[2:].strip() for line in block.group(1).splitlines() if line.strip()]
    return statuses, projects


def check_tasks(task_list, statuses=None, projects=None):
    errors = []
    seen = Counter(t["id"].upper() for t in task_list)
    for tid, count in seen.items():
        if count > 1:
            errors.append("%s: id is used by %d task files" % (tid, count))
    ids = set(seen)
    for task in task_list:
        tid = task["id"]
        status = task.get("status", "")
        if statuses and status not in statuses:
            errors.append("%s: status '%s' is not one of %s" % (tid, status, ", ".join(statuses)))
        project = task.get("project", "")
        if not project:
            errors.append("%s: project is missing" % tid)
        elif projects and project not in projects:
            errors.append("%s: project '%s' is not in backlog/config.yml projects" % (tid, project))
        priority = task.get("priority", "")
        if priority and priority.lower() not in ALLOWED_PRIORITIES:
            errors.append("%s: priority '%s' must be high, medium or low" % (tid, priority))
        due = task.get("due_date", "")
        if due and not (DATE.match(due) and valid_date(due)):
            errors.append("%s: due_date '%s' is not YYYY-MM-DD" % (tid, due))
        for dep in task["dependencies"]:
            if dep.upper() not in ids:
                errors.append("%s: dependency %s does not exist" % (tid, dep))
        if tk.is_blocked_status(task) and not task.get("description"):
            errors.append("%s: a Blocked task needs the reason in its description" % tid)
    return errors


def check_inventory(instance, names, config, projects=None):
    errors = []
    warnings = []
    path = Path(instance) / "inventory.txt"
    if not path.is_file():
        return errors, warnings
    entries, problems = tk.read_inventory(instance)
    errors.extend(problems)
    allowed = config.get("inventory_statuses", [])
    for repo, (status, _) in entries.items():
        if allowed and status not in allowed:
            errors.append("inventory.txt: '%s' has unknown status '%s' (allowed: %s)" % (repo, status, ", ".join(allowed)))
    for repo in names:
        if repo not in entries:
            errors.append("inventory.txt: '%s' is in repos.txt but not in the inventory" % repo)
        elif entries[repo][0] != "adopterend":
            errors.append("inventory.txt: '%s' is in repos.txt but its status is '%s', not 'adopterend'" % (repo, entries[repo][0]))
    for repo, (status, _) in entries.items():
        if status == "adopterend" and repo not in names:
            errors.append("inventory.txt: '%s' is 'adopterend' but not in repos.txt" % repo)
    if projects is not None and Path(projects).is_dir():
        for entry in sorted(Path(projects).iterdir()):
            if (entry / ".git").exists() and entry.name not in entries:
                warnings.append("inventory.txt: git repo '%s' in the projects directory is not classified" % entry.name)
    return errors, warnings


def check_instance_only(instance):
    instance = Path(instance)
    errors = []
    warnings = []
    task_dir = instance / "backlog" / "tasks"
    files = sorted(task_dir.glob("*.md")) if task_dir.is_dir() else []
    task_list = tk.load_tasks(instance)
    if len(task_list) != len(files):
        errors.append("%d task file(s) cannot be parsed (id and title are required)" % (len(files) - len(task_list)))
    statuses, projects = read_instance_config(instance)
    if not statuses:
        errors.append("backlog/config.yml: statuses not found")
    if not projects:
        errors.append("backlog/config.yml: projects not found")
    errors.extend(check_tasks(task_list, statuses, projects))
    names, invalid = tk.read_registry(instance)
    errors.extend("repos.txt: invalid repo name '%s'" % n for n in invalid)
    inv_errors, _ = check_inventory(instance, names, tk.load_config(instance))
    errors.extend(inv_errors)
    for name in names:
        if projects and name not in projects:
            warnings.append("repos.txt: '%s' is not in backlog/config.yml projects" % name)
    return errors, warnings


def legacy_backlog_files(root):
    found = []
    for folder in (root, root / "docs"):
        if folder.is_dir():
            for path in sorted(folder.iterdir()):
                if path.is_file() and path.name.lower() in LEGACY_BACKLOG_NAMES and not (folder == root and path.name == "BACKLOG.md"):
                    found.append(path)
    return found


def check_agents(name, root, config):
    problems = []
    root = Path(root)
    agents = root / "AGENTS.md"
    claude = root / "CLAUDE.md"
    if not agents.is_file():
        return ["%s: AGENTS.md is missing" % name]
    text = agents.read_text(encoding="utf-8", errors="replace")
    for marker in config.get("agents_markers", []):
        if not re.search(marker["pattern"], text):
            problems.append("%s: AGENTS.md lacks %s (see docs/agents-snippet.md)" % (name, marker["name"]))
    if not claude.is_file():
        problems.append("%s: CLAUDE.md is missing, so AGENTS.md is not loaded in Claude Code" % name)
    elif "@AGENTS.md" not in claude.read_text(encoding="utf-8", errors="replace"):
        problems.append("%s: CLAUDE.md does not import @AGENTS.md" % name)
    stale = config.get("agents_stale_pattern")
    history = tuple(config.get("agents_history_words", []))
    if stale:
        for filename in ("AGENTS.md", "CLAUDE.md"):
            path = root / filename
            if not path.is_file():
                continue
            for number, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if re.search(stale, line) and not any(word in line.lower() for word in history):
                    problems.append("%s: %s:%d refers to an old backlog file name" % (name, filename, number))
    return problems


def split_agents(problems, config):
    if config.get("agents_check_level", "warning") == "error":
        return problems, []
    return [], problems


def check_instance(instance, projects, today=None):
    instance = Path(instance)
    projects = Path(projects)
    config = load_config(instance)
    names, invalid = tk.read_registry(instance)
    errors = ["repos.txt: invalid repo name '%s'" % n for n in invalid]
    if not names:
        return errors or ["repos.txt is empty"], []
    today = today or date.today()
    warnings = list(check_task_refs(instance, projects))
    if config.get("_overridden"):
        warnings.append("convention overridden in backlog-convention.json: %s" % ", ".join(config["_overridden"]))
    inv_errors, inv_warnings = check_inventory(instance, names, config, projects)
    errors.extend(inv_errors)
    warnings.extend(inv_warnings)
    task_list = tk.load_tasks(instance)
    errors.extend(check_tasks(task_list))
    tasks_by_id = {t["id"].upper(): t for t in task_list}
    seen_links = {}
    collected = []
    for name in names:
        path = projects / name / "BACKLOG.md"
        if not path.is_file():
            errors.append("%s: BACKLOG.md is missing in %s" % (name, projects / name))
            continue
        file_errors, _, items = check_file(name, path, config)
        errors.extend(file_errors)
        link_errors, link_warnings = check_links(name, items, tasks_by_id, config, seen_links)
        errors.extend(link_errors)
        warnings.extend(link_warnings)
        collected.append((name, items))
        warnings.extend(check_source_refs(name, path, projects / name, projects))
        warnings.extend(check_staleness(name, path, today, config.get("stale_days", 30)))
        agents_errors, agents_warnings = split_agents(check_agents(name, projects / name, config), config)
        errors.extend(agents_errors)
        warnings.extend(agents_warnings)
        for legacy in legacy_backlog_files(projects / name):
            warnings.append("%s: legacy backlog file %s is still present; merge it into BACKLOG.md and remove it" % (name, legacy.relative_to(projects / name)))
    remaining = Counter()
    for task in task_list:
        due = task.get("due_date") or ""
        if task.get("project") and DATE.match(due) and valid_date(due) and not tk.is_done(task):
            remaining[(task["project"], due)] += 1
    for name, items in collected:
        for item in items:
            task = tasks_by_id.get(item["task"]) if item["task"] else None
            if task is not None and task.get("project") and (task.get("due_date") or "") and remaining[(task["project"], task["due_date"])] > 0:
                remaining[(task["project"], task["due_date"])] -= 1
    for name, items in collected:
        for item in items:
            if item["task"] or not item["deadline"]:
                continue
            key = (name, item["deadline"])
            if remaining[key] > 0:
                remaining[key] -= 1
            else:
                warnings.append("%s: deadline %s ('%s') is not a task in the instance" % (item["where"], item["deadline"], item["title"]))
    for task in task_list:
        if task.get("project") in names and not tk.is_done(task) and task["id"].upper() not in seen_links:
            warnings.append("%s: instance task is not linked from the %s BACKLOG.md (add 'task: %s' to its item)" % (task["id"], task["project"], task["id"]))
    return errors, warnings


def check_single(path, name):
    errors, _, _ = check_file(name, Path(path), load_config())
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description="Validate repo BACKLOG.md files against the convention.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--instance", help="instance directory with repos.txt and backlog/tasks")
    group.add_argument("--file", help="validate a single BACKLOG.md")
    group.add_argument("--agents-dir", help="check AGENTS.md and CLAUDE.md of a single repo directory (use with --name)")
    parser.add_argument("--instance-only", action="store_true", help="with --instance: check only the instance (tasks, config), not the repos")
    parser.add_argument("--name", help="repo name for --file (default: parent directory name)")
    parser.add_argument("--projects-dir", help="directory holding the repos (default: parent of the instance)")
    args = parser.parse_args(argv)
    if args.agents_dir:
        directory = Path(args.agents_dir).resolve()
        config = load_config()
        errors, warnings = split_agents(check_agents(args.name or directory.name, directory, config), config)
    elif args.instance and args.instance_only:
        errors, warnings = check_instance_only(Path(args.instance).resolve())
    elif args.instance:
        instance = Path(args.instance).resolve()
        projects = Path(args.projects_dir).resolve() if args.projects_dir else instance.parent
        errors, warnings = check_instance(instance, projects)
    else:
        path = Path(args.file).resolve()
        errors, warnings = check_single(path, args.name or path.parent.name), []
    for w in warnings:
        print("WARNING " + w)
    for e in errors:
        print("ERROR " + e)
    print("%d error(s), %d warning(s)" % (len(errors), len(warnings)))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

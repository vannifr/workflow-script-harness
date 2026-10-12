#!/bin/sh
run_iikit_hook() {
    hook_name="$1"
    common_dir="$(git rev-parse --git-common-dir 2>/dev/null)" || common_dir=""
    hooks_dir=""
    if [ -n "$common_dir" ] && [ -d "$common_dir/hooks" ]; then
        hooks_dir="$(cd "$common_dir/hooks" && pwd)"
    fi
    iikit_hook=""
    if [ -n "$hooks_dir" ]; then
        if [ -x "$hooks_dir/iikit-$hook_name" ]; then
            iikit_hook="$hooks_dir/iikit-$hook_name"
        elif [ -x "$hooks_dir/$hook_name" ] && grep -q "IIKIT-$(printf '%s' "$hook_name" | tr 'a-z' 'A-Z')" "$hooks_dir/$hook_name" 2>/dev/null; then
            iikit_hook="$hooks_dir/$hook_name"
        fi
    fi
    if [ -z "$iikit_hook" ]; then
        echo "iikit hook not found ($hook_name), chain skipped"
        return 0
    fi
    "$iikit_hook"
}

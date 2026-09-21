#!/usr/bin/env bash
# PostToolUse(Write|Edit): formatea con Prettier y autocorrige con ESLint.
# Los errores de ESLint que queden vuelven a Claude como additionalContext.
set -u

payload=$(cat)
f=$(printf '%s' "$payload" | jq -r '.tool_response.filePath // .tool_input.file_path // empty')

[ -n "$f" ] && [ -f "$f" ] || exit 0

# Solo archivos dentro del proyecto (evita scratchpad, ~/.claude, etc.)
root="${CLAUDE_PROJECT_DIR:-$PWD}"
case "$f" in "$root"/*) ;; *) exit 0 ;; esac

cd "$root" || exit 0

# Prettier: --ignore-unknown salta extensiones que no conoce; respeta .prettierignore
npx --no-install prettier --write --ignore-unknown "$f" >/dev/null 2>&1

# ESLint solo sobre archivos que sabe analizar
case "$f" in
  *.js | *.jsx | *.mjs | *.cjs | *.ts | *.tsx) ;;
  *) exit 0 ;;
esac

if ! out=$(npx --no-install eslint --fix --no-warn-ignored "$f" 2>&1); then
  printf '%s' "$out" | jq -Rs --arg f "$f" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: ("ESLint sin resolver en \($f):\n" + .)
    }
  }'
fi

exit 0

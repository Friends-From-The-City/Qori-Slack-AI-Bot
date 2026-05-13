#!/usr/bin/env bash
set -euo pipefail

# Find the next lesson number (L-prefix)
DOCS_DIR="$(dirname "$0")/../docs/architecture-decisions"
LAST_NUM=$(ls "$DOCS_DIR" 2>/dev/null \
  | grep -E '^L[0-9]{3}' \
  | sort \
  | tail -n 1 \
  | grep -oE '[0-9]{3}' || echo "000")
NEXT_NUM="L$(printf "%03d" $((10#$LAST_NUM + 1)))"

# Get the title slug from arg or prompt
if [ -n "${1:-}" ]; then
  TITLE="$1"
else
  read -p "Lesson title (short, e.g. 'validate api responses'): " TITLE
fi

# Slugify the title for the filename
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr -s ' ' '-' | tr -cd 'a-z0-9-')
FILE="$DOCS_DIR/${NEXT_NUM}-${SLUG}.md"

if [ -e "$FILE" ]; then
  echo "Lesson file already exists: $FILE"
  exit 1
fi

# Write the template
cat > "$FILE" <<EOF
# ADR ${NEXT_NUM}: ${TITLE}

**Status:** Accepted
**Date:** $(date +%Y-%m-%d)
**Decision drivers:** [What went wrong — the specific incident or bug]

## Context

[What happened? What was the failure mode? How was it discovered?]

## Decision

[What rule or practice does this lesson establish?]

## Why this is a lesson, not just a fix

[The fix was X lines. The lesson is that this category of bug will recur unless...]

## Alternatives considered

[Other approaches to preventing this class of failure.]

## Consequences

[What this lesson means going forward.]

## When to revisit

[What conditions would make this lesson obsolete?]

## References

[Links to the bug, fix, related ADRs.]
EOF

echo "Created: $FILE"
echo ""
echo "Remember to:"
echo "1. Edit the file with the actual lesson content"
echo "2. Update docs/architecture-decisions/README.md to add the entry to the Lessons index"

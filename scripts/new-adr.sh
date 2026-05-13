#!/usr/bin/env bash
set -euo pipefail

# Find the next ADR number (excluding L-prefix lessons)
DOCS_DIR="$(dirname "$0")/../docs/architecture-decisions"
LAST_NUM=$(ls "$DOCS_DIR" 2>/dev/null \
  | grep -E '^[0-9]{4}' \
  | sort \
  | tail -n 1 \
  | grep -oE '^[0-9]{4}' || echo "0000")
NEXT_NUM=$(printf "%04d" $((10#$LAST_NUM + 1)))

# Get the title slug from arg or prompt
if [ -n "${1:-}" ]; then
  TITLE="$1"
else
  read -p "ADR title (short, e.g. 'use redis for caching'): " TITLE
fi

# Slugify the title for the filename
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr -s ' ' '-' | tr -cd 'a-z0-9-')
FILE="$DOCS_DIR/${NEXT_NUM}-${SLUG}.md"

if [ -e "$FILE" ]; then
  echo "ADR file already exists: $FILE"
  exit 1
fi

# Write the template
cat > "$FILE" <<EOF
# ADR ${NEXT_NUM}: ${TITLE}

**Status:** Proposed
**Date:** $(date +%Y-%m-%d)
**Decision drivers:** [What prompted this — a bug, a partner requirement, an audit finding]

## Context

[What's the situation that requires a decision? What constraints are in play?]

## Decision

[What did we choose? Single paragraph, plainly stated.]

## Alternatives considered

[For each alternative we genuinely considered, one paragraph: what it was, why it didn't win.]

## Consequences

[What this decision means going forward. Both intended (the wins) and potential downsides (what we accept by choosing this).]

## When to revisit

[What conditions would prompt us to reopen this decision?]

## References

[Links to relevant Slack threads, PRs, related ADRs, or code locations.]
EOF

echo "Created: $FILE"
echo ""
echo "Remember to:"
echo "1. Edit the file with the actual decision content"
echo "2. Update docs/architecture-decisions/README.md to add the entry to the index"
echo "3. Change Status from 'Proposed' to 'Accepted' once the decision is locked in"

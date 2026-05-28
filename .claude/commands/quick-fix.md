---
description: Quick automated fixes for common issues
allowed-tools: Bash, Edit, Read
---

# Quick Fix

Automatically fix common, safe issues in the codebase:

## What to Fix (Auto)
1. Run `bun lint:fix` to fix formatting and import organization
2. Remove unused imports (if Biome supports it)
3. Fix simple TypeScript issues that have auto-fixes

## What to Report (Manual)
1. TypeScript errors that need manual intervention
2. Test failures
3. Deprecated dependency usage
4. TODO comments that might be stale

## Execution
1. First, show what will be changed (dry-run preview)
2. Ask for confirmation before applying fixes
3. Run the fixes
4. Show a diff of what changed
5. Suggest running tests to verify nothing broke

## Safety
- Only fix formatting and safe auto-fixes
- Never change logic or remove code
- Never modify migrations or schemas
- Create a git stash before changes if there are uncommitted files

Report completion status and suggest next steps (e.g., "Run /pre-deploy to verify").

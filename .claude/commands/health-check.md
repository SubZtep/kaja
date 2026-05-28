---
description: Run comprehensive health check on the entire repository
allowed-tools: Bash, Grep, Glob, Read
---

# Repository Health Check

Perform a comprehensive health check of the Kaja codebase. Check the following areas systematically:

## 1. Code Quality
- Run `bun lint` and report any issues
- Run `bun typecheck` and count TypeScript errors
- Check for common anti-patterns (search for `any`, `@ts-ignore`, `console.log` in production code)

## 2. Dependencies
- Check for outdated dependencies with `bun outdated -r` (just report, don't update)
- Look for security vulnerabilities
- Verify workspace dependencies are properly linked

## 3. Tests
- Run `bun run test` and report pass/fail ratio
- Check test coverage if available
- Identify untested critical paths

## 4. Database
- Verify all migrations are valid SQL
- Check for missing indexes on foreign keys
- Look for potential N+1 query issues in services

## 5. Docker & Deployment
- Verify Dockerfile builds successfully (dry-run if possible)
- Check compose.yaml for issues
- Ensure environment variable examples are up-to-date

## 6. Security
- Search for hardcoded secrets or API keys
- Check for SQL injection vulnerabilities (string interpolation in queries)
- Verify input validation on all API routes
- Check for exposed debug endpoints in production code

## 7. Documentation
- Verify README, CLAUDE.md, and package.json descriptions are in sync
- Check for outdated documentation
- Ensure all TODOs are tracked

## Output Format
Present findings in a clear summary:
- ✅ Green checks for passing areas
- ⚠️  Warnings for minor issues
- ❌ Red X for critical issues

Include actionable recommendations at the end, prioritized by severity.

**Important:** Don't fix anything automatically. Just report findings and ask if I want to address specific issues.

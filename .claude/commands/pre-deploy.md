---
description: Pre-deployment checklist and validation
allowed-tools: Bash, Read
---

# Pre-Deployment Checklist

Prepare the codebase for deployment. Perform these checks in order:

## 1. Code Quality Gates
- Run `bun lint:fix` to auto-fix formatting issues
- Run `bun typecheck` and ensure 0 errors
- Verify all tests pass with `bun test`

## 2. Build Verification
- Test API build: `bun run --filter @kaja/api build`
- Test Web build: `bun run --filter @kaja/web build`
- Verify built artifacts exist in dist/ folders

## 3. Environment Check
- Compare `.env.example` files with actual deployment requirements
- List all required environment variables
- Check for missing variables in deployment platform

## 4. Database Migrations
- Verify migration files are in correct order
- Check for breaking changes in latest migration
- Confirm migrations are idempotent (can be run multiple times safely)

## 5. Security Review
- Search for any `console.log` with sensitive data
- Verify no secrets in code
- Check CORS configuration
- Ensure rate limiting is enabled

## 6. Dependencies
- Check for critical security vulnerabilities
- Verify lockfile is up to date
- Ensure no dev dependencies leaked into production

## 7. Git Status
- Show current branch and latest commit
- Check for uncommitted changes
- Verify main branch is up to date

## Output
Provide a GO/NO-GO recommendation with:
- ✅ All checks passed - safe to deploy
- ⚠️  Minor issues found - deploy with caution
- ❌ Critical issues - DO NOT deploy

List specific blockers if deployment is not recommended.

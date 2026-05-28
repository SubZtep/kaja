---
description: Debug production deployment issues
allowed-tools: Read, Grep, Glob, Bash, AskUserQuestion
---

# Debug Production Issue

Help diagnose production deployment or runtime issues. Follow this systematic approach:

## Information Gathering
Ask me for:
1. Error message or symptoms (what's failing?)
2. Recent changes (last commit that worked)
3. Environment (which deployment?)
4. Logs if available

## Investigation Steps

### 1. Build Issues
- Check Dockerfile for syntax errors
- Verify all COPY commands reference existing paths
- Check for missing dependencies in package.json
- Look for build-time environment variable issues

### 2. Runtime Issues
- Check entrypoint scripts for shell errors
- Verify environment variables are set correctly
- Look for missing files (e.g., database files, migrations)
- Check file permissions and ownership

### 3. Database Issues
- Verify migrations ran successfully
- Check connection string format
- Look for migration ordering issues
- Check for breaking schema changes

### 4. Network/API Issues
- Verify CORS configuration
- Check API endpoint accessibility
- Look for authentication/authorization problems
- Check rate limiting or timeout issues

### 5. Dependency Issues
- Check for version mismatches
- Look for missing peer dependencies
- Verify workspace linking works in production

## Output Format
Provide:
1. **Most Likely Cause** (based on symptoms)
2. **Quick Verification** (how to confirm the diagnosis)
3. **Fix Steps** (ordered by priority)
4. **Prevention** (how to avoid this in the future)

Be specific with commands and file paths. Ask clarifying questions if needed.

---
name: sonar-fix
description: Fix the open SonarCloud issues of the current branch's pull request in code. Only when the user runs /sonar-fix.
argument-hint: "[branch]"
disable-model-invocation: true
allowed-tools: Bash(git branch --show-current), Bash(bun scripts/sonar.ts *), Bash(bun lint:fix), Bash(bun typecheck), Read, Edit, Write, Grep, Glob
---

Fix the issues SonarCloud found on this branch's pull request, so its quality gate passes. The gate fails on any reliability or security issue, even a LOW one, and on unreviewed security hotspots.

1. Run `bun scripts/sonar.ts <branch>`, with the branch from $ARGUMENTS or else `git branch --show-current`. It prints nothing when the branch has no PR on SonarCloud; say so and stop. Each line is `- <path>:<line> <severity> [<rule>: <rule name>] <message>`. If there are no lines, the PR is clean; say so and stop.
2. For each issue, read the code around it and fix it in code; the user wants the gate green by code changes, never by marking issues in the SonarCloud UI. Keep each fix surgical: change only what the rule asks, keep the behaviour, and follow the surrounding style and the repo's AGENTS.md. The line numbers are from Sonar's last analysis, so the code may have moved a little; find the matching spot. An issue whose code is already gone or already fixed needs nothing.
3. Leave an issue unfixed, and say why, when the fix would change behaviour, needs a design decision, or you think it's a false positive. Known cases:
   - `css:S8776` on `&` inside a Tailwind `@utility` block is a false positive in Sonar's CSS parser; rewrite it with `@variant hover|after|<custom>` (Sonar knows `variant`/`custom-variant`).
   - Randomness for non-security uses such as animation timing: `Math.random` trips S2245 and `crypto.getRandomValues(...) % n` trips CodeQL's biased-random alert, so use a fixed list or no randomness.
   - Dockerfiles (`docker:S6505`): `npm install --ignore-scripts`, never `npx -y`; install a CLI pinned with `--prefix /tmp/x --ignore-scripts` and run its `.bin`.
   - Regexes that strip trailing characters, like `/\/+$/`, trip a ReDoS alert: use `trimTrailingSlashes` from `@kaja/shared` or a loop.
   - In test files, fix only rules that make sense for tests.
4. Run `bun lint:fix` and, if you touched TypeScript, `bun typecheck`; fix what they report in the lines you changed.
5. Don't commit; the user reviews and commits. Finish with one line per issue: fixed, already gone, or left (and why).

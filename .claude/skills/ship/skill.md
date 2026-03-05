---
name: ship
description: Evaluate changes, branch, commit, create issue + PR, get user review, merge, and clean up.
allowed-tools: Bash(git*), Bash(gh*)
---

Ship current work: evaluate changes, create a branch if needed, commit, open issue + PR, get user approval, merge, and clean up.

## Steps

### 1. Evaluate current state

- Run `git status` and `git diff` to check for uncommitted changes.
- Run `git branch --show-current` to see what branch you're on.
- Run `git log main..HEAD --oneline` (if on a feature branch) to see commits ahead of main.

- Also check for local feature branches ahead of main: `git branch --no-merged main`.

**Four possible states:**

| State | Action |
|-------|--------|
| On `main` with uncommitted changes | → Go to step 2 (branch + commit) |
| On `main`, clean, but feature branches exist ahead of main | → List them, ask user which to ship, checkout that branch, then skip to step 4 |
| On `main` with no changes and no feature branches | → Abort: "Nothing to ship." |
| On a feature branch (with or without uncommitted changes) | → Go to step 3 (commit if needed, then skip to step 4) |

### 2. Branch and commit (only when on `main` with uncommitted changes)

- Review the diff and conversation context to understand what the changes are about.
- Create a descriptive branch name: `feat/...`, `fix/...`, `refactor/...`, `docs/...`.
- `git checkout -b <branch-name>`
- Stage relevant files by name (not `git add -A`).
- Write a clear commit message summarizing the changes. End with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`.
- If changes span multiple logical units, use multiple commits.

### 3. Commit uncommitted changes (when on a feature branch with dirty working tree)

- Stage and commit any remaining uncommitted changes with a clear message.

### 4. Create GitHub issue

- Create an issue with `gh issue create` describing the changes.
- Title: short imperative description (e.g. "Clean up config panel UI").
- Body: bullet-point summary of all changes (from diff against main).

### 5. Push branch and create PR

- Push the branch: `git push -u origin <branch>`.
- Create a PR with `gh pr create` linking to the issue (`Closes #N`).
- Title: matches the issue title.
- Body: summary + `Closes #N` + test plan.

### 6. Prompt user for review

- Open the PR in the browser: `start <PR_URL>` (Windows) or `open <PR_URL>` (macOS).
- Show the PR URL.
- Show the diff summary.
- **Ask the user**: "PR is ready for review. Merge it?" — wait for explicit approval before proceeding.

### 7. Merge (only after user says yes)

- Merge via `gh pr merge <number> --squash --delete-branch`.
- Switch back to `main` and pull: `git checkout main && git pull`.

### 8. Clean up stale branches

- Delete any local branches fully merged into main: `git branch -d <branch>`.
- Prune stale remote references: `git remote prune origin`.
- Report what was cleaned up.

## Rules

- **Never merge without explicit user approval.** Step 6 must pause and wait.
- **Squash merge** to keep main history clean.
- **Stage files by name**, not `git add -A` — avoid accidentally committing secrets or build artifacts.
- If any step fails, stop and report the error — don't retry blindly.

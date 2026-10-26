---
name: coding-lane
description: "Tom's one-task-at-a-time build lane: lock, worktree, headless coding agent, tests, PR, and #dev status."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [dev, coding, worktree, tests, pull-request, tom]
    related_skills: [plan-before-code, post-as]
---

# Coding Lane

Use this only after the `plan-before-code` skill has posted the plan. The plan and originating task are the working contract.

## Hard rules

- One task at a time.
- Never push to `main` or `master`.
- Never merge.
- Never force-push.
- Work on branch `tom/<taskid>`.
- Stop at 45 minutes wall-clock time and report status.
- Do not loop unattended on paid APIs. Two coding-agent attempts is the ceiling.

## Coding switch (ChatGPT brain)

On the ChatGPT brain, you change code and run commands without asking the owner only inside folders listed under `jarvis_coding_repos` in your `config.yaml`. Anywhere else each command waits for APPROVE in the JARVIS app, and scheduled runs never get the switch. On the Claude brain or an API key the switch does not apply; skip this section.

1. Read `config.yaml` in your home and find the `jarvis_coding_repos` line. If the repo path from `knowledge/tom/repos.md` is inside one of the listed folders, continue to the lock.
2. If it is not, stop here, before the lock, and tell the owner this, with the real repo path filled in. Never edit `config.yaml` yourself.

> To let me work in this repository without asking you about every command, add this line to config.yaml (macOS: ~/.hermes/profiles/jarvis/config.yaml, Windows: %LOCALAPPDATA%\hermes\profiles\jarvis\config.yaml), then quit and reopen JARVIS:
> `jarvis_coding_repos: ['<repo path>']`
> Keep the single quotes. If the line is already there, add the path inside the brackets, separated by a comma. Inside a listed folder my commands run with your account's access, not in a sandbox, so list only repositories you want me to change.

## Lock

1. Derive a short task id from the thread, ticket, or owner wording: lowercase letters, numbers, and hyphens only.
2. Ensure `workspace/` and `workspace/reports/` exist, then check `workspace/tom.lock`.
3. If an active lock exists and its timestamp is younger than 2 hours, queue the task in `workspace/reports/tom-YYYY-MM-DD.md`, post in `#dev` as Tom that it is queued behind `<taskid>`, and stop.
4. If the lock is older than 2 hours, note the stale lock in the daily report, replace it, and continue.
5. Create `workspace/tom.lock` containing:

```yaml
task_id: <taskid>
started_at: <ISO-8601 timestamp>
source: <thread, ticket, or brief label>
```

## Build lane

1. Read the target row in `knowledge/tom/repos.md`.
2. Work in the repo path from that row. Run every command with that folder, or the worktree below, as its working directory rather than changing directory from your home: the coding switch looks at where a command runs.
3. Create the worktree inside the repo, so it stays inside the listed folder, and keep it out of the owner's `git status` by making sure `.git/info/exclude` contains the line `.tom/`:

```bash
git worktree add .tom/<taskid> -b tom/<taskid> <main-branch>
```

4. Run the headless coding agent inside the worktree `.tom/<taskid>`. Prefer Claude:

```bash
claude -p "<the posted plan + originating task, verbatim>" --permission-mode acceptEdits
```

If `claude` is unavailable, use Codex:

```bash
codex exec --skip-git-repo-check -s workspace-write "<the posted plan + originating task, verbatim>"
```

5. Run the repo's test command from `knowledge/tom/repos.md`.
6. If tests fail, make one more coding-agent attempt using the same plan plus the failing output. Run the tests again.

## Green path

When tests pass:

1. Check the diff for unrelated changes.
2. Push only `tom/<taskid>`.
3. Create a PR with `gh pr create`. Title and body must be plain English:
   - Symptom: what the user saw.
   - Cause: what was wrong.
   - Fix: what changed.
   - Proof: exact test command and result.
4. Post the PR link and a 3-sentence summary in `#dev` as Tom via `post-as`.
5. Write the PR link, test proof, and summary to `workspace/reports/tom-YYYY-MM-DD.md`.
6. Remove the worktree with `git worktree remove .tom/<taskid>` from the repo folder; the pushed branch stays. Release the lock by removing only `workspace/tom.lock`. Remove no branches, logs, or generated artifacts.

## Red path

If tests are still red after 2 attempts, or the 45-minute ceiling arrives:

1. Stop changing code.
2. Post an honest status in `#dev` as Tom: what was tried, the failing command, the shortest useful failing output, the next recommended step, and that the worktree is at `.tom/<taskid>` in the repo.
3. Write the same status to `workspace/reports/tom-YYYY-MM-DD.md`.
4. Release the lock by removing only `workspace/tom.lock`. Leave the worktree intact for inspection.

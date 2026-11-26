# zentao-mcp

ZenTao CLI for products + bugs.

## Installation

Global install (recommended):

```bash
pnpm i -g @sanmu2018/zentao-mcp
```

If you don't have pnpm:

```bash
npm i -g pnpm
pnpm i -g @sanmu2018/zentao-mcp
```

Or use without installing:

```bash
npx -y @sanmu2018/zentao-mcp --help
```

This installs the `zentao` command (and keeps `zentao-mcp` as a compatibility alias).

## Configuration

### Required Parameters

You can configure the CLI using CLI arguments or environment variables:

CLI arguments:

- `--zentao-url` (e.g. `https://zentao.example.com/zentao`)
- `--zentao-account`
- `--zentao-password`
- `--insecure` (skip HTTPS certificate verification)

Environment variables:

- `ZENTAO_URL`
- `ZENTAO_ACCOUNT`
- `ZENTAO_PASSWORD`
- `ZENTAO_INSECURE=true`

Tip: `ZENTAO_URL` should include the ZenTao base path (often `/zentao`).

Example:

- `https://zentao.example.com/zentao` (common)

If you see `404 Not Found` when logging in, your base path is likely missing `/zentao`.

## Commands

Most commands support `--json` for raw output.

### Products

List all products:

```bash
zentao products list
```

### Executions (Sprints)

List executions:

```bash
zentao executions list [--project <id>] [--status all|undone|done|closed]
```

### Stories

List stories for an execution:

```bash
zentao stories list --execution <id>
```

### Tasks

List tasks for an execution:

```bash
zentao tasks list --execution <id>
```

Create a task:

```bash
zentao tasks create --execution <id> --name "Task name" [--assignedTo account] [--estimate 2] [--desc "Details"] [--estStarted YYYY-MM-DD] [--deadline YYYY-MM-DD]
```

Update a task:

```bash
zentao tasks update --id <id> [--name "New task name"] [--assignedTo account] [--status doing] [--estimate 3] [--left 1] [--deadline YYYY-MM-DD]
```

Get task details:

```bash
zentao tasks get --id <id>
```

List my tasks:

```bash
zentao tasks mine [--status <status>] [--account <account>] [--include-details]
```

Manage tasks:

```bash
# Start a task
zentao tasks start --id <id> [--consumed <hours>] [--left <hours>] [--comment <text>]

# Finish a task
zentao tasks finish --id <id> [--currentConsumed <hours>] [--comment <text>]
```

### Bugs

List bugs for a product:

```bash
zentao bugs list --product <id>
```

Get bug details:

```bash
zentao bug get --id <id>
```

Download inline screenshots / attachments referenced in steps or history (`fileID=...`):

```bash
zentao bug get --id <id> --with-images
zentao bug get --id <id> --with-images --out-dir /tmp/bug-<id>
zentao bug file --id <fileId> --out ./shot.png
```

Images are fetched via REST `GET /api.php/v1/files/:id` (Token auth). Default cache: `~/.cache/zentao/files`.

Add a history comment (session API; REST PUT comment is ignored on ZenTao 22.x):

```bash
zentao bug comment --id <id> --comment "Fix notes"
```

Resolve / close / activate / confirm / assign:

```bash
zentao bug resolve --id <id> [--resolution fixed] [--resolvedBuild trunk] [--assignedTo account] [--comment text]
zentao bug close --id <id> [--comment text]
zentao bug activate --id <id> [--assignedTo account] [--comment text]
zentao bug confirm --id <id> [--assignedTo account] [--comment text]
zentao bug assign --id <id> --assignedTo <account> [--comment text]
```

Append HTML into the bug steps/repro field (visible in 重现步骤):

```bash
zentao bug append-steps --id <id> --html "<p>extra note</p>" [--marker unique-token]
```

List my bugs:

```bash
# Basic summary
zentao bugs mine

# Detailed list with status filtering
zentao bugs mine --status active --include-details
```

Supported flags for `bugs mine`:
- `--scope`: `assigned`, `opened`, `resolved`, `all`
- `--status`: `active`, `resolved`, `closed`, `all`
- `--include-details`: Show full bug list table

### System & Auth

Check current user:

```bash
zentao whoami
```

Self-test connection:

```bash
zentao self-test
```

## Login

Save credentials locally (stored as plaintext TOML under your user config directory):

```bash
zentao login --zentao-url=https://zentao.example.com/zentao --zentao-account=leo --zentao-password=***
```

If your ZenTao instance uses a self-signed or privately issued HTTPS certificate:

```bash
zentao login --zentao-url=https://zentao.example.com/zentao --zentao-account=leo --zentao-password=*** --insecure
```

Config file:

- `~/.config/zentao/config.toml` (or `$XDG_CONFIG_HOME/zentao/config.toml`)

Then commands can omit auth flags:

```bash
zentao whoami
zentao products list
```

Troubleshooting login:

- If you see `Missing credentials. Provide flags/env, or run interactively.`, the request has not been sent yet.
  - It means one of `ZENTAO_URL / ZENTAO_ACCOUNT / ZENTAO_PASSWORD` is empty, most commonly an empty password input.
- If you run in a wrapped terminal or piped stdin and interactive login is unstable, use flags/env instead of prompts:
  - `zentao login --zentao-url=... --zentao-account=... --zentao-password=...`
- If `Token response parse failed: <html>...404 Not Found...`, try:
  - `https://your-host/zentao` instead of `https://your-host/`
- If you see HTTPS certificate errors, try:
  - `zentao login ... --insecure`
  - or set `ZENTAO_INSECURE=true`
- If `curl` works but `zentao` reports `EAI_AGAIN` or `fetch failed`, your shell likely has proxy env vars but Node did not use them.
  - Newer Node versions will be auto-relaunched with `--use-env-proxy`.
  - Manual fallback: `NODE_USE_ENV_PROXY=1 zentao login ...`

## Release (maintainers)

### GitHub Actions (recommended)

This repo supports npm Trusted Publisher (OIDC) via GitHub Actions.

1. Create a tag matching `package.json` version:

```bash
git tag v0.5.1
git push origin v0.5.1
```

2. The workflow `.github/workflows/publish-npm.yml` will run tests and publish to npm.

In npm Trusted Publisher settings, set the workflow filename to `publish-npm.yml`.

### Local release (fallback)

Requires `git`, `npm`, and `gh`.

```bash
zentao release patch --dry-run
```

If you are using GitHub Actions publishing, prefer tagging + pushing, or run local release with:

```bash
zentao release patch --skip-publish
```

## Local Development

```bash
pnpm install
pnpm test
```

## Security

Do not commit credentials. Prefer environment variables in local runs.

## Skill

For OpenClaw (AgentSkills-compatible), see `skills/zentao/SKILL.md`.

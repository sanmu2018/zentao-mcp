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

Environment variables:

- `ZENTAO_URL`
- `ZENTAO_ACCOUNT`
- `ZENTAO_PASSWORD`

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

Config file:

- `~/.config/zentao/config.toml` (or `$XDG_CONFIG_HOME/zentao/config.toml`)

Then commands can omit auth flags:

```bash
zentao whoami
zentao products list
```

Troubleshooting login:

- If `Token response parse failed: <html>...404 Not Found...`, try:
  - `https://your-host/zentao` instead of `https://your-host/`

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

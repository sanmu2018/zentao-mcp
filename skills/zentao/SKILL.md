---
name: zentao
description: Use the zentao CLI to login and query ZenTao products and bugs. ZENTAO_URL usually includes /zentao.
homepage: https://www.npmjs.com/package/@sanmu2018/zentao-mcp
metadata: {"openclaw":{"emoji":"🐞","install":[{"id":"node","kind":"node","package":"@sanmu2018/zentao-mcp","bins":["zentao"],"label":"Install zentao CLI (node)"}]}}
---

# zentao (ZenTao CLI)

## When to use this skill

Use this skill when the user asks to:

- login to ZenTao via the CLI
- list products
- list bugs for a product
- view bug details
- list the user's own bugs

## Installation (recommended)

To install globally with pnpm:

```bash
pnpm i -g @sanmu2018/zentao-mcp
```

If pnpm is not installed:

```bash
npm i -g pnpm
pnpm i -g @sanmu2018/zentao-mcp
```

## Login workflow

1) Run login once:

```bash
zentao login \
  --zentao-url="https://zentao.example.com/zentao" \
  --zentao-account="leo" \
  --zentao-password="***"
```

2) This writes credentials to:

- `~/.config/zentao/config.toml` (or `$XDG_CONFIG_HOME/zentao/config.toml`)

3) Verify:

```bash
zentao whoami
```

IMPORTANT: `--zentao-url` usually must include `/zentao`.
If login returns HTML 404, the base path is likely missing `/zentao`.

## Commands

List executions/sprints:

```bash
zentao executions list [--project 1] [--status all|undone|done|closed]
```

List stories for an execution:

```bash
zentao stories list --execution 10
```

List tasks for an execution:

```bash
zentao tasks list --execution 10
```

Create a task:

```bash
zentao tasks create --execution <id> --name "Task name" [--assignedTo account] [--estimate 2] [--desc "Details"] [--estStarted YYYY-MM-DD] [--deadline YYYY-MM-DD]
```

List my tasks:

```bash
zentao tasks mine [--account leo] [--status wait,doing] [--include-details]
```

Get a specific task:

```bash
zentao tasks get --id 123
```

Start a task:

```bash
zentao tasks start --id 123 [--consumed 2] [--left 5] [--comment "Started work"]
```

Finish a task:

```bash
zentao tasks finish --id 123 [--currentConsumed 2] [--comment "Finished implementation"]
```

List products (simple by default):

```bash
zentao products list
```

List bugs for a product:

```bash
zentao bugs list --product 6
```

Get bug details:

```bash
zentao bug get --id 1329
```

List my bugs (include details):

```bash
zentao bugs mine --status active --include-details
```

Full JSON output:

- `zentao products list --json`
- `zentao bugs list --product 6 --json`
- `zentao bug get --id 1329 --json`
- `zentao bugs mine --include-details --json`

---
name: zentao
description: Use the zentao CLI to login, query ZenTao products/bugs, download bug screenshots, and resolve/close/comment bugs. ZENTAO_URL usually includes /zentao.
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
- comment / resolve / close / activate / confirm / assign bugs
- download screenshots embedded in bug steps/comments (`--with-images`)
- append notes into bug steps when history comment is unavailable

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

If the server uses a self-signed HTTPS certificate:

```bash
zentao login \
  --zentao-url="https://zentao.example.com/zentao" \
  --zentao-account="leo" \
  --zentao-password="***" \
  --insecure
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

Update a task:

```bash
zentao tasks update --id 123 [--name "New task name"] [--assignedTo leo] [--status doing] [--estimate 3] [--left 1] [--deadline 2026-03-20]
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

When the bug has screenshots in 重现步骤 / comments, download them (needed to actually view images; plain `bug get` only returns HTML with relative `fileID` links):

```bash
zentao bug get --id 1329 --with-images
zentao bug get --id 1329 --with-images --out-dir /tmp/bug-1329
zentao bug file --id 1087 --out /tmp/shot.png
```

Then open the local `images[].path` files. Default cache is `~/.cache/zentao/files`.

Add a history comment (preferred; uses session API because REST PUT comment is dropped on ZenTao 22.x):

```bash
zentao bug comment --id 1329 --comment "Verified on integration"
```

Resolve / close / activate / confirm / assign:

```bash
zentao bug resolve --id 1329 --resolution fixed --resolvedBuild trunk --comment "Fixed in gateway"
zentao bug close --id 1329 --comment "Verified"
zentao bug activate --id 1329 --comment "Reopened"
zentao bug confirm --id 1329 --assignedTo leo
zentao bug assign --id 1329 --assignedTo leo --comment "Please verify"
```

If you only need content in 重现步骤 (not history), append HTML steps:

```bash
zentao bug append-steps --id 1329 --html "<p>Agent note</p>" --marker "agent-note-1329"
```

List my bugs (include details):

```bash
zentao bugs mine --status active --include-details
```

Full JSON output:

- `zentao products list --json`
- `zentao bugs list --product 6 --json`
- `zentao bug get --id 1329 --json`
- `zentao bug comment --id 1329 --comment "..." --json`
- `zentao bugs mine --include-details --json`

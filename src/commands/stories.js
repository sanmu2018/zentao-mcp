import process from "node:process";
import { extractCommand, hasHelpFlag, parseCliArgs } from "../cli/args.js";
import { createClientFromCli } from "../zentao/client.js";

function printHelp() {
    process.stdout.write(`zentao stories list\n\n`);
    process.stdout.write(`Usage:\n`);
    process.stdout.write(`  zentao stories list --execution <id> [--page N] [--limit N] [--json]\n`);
    process.stdout.write(`\n`);
    process.stdout.write(`Options:\n`);
    process.stdout.write(`  --execution          execution/sprint id (required)\n`);
    process.stdout.write(`  --json               print full JSON payload\n`);
}

export function formatStoriesSimple(stories) {
    const getAccount = (acc) => typeof acc === 'object' && acc !== null ? (acc.realname || acc.account || '') : acc;
    const rows = [];
    rows.push(["id", "title", "pri", "status", "assignedTo"].join("\t"));
    for (const story of stories) {
        rows.push(
            [
                String(story.id ?? ""),
                String(story.title ?? ""),
                String(story.pri ?? ""),
                String(story.status ?? ""),
                String(getAccount(story.assignedTo) ?? ""),
            ].join("\t")
        );
    }
    return `${rows.join("\n")}\n`;
}

export async function runStories({ argv = [], env = process.env } = {}) {
    if (hasHelpFlag(argv)) {
        printHelp();
        return;
    }

    const { command: sub, argv: argvWithoutSub } = extractCommand(argv);
    if (sub !== "list") throw new Error(`Unknown stories subcommand: ${sub || "(missing)"}`);

    const cliArgs = parseCliArgs(argvWithoutSub);
    if (!cliArgs.execution) {
        throw new Error(`--execution is required. Usage: zentao stories list --execution <id>`);
    }

    const api = createClientFromCli({ argv: argvWithoutSub, env });
    const result = await api.listStories({
        execution: cliArgs.execution,
        page: cliArgs.page,
        limit: cliArgs.limit,
    });

    if (cliArgs.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }

    const stories = result?.result?.stories;
    if (!Array.isArray(stories)) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatStoriesSimple(stories));
}

import process from "node:process";
import { extractCommand, hasHelpFlag, parseCliArgs } from "../cli/args.js";
import { createClientFromCli } from "../zentao/client.js";

function printHelp() {
    process.stdout.write(`zentao tasks <subcommand>\n\n`);
    process.stdout.write(`Usage:\n`);
    process.stdout.write(`  zentao tasks list --execution <id> [--page N] [--limit N] [--json]\n`);
    process.stdout.write(`  zentao tasks mine [--status ...] [--account ...] [--include-details] [--json]\n`);
    process.stdout.write(`  zentao tasks get --id <id> [--json]\n`);
    process.stdout.write(`  zentao tasks create --execution <id> --name <name> [--type devel|test|...] [--assignedTo account] [--story id] [--estimate N] [--desc text] [--pri N] [--estStarted YYYY-MM-DD] [--deadline YYYY-MM-DD] [--json]\n`);
    process.stdout.write(`  zentao tasks start --id <id> [--consumed N] [--left N] [--comment text] [--json]\n`);
    process.stdout.write(`  zentao tasks finish --id <id> [--currentConsumed N] [--comment text] [--json]\n`);
    process.stdout.write(`\n`);
    process.stdout.write(`Options:\n`);
    process.stdout.write(`  --execution          execution/sprint id (required for list/create)\n`);
    process.stdout.write(`  --name               task name (required for create)\n`);
    process.stdout.write(`  --type               task type: devel, test, design, etc. (default: devel)\n`);
    process.stdout.write(`  --assignedTo         account to assign the task to\n`);
    process.stdout.write(`  --story              story id to link\n`);
    process.stdout.write(`  --estimate           estimated hours\n`);
    process.stdout.write(`  --desc               task description\n`);
    process.stdout.write(`  --pri                priority (1-4, default: 3)\n`);
    process.stdout.write(`  --estStarted         estimated start date (YYYY-MM-DD)\n`);
    process.stdout.write(`  --deadline           deadline (YYYY-MM-DD)\n`);
    process.stdout.write(`  --id                 task id (required for get/start/finish)\n`);
    process.stdout.write(`  --status             filter by status (e.g. wait, doing, done)\n`);
    process.stdout.write(`  --account            filter by assignedTo account (default: current login user)\n`);
    process.stdout.write(`  --include-details    include task details in output (for mine)\n`);
    process.stdout.write(`  --consumed           consumed hours so far (for start)\n`);
    process.stdout.write(`  --left               estimated hours left (for start)\n`);
    process.stdout.write(`  --currentConsumed    hours consumed since last log (for finish)\n`);
    process.stdout.write(`  --comment            comment about the action\n`);
    process.stdout.write(`  --json               print full JSON payload\n`);
}

export function formatTasksSimple(tasks) {
    const getAccount = (acc) => typeof acc === 'object' && acc !== null ? (acc.realname || acc.account || '') : acc;
    const rows = [];
    rows.push(["id", "name", "pri", "status", "assignedTo", "execution"].join("\t"));
    for (const task of tasks) {
        rows.push(
            [
                String(task.id ?? ""),
                String(task.name ?? ""),
                String(task.pri ?? ""),
                String(task.status ?? ""),
                String(getAccount(task.assignedTo) ?? ""),
                String(task.execution ?? ""),
            ].join("\t")
        );
    }
    return `${rows.join("\n")}\n`;
}

export async function runTasks({ argv = [], env = process.env } = {}) {
    if (hasHelpFlag(argv) && argv.length === 1) {
        printHelp();
        return;
    }

    const { command: sub, argv: argvWithoutSub } = extractCommand(argv);

    if (!sub || hasHelpFlag(argvWithoutSub)) {
        printHelp();
        return;
    }

    const cliArgs = parseCliArgs(argvWithoutSub);
    const api = createClientFromCli({ argv: argvWithoutSub, env });

    if (sub === "list") {
        if (!cliArgs.execution) {
            throw new Error(`--execution is required. Usage: zentao tasks list --execution <id>`);
        }

        const result = await api.listTasks({
            execution: cliArgs.execution,
            page: cliArgs.page,
            limit: cliArgs.limit,
        });

        if (cliArgs.json) {
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            return;
        }

        const tasks = result?.result?.tasks;
        if (!Array.isArray(tasks)) {
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            return;
        }

        process.stdout.write(formatTasksSimple(tasks));
        return;
    }

    if (sub === "create") {
        if (!cliArgs.execution) {
            throw new Error(`--execution is required. Usage: zentao tasks create --execution <id> --name <name>`);
        }
        if (!cliArgs.name) {
            throw new Error(`--name is required. Usage: zentao tasks create --execution <id> --name <name>`);
        }

        const result = await api.createTask({
            execution: cliArgs.execution,
            name: cliArgs.name,
            type: cliArgs.type,
            assignedTo: cliArgs.assignedTo,
            story: cliArgs.story,
            estimate: cliArgs.estimate,
            desc: cliArgs.desc,
            pri: cliArgs.pri,
            estStarted: cliArgs.estStarted,
            deadline: cliArgs.deadline,
        });

        if (cliArgs.json) {
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            return;
        }

        if (result.status === 1) {
            process.stdout.write(`Task created successfully. ID: ${result.result?.id || "(unknown)"}\n`);
        } else {
            process.stdout.write(`Failed to create task: ${result.msg}\n`);
        }
        return;
    }

    if (sub === "mine") {
        const result = await api.tasksMine({
            account: cliArgs.account,
            status: cliArgs.status,
            includeDetails: cliArgs["include-details"],
        });

        if (cliArgs.json) {
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            return;
        }

        const tasks = result?.result?.tasks;
        if (!Array.isArray(tasks)) {
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            return;
        }

        if (tasks.length === 0) {
            process.stdout.write(`No tasks found.\n`);
            return;
        }

        if (cliArgs["include-details"]) {
            process.stdout.write(formatTasksSimple(tasks));
        } else {
            process.stdout.write(`Found ${result.result.total} tasks.\n`);
        }
        return;
    }

    if (sub === "start") {
        if (!cliArgs.id) {
            throw new Error(`--id is required. Usage: zentao tasks start --id <id>`);
        }

        const result = await api.startTask({
            id: cliArgs.id,
            consumed: cliArgs.consumed,
            left: cliArgs.left,
            comment: cliArgs.comment,
        });

        if (cliArgs.json) {
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            return;
        }

        if (result.status === 1) {
            process.stdout.write(`Task ${cliArgs.id} started successfully.\n`);
        } else {
            process.stdout.write(`Failed to start task ${cliArgs.id}: ${result.msg}\n`);
        }
        return;
    }

    if (sub === "get") {
        if (!cliArgs.id) {
            throw new Error(`--id is required. Usage: zentao tasks get --id <id>`);
        }

        const result = await api.getTask({
            id: cliArgs.id,
        });

        if (cliArgs.json) {
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            return;
        }

        if (result.status === 1 && result.result) {
            const task = result.result;
            process.stdout.write(`Task ID: ${task.id}\n`);
            process.stdout.write(`Name: ${task.name}\n`);
            process.stdout.write(`Status: ${task.status}\n`);
            process.stdout.write(`Assigned To: ${typeof task.assignedTo === 'object' && task.assignedTo !== null ? (task.assignedTo.realname || task.assignedTo.account) : task.assignedTo}\n`);
            process.stdout.write(`Pri: ${task.pri}\n`);
            process.stdout.write(`Estimate: ${task.estimate}\n`);
            process.stdout.write(`Consumed: ${task.consumed}\n`);
            process.stdout.write(`Left: ${task.left}\n`);

            // Remove HTML tags for cleaner CLI output
            const cleanDesc = (task.desc || '').replace(/<[^>]*>?/gm, '');
            process.stdout.write(`Description:\n${cleanDesc || '(None)'}\n`);
        } else {
            process.stdout.write(`Failed to get task ${cliArgs.id}: ${result.msg}\n`);
        }
        return;
    }

    if (sub === "finish") {
        if (!cliArgs.id) {
            throw new Error(`--id is required. Usage: zentao tasks finish --id <id>`);
        }

        const result = await api.finishTask({
            id: cliArgs.id,
            currentConsumed: cliArgs.currentConsumed || 0,
            comment: cliArgs.comment,
        });

        if (cliArgs.json) {
            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
            return;
        }

        if (result.status === 1) {
            process.stdout.write(`Task ${cliArgs.id} finished successfully.\n`);
        } else {
            process.stdout.write(`Failed to finish task ${cliArgs.id}: ${result.msg}\n`);
        }
        return;
    }

    throw new Error(`Unknown tasks subcommand: ${sub}`);
}

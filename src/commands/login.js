import process from "node:process";
import readline from "node:readline";
import { hasHelpFlag, parseCliArgs, getOption } from "../cli/args.js";
import { saveConfig } from "../config/store.js";
import { ZentaoClient } from "../zentao/client.js";

function printHelp() {
  process.stdout.write(`zentao login - save credentials locally\n\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  zentao login --zentao-url=... --zentao-account=... --zentao-password=... [--insecure] [--yes]\n`);
  process.stdout.write(`\n`);
  process.stdout.write(`Notes:\n`);
  process.stdout.write(`  Credentials are stored as plaintext TOML in your user config directory.\n`);
  process.stdout.write(`  --insecure skips TLS certificate verification for self-signed HTTPS.\n`);
}

function createPrompter({ input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, output });

  try {
    return {
      ask(question) {
        return new Promise((resolve) => rl.question(question, resolve));
      },
      close() {
        rl.close();
      },
    };
  } catch (error) {
    rl.close();
    throw error;
  }
}

export async function runLogin({
  argv = [],
  env = process.env,
  input = process.stdin,
  output = process.stdout,
} = {}) {
  if (hasHelpFlag(argv)) {
    printHelp();
    return;
  }

  const cliArgs = parseCliArgs(argv);
  const yes = Boolean(cliArgs.yes);
  let baseUrl = getOption(cliArgs, env, "ZENTAO_URL", "zentao-url");
  let account = getOption(cliArgs, env, "ZENTAO_ACCOUNT", "zentao-account");
  let password = getOption(cliArgs, env, "ZENTAO_PASSWORD", "zentao-password");
  const insecure = ZentaoClient.resolveInsecureOption({ cliArgs, env });

  const needsInteractivePrompt = !yes && (!baseUrl || !account || !password);
  if (needsInteractivePrompt && input.isTTY !== true) {
    throw new Error("Interactive login requires a TTY. Provide flags/env when stdin is piped.");
  }

  if (needsInteractivePrompt) {
    const prompter = createPrompter({ input, output });
    try {
      if (!baseUrl) baseUrl = String(await prompter.ask("ZENTAO_URL: ")).trim();
      if (!account) account = String(await prompter.ask("ZENTAO_ACCOUNT: ")).trim();
      if (!password) password = String(await prompter.ask("ZENTAO_PASSWORD (echoed): ")).trim();
    } finally {
      prompter.close();
    }
  }

  if (!baseUrl || !account || !password) {
    throw new Error("Missing credentials. Provide flags/env, or run interactively.");
  }

  // Verify credentials by requesting a token.
  const client = new ZentaoClient({ baseUrl, account, password, insecure });
  await client.ensureToken();

  const filePath = saveConfig(
    {
      zentaoUrl: baseUrl,
      zentaoAccount: account,
      zentaoPassword: password,
      insecure,
    },
    { env }
  );

  process.stdout.write(`Logged in as ${account}\n`);
  process.stdout.write(`Saved to ${filePath}\n`);
  if (insecure) {
    process.stdout.write(`TLS certificate verification: skipped\n`);
  }
}

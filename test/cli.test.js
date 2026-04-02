import assert from "node:assert/strict";
import process from "node:process";
import { PassThrough } from "node:stream";
import test from "node:test";

import { extractCommand, parseCliArgs } from "../src/cli/args.js";
import { shouldRelaunchWithEnvProxy } from "../src/cli/env-proxy.js";
import { createClientFromCli, ZentaoClient } from "../src/zentao/client.js";
import { getConfigPath, loadConfig, saveConfig } from "../src/config/store.js";
import { formatProductsSimple } from "../src/commands/products.js";
import { formatBugsMineSimple, formatBugsSimple } from "../src/commands/bugs.js";
import { formatBugSimple } from "../src/commands/bug.js";
import { runLogin } from "../src/commands/login.js";

test("extractCommand skips flag values", () => {
  const argv = [
    "--zentao-url",
    "https://example.com/zentao",
    "products",
    "list",
    "--page",
    "2",
  ];

  const first = extractCommand(argv);
  assert.equal(first.command, "products");
  assert.equal(first.argv.includes("products"), false);
  assert.equal(first.argv.includes("https://example.com/zentao"), true);

  const second = extractCommand(first.argv);
  assert.equal(second.command, "list");
  assert.equal(second.argv.includes("list"), false);
  assert.equal(second.argv.includes("2"), true);
});

test("parseCliArgs supports --flag value and --flag=value", () => {
  const args = parseCliArgs([
    "--zentao-url",
    "https://example.com/zentao",
    "--page=2",
    "--include-details",
  ]);

  assert.equal(args["zentao-url"], "https://example.com/zentao");
  assert.equal(args.page, "2");
  assert.equal(args["include-details"], true);
});

test("createClientFromCli throws on missing auth", () => {
  const env = { XDG_CONFIG_HOME: `/tmp/zentao-cli-test-empty-${process.pid}` };
  assert.throws(
    () => createClientFromCli({ argv: [], env }),
    /Missing ZENTAO_URL/
  );
});

test("runLogin requires TTY for interactive prompts", async () => {
  const input = new PassThrough();
  input.isTTY = false;
  const output = new PassThrough();

  await assert.rejects(
    () => runLogin({ argv: [], env: {}, input, output }),
    /Interactive login requires a TTY/
  );
});

test("shouldRelaunchWithEnvProxy only when proxy env is present and not already enabled", () => {
  assert.equal(shouldRelaunchWithEnvProxy({}), false);
  assert.equal(
    shouldRelaunchWithEnvProxy({
      https_proxy: "http://127.0.0.1:7897",
    }),
    true
  );
  assert.equal(
    shouldRelaunchWithEnvProxy({
      https_proxy: "http://127.0.0.1:7897",
      NODE_USE_ENV_PROXY: "1",
    }),
    false
  );
  assert.equal(
    shouldRelaunchWithEnvProxy({
      https_proxy: "http://127.0.0.1:7897",
      ZENTAO_ENV_PROXY_REEXEC: "1",
    }),
    false
  );
});

test("config store save/load roundtrip", () => {
  const env = { XDG_CONFIG_HOME: "/tmp/zentao-cli-test" };
  const filePath = getConfigPath({ env });
  saveConfig({ zentaoUrl: "u", zentaoAccount: "a", zentaoPassword: "p", insecure: true }, { env });
  const loaded = loadConfig({ env });
  assert.equal(loaded.zentaoUrl, "u");
  assert.equal(loaded.insecure, true);
  assert.equal(filePath.includes("zentao/config.toml"), true);
});

test("ZentaoClient listProducts uses token then GET products", async () => {
  const calls = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });

    if (String(url).endsWith("/api.php/v1/tokens")) {
      return {
        text: async () => JSON.stringify({ token: "t_abc" }),
      };
    }

    if (String(url).includes("/api.php/v1/products")) {
      return {
        text: async () =>
          JSON.stringify({
            products: [{ id: 1, name: "P1" }],
            total: 1,
            limit: 1000,
          }),
      };
    }

    return {
      text: async () => JSON.stringify({ error: "unexpected" }),
    };
  };

  try {
    const client = new ZentaoClient({
      baseUrl: "https://example.com/zentao",
      account: "leo",
      password: "pw",
    });

    const result = await client.listProducts({ page: 1, limit: 1000 });
    assert.equal(result.status, 1);
    assert.equal(result.result?.products?.[0]?.name, "P1");

    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.endsWith("/api.php/v1/tokens"));
    assert.ok(calls[1].url.includes("/api.php/v1/products"));
    assert.equal(calls[1].options?.headers?.Token, "t_abc");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createClientFromCli respects insecure flag from env and saved config", () => {
  const env = {
    XDG_CONFIG_HOME: `/tmp/zentao-cli-test-insecure-${process.pid}`,
    ZENTAO_INSECURE: "true",
  };

  saveConfig(
    {
      zentaoUrl: "https://example.com/zentao",
      zentaoAccount: "leo",
      zentaoPassword: "pw",
    },
    { env }
  );

  const client = createClientFromCli({ argv: [], env });
  assert.equal(client.insecure, true);

  const clientWithOverride = createClientFromCli({
    argv: ["--insecure=false"],
    env,
  });
  assert.equal(clientWithOverride.insecure, false);
});

test("ZentaoClient insecure mode toggles NODE_TLS_REJECT_UNAUTHORIZED only during fetch", async () => {
  const observed = [];
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  globalThis.fetch = async () => {
    observed.push(process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? null);
    return {
      text: async () => JSON.stringify({ token: "t_insecure" }),
    };
  };

  try {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    const client = new ZentaoClient({
      baseUrl: "https://example.com/zentao",
      account: "leo",
      password: "pw",
      insecure: true,
    });

    await client.ensureToken();
    assert.deepEqual(observed, ["0"]);
    assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalEnv;
    }
  }
});

test("ZentaoClient surfaces fetch cause details", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const error = new TypeError("fetch failed");
    error.cause = { code: "EAI_AGAIN" };
    throw error;
  };

  try {
    const client = new ZentaoClient({
      baseUrl: "https://example.com/zentao",
      account: "leo",
      password: "pw",
    });

    await assert.rejects(
      () => client.ensureToken(),
      /Token request network failed: fetch failed: EAI_AGAIN/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("formatProductsSimple prints TSV", () => {
  const out = formatProductsSimple([
    { id: 1, name: "P1", totalBugs: 10, status: "normal" },
    { id: 2, name: "P2", totalBugs: 0, productStatus: "closed" },
  ]);
  assert.ok(out.includes("id\tname\ttotalBugs\tstatus"));
  assert.ok(out.includes("1\tP1\t10\tnormal"));
  assert.ok(out.includes("2\tP2\t0\tclosed"));
});

test("formatBugsSimple prints TSV", () => {
  const out = formatBugsSimple([
    { id: 1, title: "T1", status: "active", pri: 2, severity: 3, assignedTo: { account: "leo" } },
  ]);
  assert.ok(out.includes("id\ttitle\tstatus\tpri\tseverity\tassignedTo"));
  assert.ok(out.includes("1\tT1\tactive\t2\t3\tleo"));
});

test("formatBugSimple prints one-row TSV", () => {
  const out = formatBugSimple({
    id: 9,
    title: "Hello",
    status: "resolved",
    pri: 3,
    severity: 2,
    assignedTo: { account: "a" },
    openedBy: { account: "b" },
    resolvedBy: { account: "c" },
  });
  assert.ok(out.includes("id\ttitle\tstatus\tpri\tseverity\tassignedTo\topenedBy\tresolvedBy"));
  assert.ok(out.includes("9\tHello\tresolved\t3\t2\ta\tb\tc"));
});

test("formatBugsMineSimple prints summary", () => {
  const out = formatBugsMineSimple({
    total: 2,
    products: [{ id: 1, name: "P1", myBugs: 2, totalBugs: 10 }],
    bugs: [],
  });
  assert.ok(out.includes("total\t2"));
  assert.ok(out.includes("1\tP1\t2\t10"));
});

test("ZentaoClient updateTask uses PUT task endpoint with typed payload", async () => {
  const calls = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });

    if (String(url).endsWith("/api.php/v1/tokens")) {
      return {
        text: async () => JSON.stringify({ token: "t_update" }),
      };
    }

    if (String(url).includes("/api.php/v1/tasks/123")) {
      return {
        text: async () =>
          JSON.stringify({
            id: 123,
            name: "Renamed task",
            status: "doing",
          }),
      };
    }

    return {
      text: async () => JSON.stringify({ error: "unexpected" }),
    };
  };

  try {
    const client = new ZentaoClient({
      baseUrl: "https://example.com/zentao",
      account: "leo",
      password: "pw",
    });

    const result = await client.updateTask({
      id: 123,
      name: "Renamed task",
      assignedTo: "tom",
      story: "0",
      parent: "88",
      execution: "9",
      module: "7",
      pri: "2",
      estimate: "3.5",
      left: "1.5",
      consumed: "2",
      status: "doing",
      desc: "updated",
      estStarted: "2026-03-16",
      deadline: "2026-03-20",
      closedReason: "done",
      multiple: "false",
      mailto: ["amy", "bob"],
      team: ["tom", "jane"],
      teamEstimate: [2, 3],
      teamConsumed: [1, 0.5],
      teamLeft: [1, 2.5],
      teamSource: ["", ""],
      uid: "u_1",
    });

    assert.equal(result.status, 1);
    assert.equal(result.result?.id, 123);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options?.method, "PUT");
    assert.ok(calls[1].url.includes("/api.php/v1/tasks/123"));
    assert.equal(calls[1].options?.headers?.Token, "t_update");
    assert.deepEqual(JSON.parse(calls[1].options?.body), {
      name: "Renamed task",
      assignedTo: "tom",
      desc: "updated",
      closedReason: "done",
      status: "doing",
      estStarted: "2026-03-16",
      deadline: "2026-03-20",
      uid: "u_1",
      mailto: ["amy", "bob"],
      team: ["tom", "jane"],
      teamEstimate: [2, 3],
      teamConsumed: [1, 0.5],
      teamLeft: [1, 2.5],
      teamSource: ["", ""],
      story: 0,
      parent: 88,
      execution: 9,
      module: 7,
      pri: 2,
      estimate: 3.5,
      left: 1.5,
      consumed: 2,
      multiple: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

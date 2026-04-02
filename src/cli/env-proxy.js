import process from "node:process";
import { spawnSync } from "node:child_process";

const PROXY_KEYS = [
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
];

function hasProxyEnv(env = process.env) {
  return PROXY_KEYS.some((key) => Boolean(env[key]));
}

function supportsEnvProxyFlag() {
  return process.allowedNodeEnvironmentFlags?.has("--use-env-proxy") === true;
}

export function shouldRelaunchWithEnvProxy(env = process.env) {
  if (!supportsEnvProxyFlag()) return false;
  if (!hasProxyEnv(env)) return false;
  if (env.NODE_USE_ENV_PROXY === "1") return false;
  if (env.ZENTAO_ENV_PROXY_REEXEC === "1") return false;
  return true;
}

export function maybeRelaunchWithEnvProxy({
  env = process.env,
  execPath = process.execPath,
  argv = process.argv,
} = {}) {
  if (!shouldRelaunchWithEnvProxy(env)) return false;

  const result = spawnSync(execPath, ["--use-env-proxy", ...argv.slice(1)], {
    env: {
      ...env,
      NODE_USE_ENV_PROXY: "1",
      ZENTAO_ENV_PROXY_REEXEC: "1",
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
    return true;
  }

  process.exit(result.status ?? 0);
}

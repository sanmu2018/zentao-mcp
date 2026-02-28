import { getOption, parseCliArgs } from "../cli/args.js";
import { loadConfig } from "../config/store.js";

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function toInt(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function normalizeResult(payload) {
  return { status: 1, msg: "success", result: payload };
}

export function normalizeError(message, payload) {
  return { status: 0, msg: message || "error", result: payload ?? [] };
}

function normalizeAccountValue(value) {
  return String(value || "").trim().toLowerCase();
}

function extractAccounts(value) {
  if (value === undefined || value === null) return [];
  if (typeof value === "string" || typeof value === "number") {
    const normalized = normalizeAccountValue(value);
    return normalized ? [normalized] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractAccounts(item));
  }
  if (typeof value === "object") {
    if (value.account) return extractAccounts(value.account);
    if (value.user) return extractAccounts(value.user);
    if (value.name) return extractAccounts(value.name);
    if (value.realname) return extractAccounts(value.realname);
    return [];
  }
  return [];
}

function matchesAccount(value, matchAccount) {
  const candidates = extractAccounts(value);
  return candidates.includes(matchAccount);
}

export class ZentaoClient {
  constructor({ baseUrl, account, password }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.account = account;
    this.password = password;
    this.token = null;
  }

  async ensureToken() {
    if (this.token) return;
    this.token = await this.getToken();
  }

  async getToken() {
    const url = `${this.baseUrl}/api.php/v1/tokens`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account: this.account,
        password: this.password,
      }),
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error(`Token response parse failed: ${text.slice(0, 200)}`);
    }

    if (json.error) {
      throw new Error(`Token request failed: ${json.error}`);
    }

    if (!json.token) {
      throw new Error(`Token missing in response: ${text.slice(0, 200)}`);
    }

    return json.token;
  }

  async request({ method, path, query = {}, body }) {
    await this.ensureToken();

    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });

    const headers = {
      Token: this.token,
    };

    const options = { method, headers };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error(`Response parse failed: ${text.slice(0, 200)}`);
    }

    return json;
  }

  async listProducts({ page, limit }) {
    const payload = await this.request({
      method: "GET",
      path: "/api.php/v1/products",
      query: {
        page: toInt(page, 1),
        limit: toInt(limit, 1000),
      },
    });

    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async listBugs({ product, page, limit }) {
    if (!product) throw new Error("product is required");

    const payload = await this.request({
      method: "GET",
      path: "/api.php/v1/bugs",
      query: {
        product,
        page: toInt(page, 1),
        limit: toInt(limit, 20),
      },
    });

    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async getBug({ id }) {
    if (!id) throw new Error("id is required");

    const payload = await this.request({
      method: "GET",
      path: `/api.php/v1/bugs/${id}`,
    });

    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async fetchAllBugsForProduct({ product, perPage, maxItems }) {
    const bugs = [];
    let page = 1;
    let total = null;
    const pageSize = toInt(perPage, 100);
    const cap = toInt(maxItems, 0);

    while (true) {
      const payload = await this.request({
        method: "GET",
        path: "/api.php/v1/bugs",
        query: {
          product,
          page,
          limit: pageSize,
        },
      });

      if (payload.error) {
        throw new Error(payload.error);
      }

      const pageBugs = Array.isArray(payload.bugs) ? payload.bugs : [];
      total = payload.total ?? total;
      for (const bug of pageBugs) {
        bugs.push(bug);
        if (cap > 0 && bugs.length >= cap) {
          return { bugs, total };
        }
      }

      if (total !== null && payload.limit) {
        if (page * payload.limit >= total) break;
      } else if (pageBugs.length < pageSize) {
        break;
      }

      page += 1;
    }

    return { bugs, total };
  }

  async bugsMine({
    account,
    scope,
    status,
    productIds,
    includeZero,
    perPage,
    maxItems,
    includeDetails,
  }) {
    const matchAccount = normalizeAccountValue(account || this.account);
    const targetScope = (scope || "assigned").toLowerCase();
    const rawStatus = status ?? "active";
    const statusList = Array.isArray(rawStatus) ? rawStatus : String(rawStatus).split(/[|,]/);
    const statusSet = new Set(
      statusList.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
    );
    const allowAllStatus = statusSet.has("all") || statusSet.size === 0;

    const productsResponse = await this.listProducts({ page: 1, limit: 1000 });
    if (productsResponse.status !== 1) return productsResponse;
    const products = productsResponse.result.products || [];

    const productSet = Array.isArray(productIds) && productIds.length
      ? new Set(productIds.map((id) => Number(id)))
      : null;

    const rows = [];
    const bugs = [];
    let totalMatches = 0;
    const maxCollect = toInt(maxItems, 200);

    for (const product of products) {
      if (productSet && !productSet.has(Number(product.id))) continue;
      const { bugs: productBugs } = await this.fetchAllBugsForProduct({
        product: product.id,
        perPage,
      });

      const matches = productBugs.filter((bug) => {
        if (!allowAllStatus) {
          const bugStatus = String(bug.status || "").trim().toLowerCase();
          if (!statusSet.has(bugStatus)) return false;
        }
        const assigned = matchesAccount(bug.assignedTo, matchAccount);
        const opened = matchesAccount(bug.openedBy, matchAccount);
        const resolved = matchesAccount(bug.resolvedBy, matchAccount);
        if (targetScope === "assigned") return assigned;
        if (targetScope === "opened") return opened;
        if (targetScope === "resolved") return resolved;
        return assigned || opened || resolved;
      });

      if (!includeZero && matches.length === 0) continue;
      totalMatches += matches.length;

      rows.push({
        id: product.id,
        name: product.name,
        totalBugs: toInt(product.totalBugs, 0),
        myBugs: matches.length,
      });

      if (includeDetails && bugs.length < maxCollect) {
        for (const bug of matches) {
          if (bugs.length >= maxCollect) break;
          bugs.push({
            id: bug.id,
            title: bug.title,
            product: bug.product,
            status: bug.status,
            pri: bug.pri,
            severity: bug.severity,
            assignedTo: bug.assignedTo,
            openedBy: bug.openedBy,
            resolvedBy: bug.resolvedBy,
            openedDate: bug.openedDate,
          });
        }
      }
    }

    return normalizeResult({
      account: matchAccount,
      scope: targetScope,
      status: allowAllStatus ? "all" : Array.from(statusSet),
      total: totalMatches,
      products: rows,
      bugs: includeDetails ? bugs : [],
    });
  }

  async listExecutions({ project, status, page, limit }) {
    const query = {
      page: toInt(page, 1),
      limit: toInt(limit, 1000),
    };
    if (project) query.project = project;
    if (status) query.status = status;

    const payload = await this.request({
      method: "GET",
      path: "/api.php/v1/executions",
      query,
    });

    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async listStories({ execution, page, limit }) {
    if (!execution) throw new Error("execution is required");

    const payload = await this.request({
      method: "GET",
      path: `/api.php/v1/executions/${execution}/stories`,
      query: {
        page: toInt(page, 1),
        limit: toInt(limit, 100),
      },
    });

    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async listTasks({ execution, page, limit }) {
    if (!execution) throw new Error("execution is required");

    const payload = await this.request({
      method: "GET",
      path: `/api.php/v1/executions/${execution}/tasks`,
      query: {
        page: toInt(page, 1),
        limit: toInt(limit, 100),
      },
    });

    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async tasksMine({ account, status, includeDetails }) {
    const matchAccount = normalizeAccountValue(account || this.account);
    const rawStatus = status ?? "all";
    const statusList = Array.isArray(rawStatus) ? rawStatus : String(rawStatus).split(/[|,]/);
    const statusSet = new Set(
      statusList.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
    );
    const allowAllStatus = statusSet.has("all") || statusSet.size === 0;

    const query = { search: 1, limit: 1000 };
    if (matchAccount) query.assignedTo = matchAccount;

    const payload = await this.request({
      method: "GET",
      path: "/api.php/v1/tasks",
      query,
    });

    if (payload.error) return normalizeError(payload.error, payload);

    let tasks = Array.isArray(payload.tasks) ? payload.tasks : (payload.data?.tasks || []);

    if (!allowAllStatus) {
      tasks = tasks.filter((t) => statusSet.has(String(t.status || "").trim().toLowerCase()));
    }

    if (!includeDetails) {
      tasks = tasks.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        assignedTo: t.assignedTo,
        execution: t.execution,
        pri: t.pri,
      }));
    }

    return normalizeResult({
      account: matchAccount,
      status: allowAllStatus ? "all" : Array.from(statusSet),
      total: tasks.length,
      tasks,
    });
  }

  async startTask({ id, consumed, left, comment }) {
    if (!id) throw new Error("task id is required");

    // Fetch the task first to retain assignedTo, consumed, left, etc.
    const taskRes = await this.getTask({ id });
    if (taskRes.status === 0 && taskRes.error) return taskRes;
    const task = taskRes.result || {};

    const assignedTo = typeof task.assignedTo === 'object' && task.assignedTo !== null
      ? task.assignedTo.account
      : (task.assignedTo || this.account);

    const payload = await this.request({
      method: "POST",
      path: `/api.php/v1/tasks/${id}/start`,
      body: {
        assignedTo,
        consumed: consumed !== undefined ? Number(consumed) : (task.consumed || 0),
        left: left !== undefined ? Number(left) : (task.left || 0),
        comment: comment || undefined,
      },
    });
    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async getTask({ id }) {
    if (!id) throw new Error("task id is required");
    const payload = await this.request({
      method: "GET",
      path: `/api.php/v1/tasks/${id}`,
    });
    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async createTask({ execution, name, type, assignedTo, story, estimate, desc, pri, estStarted, deadline }) {
    if (!execution) throw new Error("execution is required");
    if (!name) throw new Error("task name is required");

    const payload = await this.request({
      method: "POST",
      path: `/api.php/v1/executions/${execution}/tasks`,
      body: {
        name,
        type: type || "devel",
        assignedTo: assignedTo || undefined,
        story: story || undefined,
        estimate: estimate !== undefined ? Number(estimate) : undefined,
        desc: desc || undefined,
        pri: pri !== undefined ? Number(pri) : 3,
        estStarted: estStarted || undefined,
        deadline: deadline || undefined,
      },
    });

    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async finishTask({ id, currentConsumed, comment }) {
    if (!id) throw new Error("task id is required");

    // Fetch the task first to retain assignedTo and realStarted.
    const taskRes = await this.getTask({ id });
    if (taskRes.status === 0 && taskRes.error) return taskRes;
    const task = taskRes.result || {};

    const assignedTo = typeof task.assignedTo === 'object' && task.assignedTo !== null
      ? task.assignedTo.account
      : (task.assignedTo || this.account);

    const formatDateTime = (d) => {
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const now = formatDateTime(new Date());
    let realStarted = task.realStarted;
    if (!realStarted || realStarted === '0000-00-00 00:00:00' || realStarted === '0000-00-00') {
      realStarted = now;
    }

    const body = {
      assignedTo,
      realStarted,
      finishedDate: now,
      currentConsumed: currentConsumed !== undefined ? Number(currentConsumed) : 0,
    };
    if (comment) body.comment = comment;

    const payload = await this.request({
      method: "POST",
      path: `/api.php/v1/tasks/${id}/finish`,
      body,
    });
    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }
}

export function createClientFromCli({ argv, env }) {
  const stored = loadConfig({ env }) || {};
  const cliArgs = parseCliArgs(argv);

  const baseUrl =
    getOption(cliArgs, env, "ZENTAO_URL", "zentao-url") || stored.zentaoUrl || null;
  const account =
    getOption(cliArgs, env, "ZENTAO_ACCOUNT", "zentao-account") ||
    stored.zentaoAccount ||
    null;
  const password =
    getOption(cliArgs, env, "ZENTAO_PASSWORD", "zentao-password") ||
    stored.zentaoPassword ||
    null;

  if (!baseUrl) throw new Error("Missing ZENTAO_URL or --zentao-url");
  if (!account) throw new Error("Missing ZENTAO_ACCOUNT or --zentao-account");
  if (!password) throw new Error("Missing ZENTAO_PASSWORD or --zentao-password");

  return new ZentaoClient({ baseUrl, account, password });
}

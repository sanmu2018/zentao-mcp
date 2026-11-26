import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
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

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function toNumberIfDefined(value) {
  if (value === undefined || value === null || value === "") return value;
  return Number(value);
}

function toBooleanIfDefined(value) {
  if (value === undefined || value === null || value === "") return value;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function buildTaskPayload(input = {}) {
  const body = {};
  const numericFields = new Set([
    "story",
    "parent",
    "execution",
    "module",
    "pri",
    "estimate",
    "left",
    "consumed",
  ]);
  const passthroughFields = [
    "name",
    "type",
    "mode",
    "desc",
    "assignedTo",
    "closedReason",
    "status",
    "estStarted",
    "deadline",
    "uid",
    "mailto",
    "team",
    "teamEstimate",
    "teamConsumed",
    "teamLeft",
    "teamSource",
  ];

  for (const field of passthroughFields) {
    if (hasOwn(input, field)) body[field] = input[field];
  }

  for (const field of numericFields) {
    if (hasOwn(input, field)) body[field] = toNumberIfDefined(input[field]);
  }

  if (hasOwn(input, "multiple")) {
    body.multiple = toBooleanIfDefined(input.multiple);
  }

  return body;
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

function formatFetchError(error) {
  const cause = error?.cause?.code || error?.cause?.message || error?.cause;
  if (cause) {
    return `${error.message}: ${cause}`;
  }
  return error?.message || String(error);
}

/** ZenTao history comments expect HTML; wrap plain text lightly. */
export function ensureHtmlComment(comment) {
  const text = String(comment ?? "").trim();
  if (!text) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n+/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

/** Collect ZenTao file IDs from bug steps HTML, action comments, and files[]. */
export function extractBugFileIds(bug = {}) {
  const ids = new Set();

  const collectFromText = (text) => {
    const raw = String(text || "");
    for (const match of raw.matchAll(/fileID=(\d+)/gi)) {
      ids.add(Number(match[1]));
    }
    for (const match of raw.matchAll(/\/files\/(\d+)\b/gi)) {
      ids.add(Number(match[1]));
    }
  };

  collectFromText(bug.steps);
  collectFromText(bug.desc);

  if (bug.actions && typeof bug.actions === "object") {
    for (const action of Object.values(bug.actions)) {
      collectFromText(action?.comment);
      collectFromText(action?.extra);
    }
  }

  const files = Array.isArray(bug.files) ? bug.files : Object.values(bug.files || {});
  for (const file of files) {
    const id = Number(file?.id ?? file?.fileID ?? file);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }

  return [...ids].sort((a, b) => a - b);
}

export function parseContentDispositionFilename(header) {
  if (!header) return null;
  const utf8 = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ""));
    } catch {
      return utf8[1].trim().replace(/^"|"$/g, "");
    }
  }
  const plain = header.match(/filename\s*=\s*"([^"]+)"/i) || header.match(/filename\s*=\s*([^;]+)/i);
  if (!plain?.[1]) return null;
  return plain[1].trim().replace(/^"|"$/g, "");
}

export function guessExtensionFromMagic(buffer) {
  if (!buffer || buffer.length < 4) return "";
  const hex = Buffer.from(buffer.slice(0, 12)).toString("hex");
  if (hex.startsWith("89504e47")) return ".png";
  if (hex.startsWith("ffd8ff")) return ".jpg";
  if (hex.startsWith("47494638")) return ".gif";
  if (hex.startsWith("52494646") && hex.includes("57454250")) return ".webp";
  if (hex.startsWith("25504446")) return ".pdf";
  return "";
}

export function defaultImageCacheDir() {
  const xdg = process.env.XDG_CACHE_HOME;
  const root = xdg ? path.join(xdg, "zentao") : path.join(os.homedir(), ".cache", "zentao");
  return path.join(root, "files");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseSessionPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  let data = payload.data ?? payload;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  return data;
}

function sessionLooksLoggedIn(payload) {
  const data = parseSessionPayload(payload);
  if (!data) return false;
  if (payload?.status === "success" && data.account) return true;
  if (data.account || data.user || data.userID || data.id) return true;
  // Some installs return locate URL after login.
  if (typeof data === "string" && !/user-login|login/i.test(data)) return true;
  if (payload?.status === "success" && payload?.locate && !/user-login|login/i.test(String(payload.locate))) {
    return true;
  }
  return false;
}

export class ZentaoClient {
  constructor({ baseUrl, account, password, insecure = false }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.account = account;
    this.password = password;
    this.insecure = insecure;
    this.token = null;
    this.sessionId = null;
    this.sessionName = "zentaosid";
  }

  static resolveInsecureOption({ cliArgs = {}, env = {}, stored = {} } = {}) {
    if (hasOwn(cliArgs, "insecure")) {
      return toBooleanIfDefined(cliArgs.insecure);
    }
    if (hasOwn(env, "ZENTAO_INSECURE")) {
      return toBooleanIfDefined(env.ZENTAO_INSECURE);
    }
    if (hasOwn(stored, "insecure")) {
      return toBooleanIfDefined(stored.insecure);
    }
    return false;
  }

  async fetchWithTlsPolicy(url, options) {
    if (!this.insecure) {
      return fetch(url, options);
    }

    const original = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try {
      return await fetch(url, options);
    } finally {
      if (original === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = original;
      }
    }
  }

  async ensureToken() {
    if (this.token) return;
    this.token = await this.getToken();
  }

  async getToken() {
    const url = `${this.baseUrl}/api.php/v1/tokens`;
    let res;
    try {
      res = await this.fetchWithTlsPolicy(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: this.account,
          password: this.password,
        }),
      });
    } catch (error) {
      throw new Error(`Token request network failed: ${formatFetchError(error)}`);
    }

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

    let res;
    try {
      res = await this.fetchWithTlsPolicy(url, options);
    } catch (error) {
      throw new Error(`Request network failed: ${formatFetchError(error)}`);
    }
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

  async getBug({ id, withImages = false, downloadImages = false, outDir } = {}) {
    if (!id) throw new Error("id is required");

    const payload = await this.request({
      method: "GET",
      path: `/api.php/v1/bugs/${id}`,
    });

    if (payload.error) return normalizeError(payload.error, payload);

    const shouldEnrich = withImages || downloadImages || Boolean(outDir);
    if (!shouldEnrich) return normalizeResult(payload);

    const fileIds = extractBugFileIds(payload);
    const shouldDownload = downloadImages || Boolean(outDir) || withImages;
    const images = [];
    for (const fileId of fileIds) {
      if (shouldDownload) {
        const downloaded = await this.downloadFile({
          id: fileId,
          outDir: outDir || defaultImageCacheDir(),
        });
        images.push(downloaded);
      } else {
        images.push({
          fileId,
          url: `${this.baseUrl}/api.php/v1/files/${fileId}`,
        });
      }
    }

    return normalizeResult({
      ...payload,
      imageRefs: fileIds,
      images,
    });
  }

  /**
   * Download a ZenTao file by id via REST (/api.php/v1/files/:id).
   * Auth uses the same Token as other REST calls (session cookie file-read often returns HTML).
   */
  async downloadFile({ id, outDir, outPath } = {}) {
    if (!id) throw new Error("id is required");
    await this.ensureToken();

    const url = `${this.baseUrl}/api.php/v1/files/${id}`;
    let res;
    try {
      res = await this.fetchWithTlsPolicy(url, {
        method: "GET",
        headers: { Token: this.token },
      });
    } catch (error) {
      throw new Error(`File download network failed: ${formatFetchError(error)}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      const preview = buffer.toString("utf8").slice(0, 200);
      throw new Error(`File download failed (${res.status}): ${preview}`);
    }

    // ZenTao sometimes returns JSON error bodies with a 200 status.
    const contentType = res.headers.get("content-type") || "";
    const headText = buffer.toString("utf8", 0, Math.min(buffer.length, 256)).trimStart();
    if (contentType.includes("application/json") || headText.startsWith("{")) {
      try {
        const json = JSON.parse(buffer.toString("utf8"));
        if (json?.error) throw new Error(String(json.error));
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }

    const headerName = parseContentDispositionFilename(res.headers.get("content-disposition"));
    const magicExt = guessExtensionFromMagic(buffer);
    let filename = headerName || `file-${id}${magicExt || ""}`;
    if (headerName && !path.extname(headerName) && magicExt) {
      filename = `${headerName}${magicExt}`;
    }

    const targetDir = outDir || defaultImageCacheDir();
    const targetPath = outPath || path.join(targetDir, `${id}-${filename}`);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, buffer);

    return {
      fileId: Number(id) || id,
      filename,
      contentType: contentType || "application/octet-stream",
      size: buffer.length,
      path: targetPath,
      url: url,
    };
  }

  async updateBug({ id, ...fields }) {
    if (!id) throw new Error("id is required");
    const body = { ...fields };
    if (hasOwn(body, "comment") && body.comment) {
      body.comment = ensureHtmlComment(body.comment);
    }
    const payload = await this.request({
      method: "PUT",
      path: `/api.php/v1/bugs/${id}`,
      body,
    });
    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async appendBugSteps({ id, html, marker }) {
    if (!id) throw new Error("id is required");
    if (!html) throw new Error("html is required");
    const current = await this.getBug({ id });
    if (current.status !== 1) return current;
    const bug = current.result || {};
    const steps = String(bug.steps || "");
    if (marker && steps.includes(marker)) {
      return normalizeResult({ ...bug, appended: false, reason: "marker already present" });
    }
    return this.updateBug({ id, steps: steps + String(html) });
  }

  async resolveBug({
    id,
    resolution = "fixed",
    resolvedBuild = "trunk",
    assignedTo,
    duplicateBug,
    comment,
  }) {
    if (!id) throw new Error("id is required");
    const body = {
      resolution,
      resolvedBuild,
    };
    if (assignedTo) body.assignedTo = assignedTo;
    if (duplicateBug !== undefined && duplicateBug !== null && duplicateBug !== "") {
      body.duplicateBug = Number(duplicateBug);
    }
    if (comment) body.comment = ensureHtmlComment(comment);

    const payload = await this.request({
      method: "POST",
      path: `/api.php/v1/bugs/${id}/resolve`,
      body,
    });
    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async closeBug({ id, comment }) {
    if (!id) throw new Error("id is required");
    const body = {};
    if (comment) body.comment = ensureHtmlComment(comment);
    const payload = await this.request({
      method: "POST",
      path: `/api.php/v1/bugs/${id}/close`,
      body,
    });
    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async activateBug({ id, assignedTo, openedBuild, comment }) {
    if (!id) throw new Error("id is required");
    const body = {};
    if (assignedTo) body.assignedTo = assignedTo;
    if (openedBuild) body.openedBuild = openedBuild;
    if (comment) body.comment = ensureHtmlComment(comment);
    const payload = await this.request({
      method: "POST",
      path: `/api.php/v1/bugs/${id}/active`,
      body,
    });
    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async confirmBug({ id, assignedTo, comment, pri, type, deadline }) {
    if (!id) throw new Error("id is required");
    const body = {};
    if (assignedTo) body.assignedTo = assignedTo;
    if (comment) body.comment = ensureHtmlComment(comment);
    if (pri !== undefined) body.pri = Number(pri);
    if (type) body.type = type;
    if (deadline) body.deadline = deadline;
    const payload = await this.request({
      method: "POST",
      path: `/api.php/v1/bugs/${id}/confirm`,
      body,
    });
    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async assignBug({ id, assignedTo, comment, mailto }) {
    if (!id) throw new Error("id is required");
    if (!assignedTo) throw new Error("assignedTo is required");
    const body = { assignedTo };
    if (comment) body.comment = ensureHtmlComment(comment);
    if (mailto) body.mailto = mailto;
    const payload = await this.request({
      method: "POST",
      path: `/api.php/v1/bugs/${id}/assign`,
      body,
    });
    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  /**
   * Pure history comments are not supported by REST PUT on ZenTao 22.x.
   * Use the session/web endpoint that the UI uses (GET-mode or PATH_INFO).
   */
  async ensureSession() {
    if (this.sessionId) return this.sessionId;

    const sidCandidates = [
      `${this.baseUrl}/index.php?m=api&f=getSessionID&t=json`,
      `${this.baseUrl}/api-getsessionid.json`,
    ];

    let sidJson = null;
    let lastSidError = null;
    for (const sidUrl of sidCandidates) {
      let sidRes;
      try {
        sidRes = await this.fetchWithTlsPolicy(sidUrl);
      } catch (error) {
        lastSidError = error;
        continue;
      }
      const sidText = await sidRes.text();
      const trimmed = sidText.trim();
      if (!trimmed.startsWith("{")) {
        lastSidError = new Error(`Session bootstrap not JSON: ${trimmed.slice(0, 120)}`);
        continue;
      }
      try {
        sidJson = JSON.parse(trimmed);
        break;
      } catch {
        lastSidError = new Error(`Session bootstrap parse failed: ${trimmed.slice(0, 200)}`);
      }
    }
    if (!sidJson) {
      throw lastSidError || new Error("Session bootstrap failed");
    }

    const sidData = parseSessionPayload(sidJson);
    const sessionId = sidData?.sessionID || sidData?.sessionId;
    const sessionName = sidData?.sessionName || "zentaosid";
    if (!sessionId) {
      throw new Error(`Session id missing in response`);
    }

    const loginCandidates = [
      `${this.baseUrl}/index.php?m=user&f=login&t=json&${sessionName}=${encodeURIComponent(sessionId)}`,
      `${this.baseUrl}/user-login.json?${sessionName}=${encodeURIComponent(sessionId)}`,
    ];

    let loginJson = null;
    let lastLoginError = null;
    for (const loginUrl of loginCandidates) {
      let loginRes;
      try {
        loginRes = await this.fetchWithTlsPolicy(loginUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `${sessionName}=${sessionId}`,
          },
          body: new URLSearchParams({
            account: this.account,
            password: this.password,
          }).toString(),
        });
      } catch (error) {
        lastLoginError = error;
        continue;
      }
      const loginText = await loginRes.text();
      const trimmed = loginText.trim();
      if (!trimmed.startsWith("{")) {
        lastLoginError = new Error(`Session login not JSON: ${trimmed.slice(0, 120)}`);
        continue;
      }
      try {
        loginJson = JSON.parse(trimmed);
      } catch {
        lastLoginError = new Error(`Session login parse failed: ${trimmed.slice(0, 200)}`);
        continue;
      }
      if (!sessionLooksLoggedIn(loginJson) && loginJson?.status && loginJson.status !== "success") {
        lastLoginError = new Error(`Session login rejected: ${trimmed.slice(0, 200)}`);
        loginJson = null;
        continue;
      }
      const loginData = parseSessionPayload(loginJson);
      if (loginData?.result === "fail" || /deny|fail|login/i.test(String(loginJson?.locate || ""))) {
        lastLoginError = new Error(`Session login rejected: ${trimmed.slice(0, 200)}`);
        loginJson = null;
        continue;
      }
      break;
    }
    if (!loginJson) {
      throw lastLoginError || new Error("Session login failed");
    }

    this.sessionId = String(sessionId);
    this.sessionName = String(sessionName);
    return this.sessionId;
  }

  async commentBug({ id, comment }) {
    if (!id) throw new Error("id is required");
    if (!comment) throw new Error("comment is required");
    const sessionId = await this.ensureSession();
    const sessionName = this.sessionName || "zentaosid";
    const html = ensureHtmlComment(comment);
    const candidates = [
      `${this.baseUrl}/index.php?m=action&f=comment&objectType=bug&objectID=${encodeURIComponent(id)}&t=json&${sessionName}=${encodeURIComponent(sessionId)}`,
      `${this.baseUrl}/action-comment-bug-${id}.json?${sessionName}=${encodeURIComponent(sessionId)}`,
    ];

    let lastError = null;
    for (const url of candidates) {
      let res;
      try {
        res = await this.fetchWithTlsPolicy(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: `${sessionName}=${sessionId}`,
          },
          body: new URLSearchParams({ comment: html }).toString(),
          redirect: "manual",
        });
      } catch (error) {
        lastError = error;
        continue;
      }
      const text = await res.text();
      const trimmed = text.trim();

      // ZenTao GET-mode often returns an iframe reload HTML on success.
      if (/parent\.location\.reload/i.test(trimmed) || /location\.href\s*=/i.test(trimmed)) {
        return normalizeResult({ id: Number(id) || id, comment: html, raw: { html: true } });
      }

      if (!trimmed.startsWith("{")) {
        lastError = new Error(`Comment response parse failed: ${trimmed.slice(0, 200)}`);
        continue;
      }

      let json;
      try {
        json = JSON.parse(trimmed);
      } catch {
        lastError = new Error(`Comment response parse failed: ${trimmed.slice(0, 200)}`);
        continue;
      }
      if (json.error) {
        lastError = new Error(String(json.error));
        continue;
      }
      if (json.status === "failed" || json.result === "fail") {
        lastError = new Error(trimmed.slice(0, 200));
        continue;
      }
      if (typeof json.locate === "string" && /user-login|login/i.test(json.locate)) {
        lastError = new Error(`Comment requires login: ${json.locate}`);
        this.sessionId = null;
        continue;
      }
      return normalizeResult({ id: Number(id) || id, comment: html, raw: json });
    }

    throw lastError || new Error("Failed to add bug comment via session API");
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
      body: buildTaskPayload({
        name,
        type: type || "devel",
        assignedTo: assignedTo || undefined,
        story: story !== undefined ? story : undefined,
        estimate: estimate !== undefined ? Number(estimate) : undefined,
        desc: desc || undefined,
        pri: pri !== undefined ? Number(pri) : 3,
        estStarted: estStarted || undefined,
        deadline: deadline || undefined,
      }),
    });

    if (payload.error) return normalizeError(payload.error, payload);
    return normalizeResult(payload);
  }

  async updateTask({ id, ...changes }) {
    if (!id) throw new Error("task id is required");

    const payload = await this.request({
      method: "PUT",
      path: `/api.php/v1/tasks/${id}`,
      body: buildTaskPayload(changes),
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
  const insecure = ZentaoClient.resolveInsecureOption({ cliArgs, env, stored });

  if (!baseUrl) throw new Error("Missing ZENTAO_URL or --zentao-url");
  if (!account) throw new Error("Missing ZENTAO_ACCOUNT or --zentao-account");
  if (!password) throw new Error("Missing ZENTAO_PASSWORD or --zentao-password");

  return new ZentaoClient({ baseUrl, account, password, insecure });
}

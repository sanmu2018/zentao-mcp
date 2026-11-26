import process from "node:process";
import { extractCommand, hasHelpFlag, parseCliArgs } from "../cli/args.js";
import { createClientFromCli } from "../zentao/client.js";

function printHelp() {
  process.stdout.write(`zentao bug <subcommand>\n\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  zentao bug get --id <bugId> [--with-images] [--out-dir <dir>] [--json]\n`);
  process.stdout.write(`  zentao bug file --id <fileId> [--out <path>] [--out-dir <dir>] [--json]\n`);
  process.stdout.write(`  zentao bug comment --id <bugId> --comment <text> [--json]\n`);
  process.stdout.write(`  zentao bug resolve --id <bugId> [--resolution fixed] [--resolvedBuild trunk] [--assignedTo acc] [--duplicateBug id] [--comment text] [--json]\n`);
  process.stdout.write(`  zentao bug close --id <bugId> [--comment text] [--json]\n`);
  process.stdout.write(`  zentao bug activate --id <bugId> [--assignedTo acc] [--openedBuild build] [--comment text] [--json]\n`);
  process.stdout.write(`  zentao bug confirm --id <bugId> [--assignedTo acc] [--pri N] [--type codeerror] [--deadline YYYY-MM-DD] [--comment text] [--json]\n`);
  process.stdout.write(`  zentao bug assign --id <bugId> --assignedTo <acc> [--comment text] [--mailto a,b] [--json]\n`);
  process.stdout.write(`  zentao bug append-steps --id <bugId> --html <html> [--marker text] [--json]\n`);
  process.stdout.write(`\n`);
  process.stdout.write(`Notes:\n`);
  process.stdout.write(`  comment uses ZenTao session API (REST PUT comment is ignored on 22.x).\n`);
  process.stdout.write(`  append-steps edits the bug steps/repro field via REST PUT.\n`);
  process.stdout.write(`  --with-images downloads inline screenshots (fileID in steps/comments) via REST /files/:id.\n`);
  process.stdout.write(`  default image cache: ~/.cache/zentao/files (or $XDG_CACHE_HOME/zentao/files).\n`);
}

function formatAccount(value) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") return String(value.account || value.name || value.realname || "");
  return "";
}

export function formatBugSimple(bug) {
  const header = [
    "id",
    "title",
    "status",
    "pri",
    "severity",
    "assignedTo",
    "openedBy",
    "resolvedBy",
  ].join("\t");
  const row = [
    String(bug?.id ?? ""),
    String(bug?.title ?? ""),
    String(bug?.status ?? ""),
    String(bug?.pri ?? ""),
    String(bug?.severity ?? ""),
    formatAccount(bug?.assignedTo),
    formatAccount(bug?.openedBy),
    formatAccount(bug?.resolvedBy),
  ].join("\t");
  return `${header}\n${row}\n`;
}

function unwrapBug(result) {
  const payload = result?.result;
  if (!payload || typeof payload !== "object") return null;
  if (payload.bug && typeof payload.bug === "object") return payload.bug;
  if (payload.id !== undefined || payload.title !== undefined) return payload;
  return null;
}

function isTruthyFlag(value) {
  if (value === true) return true;
  if (value === false || value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function writeResult(result, cliArgs, { asBug = false } = {}) {
  if (cliArgs.json || !asBug) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const bug = unwrapBug(result);
  if (!bug) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(formatBugSimple(bug));
  const images = Array.isArray(bug.images) ? bug.images : [];
  if (images.length) {
    process.stdout.write(`images\t${images.length}\n`);
    for (const image of images) {
      process.stdout.write(
        `${image.fileId ?? ""}\t${image.filename ?? ""}\t${image.size ?? ""}\t${image.path ?? image.url ?? ""}\n`
      );
    }
  }
}

function requireId(cliArgs) {
  if (!cliArgs.id) throw new Error("Missing --id");
  return cliArgs.id;
}

function requireComment(cliArgs) {
  if (!cliArgs.comment) throw new Error("Missing --comment");
  return cliArgs.comment;
}

export async function runBug({ argv = [], env = process.env } = {}) {
  if (hasHelpFlag(argv)) {
    printHelp();
    return;
  }

  const { command: sub, argv: argvWithoutSub } = extractCommand(argv);
  const cliArgs = parseCliArgs(argvWithoutSub);
  const api = createClientFromCli({ argv: argvWithoutSub, env });

  if (sub === "get") {
    const id = requireId(cliArgs);
    const withImages =
      isTruthyFlag(cliArgs["with-images"]) ||
      isTruthyFlag(cliArgs.withImages) ||
      isTruthyFlag(cliArgs["download-images"]);
    const outDir = cliArgs["out-dir"] || cliArgs.outDir;
    const result = await api.getBug({
      id,
      withImages,
      downloadImages: withImages,
      outDir,
    });
    // Prefer JSON when images are requested so agents get paths + metadata.
    const outputArgs = withImages && !cliArgs.json ? { ...cliArgs, json: true } : cliArgs;
    writeResult(result, outputArgs, { asBug: true });
    return;
  }

  if (sub === "file" || sub === "download-file") {
    const id = requireId(cliArgs);
    const result = await api.downloadFile({
      id,
      outPath: cliArgs.out,
      outDir: cliArgs["out-dir"] || cliArgs.outDir,
    });
    writeResult({ status: 1, msg: "success", result }, { ...cliArgs, json: true });
    return;
  }

  if (sub === "comment") {
    const id = requireId(cliArgs);
    const comment = requireComment(cliArgs);
    const result = await api.commentBug({ id, comment });
    writeResult(result, cliArgs);
    return;
  }

  if (sub === "resolve") {
    const id = requireId(cliArgs);
    const result = await api.resolveBug({
      id,
      resolution: cliArgs.resolution,
      resolvedBuild: cliArgs.resolvedBuild || cliArgs["resolved-build"],
      assignedTo: cliArgs.assignedTo || cliArgs["assigned-to"],
      duplicateBug: cliArgs.duplicateBug || cliArgs["duplicate-bug"],
      comment: cliArgs.comment,
    });
    writeResult(result, cliArgs, { asBug: true });
    return;
  }

  if (sub === "close") {
    const id = requireId(cliArgs);
    const result = await api.closeBug({ id, comment: cliArgs.comment });
    writeResult(result, cliArgs, { asBug: true });
    return;
  }

  if (sub === "activate" || sub === "active") {
    const id = requireId(cliArgs);
    const result = await api.activateBug({
      id,
      assignedTo: cliArgs.assignedTo || cliArgs["assigned-to"],
      openedBuild: cliArgs.openedBuild || cliArgs["opened-build"],
      comment: cliArgs.comment,
    });
    writeResult(result, cliArgs, { asBug: true });
    return;
  }

  if (sub === "confirm") {
    const id = requireId(cliArgs);
    const result = await api.confirmBug({
      id,
      assignedTo: cliArgs.assignedTo || cliArgs["assigned-to"],
      comment: cliArgs.comment,
      pri: cliArgs.pri,
      type: cliArgs.type,
      deadline: cliArgs.deadline,
    });
    writeResult(result, cliArgs, { asBug: true });
    return;
  }

  if (sub === "assign") {
    const id = requireId(cliArgs);
    const assignedTo = cliArgs.assignedTo || cliArgs["assigned-to"];
    if (!assignedTo) throw new Error("Missing --assignedTo");
    const mailto = cliArgs.mailto
      ? String(cliArgs.mailto)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined;
    const result = await api.assignBug({
      id,
      assignedTo,
      comment: cliArgs.comment,
      mailto,
    });
    writeResult(result, cliArgs, { asBug: true });
    return;
  }

  if (sub === "append-steps") {
    const id = requireId(cliArgs);
    const html = cliArgs.html;
    if (!html) throw new Error("Missing --html");
    const result = await api.appendBugSteps({
      id,
      html,
      marker: cliArgs.marker,
    });
    writeResult(result, cliArgs, { asBug: true });
    return;
  }

  throw new Error(`Unknown bug subcommand: ${sub || "(missing)"}`);
}

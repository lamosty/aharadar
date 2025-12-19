import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { inboxCommand } from "./commands/inbox";
import { reviewCommand } from "./commands/review";
import { searchCommand } from "./commands/search";
import {
  adminBudgetsCommand,
  adminRunNowCommand,
  adminSignalDebugCommand,
  adminSignalResetCursorCommand,
} from "./commands/admin";

type CommandResult = void | Promise<void>;

function loadDotEnvIfPresent(): void {
  const cwd = process.cwd();
  for (const filename of [".env", ".env.local"]) {
    const fullPath = resolve(cwd, filename);
    if (!existsSync(fullPath)) continue;
    const raw = readFileSync(fullPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function printHelp(): void {
  console.log("aharadar CLI");
  console.log("");
  console.log("Commands:");
  console.log("  inbox");
  console.log("  review");
  console.log("  search <query>");
  console.log("  admin:run-now");
  console.log("  admin:budgets");
  console.log("  admin:signal-debug [--limit N] [--json] [--raw]");
  console.log("  admin:signal-reset-cursor [--clear] [--since-time <ISO>]");
}

async function main(): Promise<void> {
  loadDotEnvIfPresent();

  let [cmd, ...rest] = process.argv.slice(2);
  // pnpm often forwards the argument separator through to the script as a literal "--".
  if (cmd === "--") {
    [cmd, ...rest] = rest;
  }

  let result: CommandResult;
  switch (cmd) {
    case "inbox":
      result = inboxCommand();
      break;
    case "review":
      result = reviewCommand();
      break;
    case "search":
      result = searchCommand(rest.join(" "));
      break;
    case "admin:run-now":
      result = adminRunNowCommand();
      break;
    case "admin:budgets":
      result = adminBudgetsCommand();
      break;
    case "admin:signal-debug":
      result = adminSignalDebugCommand(rest);
      break;
    case "admin:signal-reset-cursor":
      result = adminSignalResetCursorCommand(rest);
      break;
    default:
      printHelp();
      result = undefined;
      break;
  }

  await result;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

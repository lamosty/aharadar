import { loadDotEnvIfPresent } from "@aharadar/shared";
import {
  adminBudgetsCommand,
  adminDigestNowCommand,
  adminEmbedNowCommand,
  adminRunNowCommand,
  adminSignalDebugCommand,
  adminSignalExplodeBundlesCommand,
  adminSignalResetCursorCommand,
  adminSourcesAddCommand,
  adminSourcesListCommand,
  adminSourcesSetCadenceCommand,
  adminSourcesSetEnabledCommand,
  adminSourcesSetTopicCommand,
  adminSourcesSetWeightCommand,
  adminTopicsAddCommand,
  adminTopicsListCommand,
} from "./commands/admin";
import { askCommand } from "./commands/ask";
import { inboxCommand } from "./commands/inbox";
import { reviewCommand } from "./commands/review";
import { searchCommand } from "./commands/search";

type CommandResult = void | Promise<void>;

function printHelp(): void {
  console.log("aharadar CLI");
  console.log("");
  console.log("Commands:");
  console.log('  ask [--topic <id-or-name>] [--max-clusters N] "<question>"');
  console.log("  inbox [--cards|--table] [--topic <id-or-name>]");
  console.log("  review [--topic <id-or-name>]");
  console.log('  search [--topic <id-or-name>] [--limit N] "<query>"');
  console.log(
    "  admin:run-now [--topic <id-or-name>] [--max-items-per-source N] [--source-type <type>[,<type>...]] [--source-id <uuid>]",
  );
  console.log("  admin:embed-now [--topic <id-or-name>] [--max-items N]");
  console.log(
    "  admin:digest-now [--topic <id-or-name>] [--max-items N] [--source-type <type>[,<type>...]] [--source-id <uuid>]",
  );
  console.log("  admin:budgets");
  console.log("  admin:topics-list");
  console.log("  admin:topics-add --name <name> [--description <text>]");
  console.log("  admin:sources-list");
  console.log(
    "  admin:sources-add --type <type> --name <name> [--topic <id-or-name>] [--config <json>] [--cursor <json>]",
  );
  console.log("  admin:sources-set-topic --source-id <uuid> --topic <id-or-name>");
  console.log(
    "  admin:sources-set-cadence (--source-id <uuid> | --topic <name> --source-type <type>) (--every-minutes <int> | --clear) [--dry-run]",
  );
  console.log(
    "  admin:sources-set-weight (--source-id <uuid> | --topic <name> --source-type <type>) --weight <number> [--dry-run]",
  );
  console.log(
    "  admin:sources-set-enabled (--source-id <uuid> | --topic <name> --source-type <type>) --enabled <true|false> [--dry-run]",
  );
  console.log("  admin:signal-debug [--kind bundle] [--limit N] [--verbose] [--json] [--raw]");
  console.log("  admin:signal-explode-bundles [--limit N] [--dry-run] [--delete-bundles]");
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
    case "ask":
      result = askCommand(rest);
      break;
    case "inbox":
      result = inboxCommand(rest);
      break;
    case "review":
      result = reviewCommand(rest);
      break;
    case "search":
      result = searchCommand(rest);
      break;
    case "admin:run-now":
      result = adminRunNowCommand(rest);
      break;
    case "admin:embed-now":
      result = adminEmbedNowCommand(rest);
      break;
    case "admin:digest-now":
      result = adminDigestNowCommand(rest);
      break;
    case "admin:budgets":
      result = adminBudgetsCommand();
      break;
    case "admin:signal-debug":
      result = adminSignalDebugCommand(rest);
      break;
    case "admin:signal-explode-bundles":
      result = adminSignalExplodeBundlesCommand(rest);
      break;
    case "admin:signal-reset-cursor":
      result = adminSignalResetCursorCommand(rest);
      break;
    case "admin:topics-list":
      result = adminTopicsListCommand();
      break;
    case "admin:topics-add":
      result = adminTopicsAddCommand(rest);
      break;
    case "admin:sources-list":
      result = adminSourcesListCommand();
      break;
    case "admin:sources-add":
      result = adminSourcesAddCommand(rest);
      break;
    case "admin:sources-set-topic":
      result = adminSourcesSetTopicCommand(rest);
      break;
    case "admin:sources-set-cadence":
      result = adminSourcesSetCadenceCommand(rest);
      break;
    case "admin:sources-set-weight":
      result = adminSourcesSetWeightCommand(rest);
      break;
    case "admin:sources-set-enabled":
      result = adminSourcesSetEnabledCommand(rest);
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

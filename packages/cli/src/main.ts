import { inboxCommand } from "./commands/inbox";
import { reviewCommand } from "./commands/review";
import { searchCommand } from "./commands/search";
import { adminBudgetsCommand, adminRunNowCommand } from "./commands/admin";

// Minimal placeholder CLI router (no deps yet).
// Next agent can replace with a proper CLI framework if desired.
const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case "inbox":
    inboxCommand();
    break;
  case "review":
    reviewCommand();
    break;
  case "search":
    searchCommand(rest.join(" "));
    break;
  case "admin:run-now":
    adminRunNowCommand();
    break;
  case "admin:budgets":
    adminBudgetsCommand();
    break;
  default:
    console.log("aharadar CLI (stub)");
    console.log("Commands:");
    console.log("  inbox");
    console.log("  review");
    console.log("  search <query>");
    console.log("  admin:run-now");
    console.log("  admin:budgets");
    break;
}



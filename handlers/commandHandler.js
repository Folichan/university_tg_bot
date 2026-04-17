import { handleStartCommand } from "../controllers/startController.js";
import { handlePendingGroupsCommand } from "../controllers/adminController.js";
import { handlePendingPublishCommand } from "../controllers/curatorController.js";
import { startSetRoleCommand } from "../controllers/adminRoleController.js";

export function registerCommandHandlers(bot) {
  bot.onText(/\/start/, (msg) => handleStartCommand(bot, msg));
  bot.onText(/\/pending_groups/, (msg) => handlePendingGroupsCommand(bot, msg));
  bot.onText(/\/pending_publish/, (msg) => handlePendingPublishCommand(bot, msg));
  bot.onText(/\/set_role/, (msg) => startSetRoleCommand(bot, msg));
}

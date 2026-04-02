import { handleCallback } from "../controllers/callbackRouter.js";

export function registerCallbackHandlers(bot) {
  bot.on("callback_query", (query) => handleCallback(bot, query));
}

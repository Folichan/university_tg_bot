import TelegramBot from "node-telegram-bot-api";
import { BOT_TOKEN } from "./config/env.js";
import { registerCommandHandlers } from "./handlers/commandHandler.js";
import { registerMessageHandlers } from "./handlers/messageHandler.js";
import { registerCallbackHandlers } from "./handlers/callbackHandler.js";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

registerCommandHandlers(bot);
registerMessageHandlers(bot);
registerCallbackHandlers(bot);

console.log("Bot started");

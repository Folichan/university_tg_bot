import { clearState } from "../state/sessionState.js";

export async function handleCancelAction(bot, query) {
  const tgId = query.from.id;
  const chatId = query.message.chat.id;

  clearState(tgId);

  await bot.answerCallbackQuery(query.id, { text: "Действие отменено" });
  await bot.sendMessage(chatId, "Текущее действие отменено ❌");
}
export async function sendProcessingMessage(bot, chatId, text = "⏳ Запрос выполняется...") {
  return bot.sendMessage(chatId, text);
}
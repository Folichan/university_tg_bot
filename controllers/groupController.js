import { requestNewGroup } from "../services/groupService.js";

export async function handleNewGroupName(bot, msg, state) {
  const tgId = msg.from.id;
  const chatId = msg.chat.id;
  const groupName = msg.text.trim();

  const result = await requestNewGroup(tgId, groupName);

  if (!result.ok) {
    await bot.sendMessage(chatId, result.message);
    return;
  }

  state.clearState(tgId);
  await bot.sendMessage(chatId, result.message + " ✅");
}

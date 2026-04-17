import { setState, getState, clearState } from "../state/sessionState.js";
import { STEPS } from "../constants/steps.js";
import { getUserGroupId } from "../services/groupService.js";
import { isCuratorOfGroup } from "../services/rolesService.js";
import { getGroupMembers } from "../services/groupService.js";

export async function startGroupNotification(bot, query) {
  const tgId = query.from.id;
  const chatId = query.message.chat.id;

  const groupId = await getUserGroupId(tgId);
  if (!groupId) {
    await bot.sendMessage(chatId, "Сначала выбери группу.");
    return;
  }

  const allowed = await isCuratorOfGroup(tgId, groupId);
  if (!allowed) {
    await bot.sendMessage(chatId, "Только куратор группы может отправлять уведомления.");
    return;
  }

  setState(tgId, STEPS.CURATOR_NOTIFY_TEXT, { groupId });

  await bot.sendMessage(chatId, "Введите текст уведомления для группы:");
}

export async function handleGroupNotificationText(bot, msg) {
  const tgId = msg.from.id;
  const chatId = msg.chat.id;
  const session = getState(tgId);

  const groupId = session.temp?.groupId;
  if (!groupId) {
    await bot.sendMessage(chatId, "Группа не найдена. Начни заново.");
    return;
  }

  const text = msg.text.trim();
  if (text.length < 1) {
    await bot.sendMessage(chatId, "Текст уведомления не должен быть пустым.");
    return;
  }

  const allowed = await isCuratorOfGroup(tgId, groupId);
  if (!allowed) {
    clearState(tgId);
    await bot.sendMessage(chatId, "Недостаточно прав для отправки уведомления.");
    return;
  }

  const members = await getGroupMembers(groupId);

  let successCount = 0;

  for (const memberTgId of members) {
    try {
      await bot.sendMessage(
        memberTgId,
        `📢 Уведомление от куратора группы:\n\n${text}`
      );
      successCount++;
    } catch (error) {
      console.error(`Не удалось отправить уведомление пользователю ${memberTgId}`, error.message);
    }
  }

  clearState(tgId);

  await bot.sendMessage(
    chatId,
    `Уведомление отправлено. Доставлено: ${successCount}`
  );
}
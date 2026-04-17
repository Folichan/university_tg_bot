import { setState, getState, clearState } from "../state/sessionState.js";
import { STEPS } from "../constants/steps.js";
import { getGroupsPage } from "../services/groupsService.js";
import {
  ensureUserExists,
  getUsersByGroup,
  setStudentRole,
  setCuratorRole,
  getUserRole,
} from "../services/rolesService.js";
import {
  buildRoleEntryKeyboard,
  buildRoleChoiceKeyboard,
  buildGroupsKeyboard,
  buildUsersKeyboard,
} from "../keyboards/rolesKeyboard.js";

export async function startSetRoleCommand(bot, msg) {
  const adminTgId = msg.from.id;
  const chatId = msg.chat.id;

  const role = await getUserRole(adminTgId);
  if (role !== "admin") {
    await bot.sendMessage(chatId, "Команда доступна только администратору.");
    return;
  }

  setState(adminTgId, STEPS.ROLE_MENU, {});
  await bot.sendMessage(chatId, "Выберите способ назначения роли:", {
    reply_markup: buildRoleEntryKeyboard(),
  });
}

export async function startRoleByGroupList(bot, query) {
  const adminTgId = query.from.id;
  const chatId = query.message.chat.id;

  const { rows } = await getGroupsPage(0);

  setState(adminTgId, STEPS.ROLE_PICK_GROUP_FROM_LIST, {});
  await bot.sendMessage(chatId, "Выберите группу:", {
    reply_markup: buildGroupsKeyboard(rows),
  });
}

export async function handlePickGroupFromList(bot, query, groupId) {
  const adminTgId = query.from.id;
  const chatId = query.message.chat.id;

  const users = await getUsersByGroup(groupId);

  if (!users.length) {
    await bot.sendMessage(chatId, "В этой группе пока нет пользователей.");
    return;
  }

  setState(adminTgId, STEPS.ROLE_PICK_USER_FROM_GROUP, { groupId });

  await bot.sendMessage(chatId, "Выберите пользователя:", {
    reply_markup: buildUsersKeyboard(users),
  });
}

export async function handlePickUserFromGroup(bot, query, targetTgId) {
  const adminTgId = query.from.id;
  const chatId = query.message.chat.id;
  const session = getState(adminTgId);

  setState(adminTgId, STEPS.ROLE_PICK_TYPE, {
    groupId: session.temp.groupId,
    targetTgId,
  });

  await bot.sendMessage(chatId, `Выберите роль для пользователя ${targetTgId}:`, {
    reply_markup: buildRoleChoiceKeyboard(),
  });
}

export async function startRoleById(bot, query) {
  const adminTgId = query.from.id;
  const chatId = query.message.chat.id;

  setState(adminTgId, STEPS.ROLE_BY_ID_INPUT, {});
  await bot.sendMessage(chatId, "Введите Telegram ID пользователя:");
}

export async function handleRoleByIdInput(bot, msg) {
  const adminTgId = msg.from.id;
  const chatId = msg.chat.id;
  const input = msg.text.trim();

  if (!/^\d+$/.test(input)) {
    await bot.sendMessage(chatId, "Telegram ID должен состоять только из цифр.");
    return;
  }

  const targetTgId = Number(input);
  await ensureUserExists(targetTgId);

  setState(adminTgId, STEPS.ROLE_PICK_TYPE, { targetTgId });

  await bot.sendMessage(chatId, `Выберите роль для пользователя ${targetTgId}:`, {
    reply_markup: buildRoleChoiceKeyboard(),
  });
}

export async function handleSetStudentRole(bot, query) {
  const adminTgId = query.from.id;
  const chatId = query.message.chat.id;
  const session = getState(adminTgId);

  const targetTgId = session.temp?.targetTgId;
  if (!targetTgId) {
    await bot.sendMessage(chatId, "Сессия назначения роли не найдена. Начните заново: /set_role");
    return;
  }

  await setStudentRole(targetTgId);
  clearState(adminTgId);

  await bot.sendMessage(chatId, `Пользователю ${targetTgId} назначена роль "Участник" ✅`);
}

export async function handleSetCuratorStart(bot, query) {
  const adminTgId = query.from.id;
  const chatId = query.message.chat.id;
  const session = getState(adminTgId);

  const targetTgId = session.temp?.targetTgId;
  if (!targetTgId) {
    await bot.sendMessage(chatId, "Сессия назначения роли не найдена. Начните заново: /set_role");
    return;
  }

  if (session.temp.groupId) {
    await setCuratorRole(targetTgId, session.temp.groupId);
    clearState(adminTgId);
    await bot.sendMessage(chatId, `Пользователь ${targetTgId} назначен куратором группы ✅`);
    return;
  }

  const { rows } = await getGroupsPage(0);

  setState(adminTgId, STEPS.ROLE_PICK_GROUP_FOR_CURATOR, {
    ...session.temp,
    targetTgId,
  });

  await bot.sendMessage(chatId, "Выберите группу для куратора:", {
    reply_markup: buildGroupsKeyboard(rows, "role:curator:group:"),
  });
}

export async function handleSetCuratorGroup(bot, query, groupId) {
  const adminTgId = query.from.id;
  const chatId = query.message.chat.id;
  const session = getState(adminTgId);

  const targetTgId = session.temp?.targetTgId;
  if (!targetTgId) {
    await bot.sendMessage(chatId, "Сессия назначения роли не найдена. Начните заново: /set_role");
    return;
  }

  await setCuratorRole(targetTgId, groupId);
  clearState(adminTgId);

  await bot.sendMessage(chatId, `Пользователь ${targetTgId} назначен куратором группы ✅`);
}
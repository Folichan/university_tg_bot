import { getUserRole } from "../services/usersService.js";
import { createTask, createTaskPublishRequest } from "../services/tasksService.js";
import {
  buildStudentTaskScopeKeyboard,
  buildCuratorTaskScopeKeyboard,
} from "../keyboards/tasksKeyboard.js";
import { getState, clearState } from "../state/sessionState.js";

export async function showTaskScopeChoice(bot, chatId, tgId) {
  const role = await getUserRole(tgId);

  if (role === "curator") {
    await bot.sendMessage(chatId, "Как добавить задачу?", {
      reply_markup: buildCuratorTaskScopeKeyboard(),
    });
    return;
  }

  await bot.sendMessage(chatId, "Как добавить задачу?", {
    reply_markup: buildStudentTaskScopeKeyboard(),
  });
}

export async function handleTaskScopeSelection(bot, query, mode) {
  const tgId = query.from.id;
  const chatId = query.message.chat.id;
  const session = getState(tgId);

  const { groupId, subjectId, title, description, dueDate } = session.temp;
  const role = await getUserRole(tgId);

  if (!groupId || !title || !dueDate) {
    await bot.sendMessage(chatId, "Данные задачи не найдены. Начни создание заново.");
    return;
  }

  if (mode === "personal") {
    const taskId = await createTask({
      tgId,
      groupId,
      subjectId,
      title,
      description,
      dueDate,
      scope: "personal",
    });

    clearState(tgId);
    await bot.sendMessage(chatId, `Задача создана только для тебя ✅\nID: ${taskId}`);
    return;
  }

  if (mode === "group") {
    if (role !== "curator" && role !== "admin") {
      await bot.sendMessage(chatId, "Недостаточно прав для добавления задачи всей группе.");
      return;
    }

    const taskId = await createTask({
      tgId,
      groupId,
      subjectId,
      title,
      description,
      dueDate,
      scope: "group",
    });

    clearState(tgId);
    await bot.sendMessage(chatId, `Задача добавлена всей группе ✅\nID: ${taskId}`);
    return;
  }

  if (mode === "ask_group") {
    const taskId = await createTask({
      tgId,
      groupId,
      subjectId,
      title,
      description,
      dueDate,
      scope: "personal",
    });

    await createTaskPublishRequest(taskId, groupId, tgId);
    clearState(tgId);

    await bot.sendMessage(chatId, `Задача создана и отправлена куратору на рассмотрение ✅\nID: ${taskId}`);
    return;
  }
}
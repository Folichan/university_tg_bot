import { getUserGroupId } from "../services/groupService.js";
import { getUserRole } from "../services/rolesService.js";
import { isCuratorOfGroup } from "../services/rolesService.js";
import {
  subjectExists,
  createPersonalSubject,
  createGroupSubject,
  createSubjectRequest,
  getGroupSubjects,
  getSubjectById,
  deleteSubject,
} from "../services/subjectsService.js";
import {
  buildStudentSubjectAddKeyboard,
  buildCuratorSubjectAddKeyboard,
  buildGroupSubjectsKeyboard,
} from "../keyboards/subjectKeyboard.js";
import { setState, getState, clearState } from "../state/sessionState.js";
import { STEPS } from "../constants/steps.js";

export async function showSubjectAddMenu(bot, chatId, tgId) {
  const groupId = await getUserGroupId(tgId);
  if (!groupId) {
    await bot.sendMessage(chatId, "Сначала выбери группу.");
    return;
  }

  const role = await getUserRole(tgId);
  const isCurator = await isCuratorOfGroup(tgId, groupId);

  const keyboard =
    role === "admin" || isCurator
      ? buildCuratorSubjectAddKeyboard()
      : buildStudentSubjectAddKeyboard();

  await bot.sendMessage(chatId, "Выбери действие с предметами:", {
    reply_markup: keyboard,
  });
}

export async function startAddPersonalSubject(bot, query) {
  const tgId = query.from.id;
  const chatId = query.message.chat.id;

  setState(tgId, STEPS.SUBJECT_NAME, { subjectMode: "personal" });
  await bot.sendMessage(chatId, "Введите название предмета:");
}

export async function startAddGroupSubjectRequest(bot, query) {
  const tgId = query.from.id;
  const chatId = query.message.chat.id;

  setState(tgId, STEPS.SUBJECT_NAME, { subjectMode: "group_request" });
  await bot.sendMessage(chatId, "Введите название предмета для группы:");
}

export async function startAddGroupSubjectDirect(bot, query) {
  const tgId = query.from.id;
  const chatId = query.message.chat.id;
  const groupId = await getUserGroupId(tgId);

  if (!groupId) {
    await bot.sendMessage(chatId, "Сначала выбери группу.");
    return;
  }

  const allowed = await isCuratorOfGroup(tgId, groupId);
  if (!allowed) {
    await bot.sendMessage(chatId, "Только куратор может сразу добавлять предмет группе.");
    return;
  }

  setState(tgId, STEPS.SUBJECT_NAME, { subjectMode: "group_direct" });
  await bot.sendMessage(chatId, "Введите название предмета для всей группы:");
}

export async function handleSubjectNameInput(bot, msg) {
  const tgId = msg.from.id;
  const chatId = msg.chat.id;
  const session = getState(tgId);
  const groupId = await getUserGroupId(tgId);

  if (!groupId) {
    await bot.sendMessage(chatId, "Сначала выбери группу.");
    return;
  }

  const name = msg.text.trim();
  if (name.length < 2) {
    await bot.sendMessage(chatId, "Название слишком короткое. Введи ещё раз.");
    return;
  }

  const mode = session.temp?.subjectMode;

  if (mode === "personal") {
    const exists = await subjectExists(groupId, name, "personal", tgId);
    if (exists) {
      await bot.sendMessage(chatId, "У тебя уже есть такой личный предмет.");
      return;
    }

    await createPersonalSubject(tgId, groupId, name);
    clearState(tgId);
    await bot.sendMessage(chatId, "Личный предмет добавлен ✅");
    return;
  }

  if (mode === "group_request") {
    const exists = await subjectExists(groupId, name, "group", null);
    if (exists) {
      await bot.sendMessage(chatId, "Такой предмет уже есть в группе.");
      return;
    }

    await createSubjectRequest(tgId, groupId, name, "group");
    clearState(tgId);
    await bot.sendMessage(chatId, "Заявка на добавление предмета отправлена куратору ✅");
    return;
  }

  if (mode === "group_direct") {
    const allowed = await isCuratorOfGroup(tgId, groupId);
    if (!allowed) {
      clearState(tgId);
      await bot.sendMessage(chatId, "Недостаточно прав.");
      return;
    }

    const exists = await subjectExists(groupId, name, "group", null);
    if (exists) {
      await bot.sendMessage(chatId, "Такой предмет уже есть в группе.");
      return;
    }

    await createGroupSubject(groupId, name);
    clearState(tgId);
    await bot.sendMessage(chatId, "Предмет добавлен для всей группы ✅");
    return;
  }

  await bot.sendMessage(chatId, "Режим добавления предмета не найден.");
}

export async function startDeleteGroupSubject(bot, query) {
  const tgId = query.from.id;
  const chatId = query.message.chat.id;
  const groupId = await getUserGroupId(tgId);

  if (!groupId) {
    await bot.sendMessage(chatId, "Сначала выбери группу.");
    return;
  }

  const allowed = await isCuratorOfGroup(tgId, groupId);
  if (!allowed) {
    await bot.sendMessage(chatId, "Удалять предметы группы может только куратор.");
    return;
  }

  const subjects = await getGroupSubjects(groupId);

  if (!subjects.length) {
    await bot.sendMessage(chatId, "В группе пока нет предметов.");
    return;
  }

  setState(tgId, STEPS.SUBJECT_DELETE_PICK, { groupId });

  await bot.sendMessage(chatId, "Выбери предмет, который нужно удалить:", {
    reply_markup: buildGroupSubjectsKeyboard(subjects),
  });
}

export async function handleDeleteGroupSubject(bot, query, subjectId) {
  const tgId = query.from.id;
  const chatId = query.message.chat.id;
  const groupId = await getUserGroupId(tgId);

  if (!groupId) {
    await bot.sendMessage(chatId, "Сначала выбери группу.");
    return;
  }

  const allowed = await isCuratorOfGroup(tgId, groupId);
  if (!allowed) {
    await bot.sendMessage(chatId, "Недостаточно прав.");
    return;
  }

  const subject = await getSubjectById(subjectId);
  if (!subject) {
    await bot.sendMessage(chatId, "Предмет не найден.");
    return;
  }

  if (subject.group_id !== groupId || subject.scope !== "group") {
    await bot.sendMessage(chatId, "Можно удалять только групповые предметы текущей группы.");
    return;
  }

  await deleteSubject(subjectId);
  clearState(tgId);

  await bot.sendMessage(chatId, `Предмет "${subject.name}" удалён ✅`);
}
import { appendCancelButton } from "../utils/keyboard.js";

export function buildRoleEntryKeyboard() {
  return appendCancelButton({
    inline_keyboard: [
      [{ text: "📚 Выбрать группу", callback_data: "role:entry:group_list" }],
      [{ text: "🆔 Указать роль по ID пользователя", callback_data: "role:entry:by_id" }],
    ],
  });
}

export function buildRoleChoiceKeyboard() {
  return appendCancelButton({
    inline_keyboard: [
      [{ text: "👤 Участник", callback_data: "role:set:student" }],
      [{ text: "🎓 Куратор группы", callback_data: "role:set:curator" }],
    ],
  });
}

export function buildGroupsKeyboard(groups, prefix = "role:group:list:") {
  return {
    inline_keyboard: groups.map(group => [
      { text: group.name, callback_data: `${prefix}${group.id}` }
    ]),
  };
}

export function buildUsersKeyboard(users) {
  return appendCancelButton({
    inline_keyboard: users.map(user => [
      { text: `${user.tg_id} (${user.role})`, callback_data: `role:user:pick:${user.tg_id}` }
    ]),
  });
}
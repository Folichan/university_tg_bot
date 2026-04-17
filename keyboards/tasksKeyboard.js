export function buildStudentTaskScopeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 Только для себя", callback_data: "task:scope:personal" }],
      [{ text: "📨 Запрос куратору для всей группы", callback_data: "task:scope:ask_group" }],
    ],
  };
}

export function buildCuratorTaskScopeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 Только для себя", callback_data: "task:scope:personal" }],
      [{ text: "👥 Добавить всей группе", callback_data: "task:scope:group" }],
    ],
  };
}
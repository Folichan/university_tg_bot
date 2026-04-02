export function buildMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🗒 Задачи", callback_data: "menu:tasks" }],
      [{ text: "➕ Добавить задачу", callback_data: "menu:add_task" }],
      [{ text: "✅ Отметить выполненной", callback_data: "menu:done_pick" }],
    ],
  };
}

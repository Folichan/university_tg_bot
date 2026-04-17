export function buildMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🗒 Задачи", callback_data: "menu:tasks" }],
      [{ text: "➕ Добавить задачу", callback_data: "menu:add_task" }],
      [{ text: "✅ Отметить выполненной", callback_data: "menu:done_pick" }],
    ],
  };
}

export function buildCuratorMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🗒 Задачи", callback_data: "menu:tasks" }],
      [{ text: "➕ Добавить задачу", callback_data: "menu:add_task" }],
      [{ text: "✅ Отметить выполненной", callback_data: "menu:done_pick" }],
      [{ text: "📢 Отправить уведомление группе", callback_data: "menu:notify_group" }],
      [{ text: "📚 Управление предметами", callback_data: "menu:subjects" }],
    ],
  };
}
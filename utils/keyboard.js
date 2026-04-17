export function appendCancelButton(keyboard) {
  return {
    inline_keyboard: [
      ...(keyboard.inline_keyboard || []),
      [{ text: "❌ Отмена", callback_data: "common:cancel" }],
    ],
  };
}
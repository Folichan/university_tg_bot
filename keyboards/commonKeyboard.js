export function buildCancelKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "❌ Отмена", callback_data: "common:cancel" }],
    ],
  };
}
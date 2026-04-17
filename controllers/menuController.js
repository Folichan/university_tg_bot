import { getUserRole } from "../services/rolesService.js";
import {
  buildStudentMenuKeyboard,
  buildCuratorMenuKeyboard,
} from "../keyboards/menuKeyboard.js";

export async function showMainMenu(bot, chatId, tgId) {
  const role = await getUserRole(tgId);

  const keyboard =
    role === "curator" || role === "admin"
      ? buildCuratorMenuKeyboard()
      : buildStudentMenuKeyboard();

  await bot.sendMessage(chatId, "Меню:", {
    reply_markup: keyboard,
  });
}
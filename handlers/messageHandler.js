import { getState } from "../state/sessionState.js";
import { STEPS } from "../constants/steps.js";
import { handleGroupTextInput } from "../controllers/groupController.js";
import { handleTaskWizardMessage } from "../controllers/taskController.js";
import { handleSubjectNameInput } from "../controllers/subjectController.js";
import { handleRoleByIdInput } from "../controllers/adminRoleController.js";
import { handleGroupNotificationText } from "../controllers/curatorController.js";

export function registerMessageHandlers(bot) {
  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;

    const tgId = msg.from.id;
    const session = getState(tgId);
    const text = msg.text.trim().toLowerCase();

    if (text === "отмена" || text === "/cancel") {
      clearState(msg.from.id);
      await bot.sendMessage(msg.chat.id, "Текущее действие отменено ❌");
      return;
    }
    
    if (session.step === STEPS.AWAIT_GROUP_PICK) {
      return handleGroupTextInput(bot, msg);
    }

    if (
      session.step === STEPS.TASK_TITLE ||
      session.step === STEPS.TASK_DESC ||
      session.step === STEPS.TASK_DUE
    ) {
      return handleTaskWizardMessage(bot, msg);
    }

    if (session.step === STEPS.SUBJECT_NAME) {
      return handleSubjectNameInput(bot, msg);
    }

    if (session.step === STEPS.ROLE_BY_ID_INPUT) {
      return handleRoleByIdInput(bot, msg);
    }

    if (session.step === STEPS.CURATOR_NOTIFY_TEXT) {
      return handleGroupNotificationText(bot, msg);
    }

    if (session.step === STEPS.SUBJECT_NAME) {
      return handleSubjectNameInput(bot, msg);
    }
  });
}

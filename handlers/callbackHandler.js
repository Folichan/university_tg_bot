import { handleCallback } from "../controllers/callbackRouter.js";
import { startGroupNotification } from "../controllers/curatorController.js";
import { handleCancelAction } from "../controllers/commonController.js";

import {
  startRoleByGroupList,
  handlePickGroupFromList,
  handlePickUserFromGroup,
  startRoleById,
  handleSetStudentRole,
  handleSetCuratorStart,
  handleSetCuratorGroup,
} from "../controllers/adminRoleController.js";
import { handleTaskScopeSelection } from "../controllers/taskController.js";
import {
  showSubjectAddMenu,
  startAddPersonalSubject,
  startAddGroupSubjectRequest,
  startAddGroupSubjectDirect,
  startDeleteGroupSubject,
  handleDeleteGroupSubject,
} from "../controllers/subjectController.js";

export function registerCallbackHandlers(bot) {
  bot.on("callback_query", async (query) => {
    const data = query.data || "";

    if (data === "common:cancel") {
      return handleCancelAction(bot, query);
    }

    if (data === "role:entry:group_list") {
      return startRoleByGroupList(bot, query);
    }

    if (data.startsWith("role:group:list:")) {
      const groupId = Number(data.split(":")[3]);
      return handlePickGroupFromList(bot, query, groupId);
    }

    if (data.startsWith("role:user:pick:")) {
      const targetTgId = Number(data.split(":")[3]);
      return handlePickUserFromGroup(bot, query, targetTgId);
    }

    if (data === "role:entry:by_id") {
      return startRoleById(bot, query);
    }

    if (data === "role:set:student") {
      return handleSetStudentRole(bot, query);
    }

    if (data === "role:set:curator") {
      return handleSetCuratorStart(bot, query);
    }

    if (data.startsWith("role:curator:group:")) {
      const groupId = Number(data.split(":")[3]);
      return handleSetCuratorGroup(bot, query, groupId);
    }

    if (data === "task:scope:personal") {
      return handleTaskScopeSelection(bot, query, "personal");
    }

    if (data === "task:scope:group") {
      return handleTaskScopeSelection(bot, query, "group");
    }

    if (data === "task:scope:ask_group") {
      return handleTaskScopeSelection(bot, query, "ask_group");
    }

    if (data === "menu:notify_group") {
      return startGroupNotification(bot, query);
    }

    if (data === "menu:subjects") {
      return showSubjectAddMenu(bot, query.message.chat.id, query.from.id);
    }

    if (data === "subject:add:personal") {
      return startAddPersonalSubject(bot, query);
    }

    if (data === "subject:add:group_request") {
      return startAddGroupSubjectRequest(bot, query);
    }

    if (data === "subject:add:group_direct") {
      return startAddGroupSubjectDirect(bot, query);
    }

    if (data === "subject:delete:start") {
      return startDeleteGroupSubject(bot, query);
    }

    if (data.startsWith("subject:delete:")) {
      const subjectId = Number(data.split(":")[2]);
      return handleDeleteGroupSubject(bot, query, subjectId);
    }
  });
}

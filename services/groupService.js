groupService.js
import * as groupRepository from "../repositories/groupRepository.js";
import * as requestRepository from "../repositories/requestRepository.js";

export async function requestNewGroup(tgId, groupName) {
  const exists = await groupRepository.findGroupByExactName(groupName);
  if (exists) {
    return { ok: false, message: "Такая группа уже существует" };
  }

  const pending = await requestRepository.findPendingGroupRequest(groupName);
  if (pending) {
    return { ok: false, message: "Заявка уже отправлена ранее" };
  }

  await requestRepository.createGroupRequest(tgId, groupName);

  return { ok: true, message: "Заявка отправлена администратору" };
}

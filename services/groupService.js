groupService.js
import * as groupRepository from "../repositories/groupRepository.js";
import * as requestRepository from "../repositories/requestRepository.js";
import { db } from "../db/pool.js";

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

export async function getGroupMembers(groupId) {
  const [rows] = await db.query(
    `SELECT user_tg_id
     FROM user_group
     WHERE group_id=?`,
    [groupId]
  );

  return rows.map(row => row.user_tg_id);
}

export async function getUserGroupId(tgId) {
  const [rows] = await db.query(
    `SELECT group_id
     FROM user_group
     WHERE user_tg_id=?`,
    [tgId]
  );

  return rows[0]?.group_id || null;
}

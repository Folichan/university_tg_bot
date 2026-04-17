import { db } from "../db/pool.js";

export async function getSubjectsForUser(tgId, groupId) {
  const [rows] = await db.query(
    `SELECT id, name, scope, owner_tg_id
     FROM subjects
     WHERE group_id=?
       AND (scope='group' OR (scope='personal' AND owner_tg_id=?))
     ORDER BY scope DESC, name ASC`,
    [groupId, tgId]
  );

  return rows;
}

export async function subjectExists(groupId, name, scope, ownerTgId = null) {
  const [rows] = await db.query(
    `SELECT id
     FROM subjects
     WHERE group_id=?
       AND LOWER(name)=LOWER(?)
       AND scope=?
       AND (owner_tg_id <=> ?)
     LIMIT 1`,
    [groupId, name.trim(), scope, ownerTgId]
  );

  return rows.length > 0;
}

export async function createPersonalSubject(tgId, groupId, name) {
  await db.query(
    `INSERT INTO subjects (group_id, name, scope, owner_tg_id)
     VALUES (?, ?, 'personal', ?)`,
    [groupId, name.trim(), tgId]
  );
}

export async function createGroupSubject(groupId, name) {
  await db.query(
    `INSERT INTO subjects (group_id, name, scope, owner_tg_id)
     VALUES (?, ?, 'group', NULL)`,
    [groupId, name.trim()]
  );
}

export async function createSubjectRequest(tgId, groupId, name, scope = "group") {
  await db.query(
    `INSERT INTO subject_requests (group_id, requested_name, requested_by_tg_id, scope)
     VALUES (?, ?, ?, ?)`,
    [groupId, name.trim(), tgId, scope]
  );
}

export async function deleteSubject(subjectId) {
  await db.query(
    `DELETE FROM subjects WHERE id=?`,
    [subjectId]
  );
}

export async function getGroupSubjects(groupId) {
  const [rows] = await db.query(
    `SELECT id, name
     FROM subjects
     WHERE group_id=? AND scope='group'
     ORDER BY name ASC`,
    [groupId]
  );

  return rows;
}

export async function getSubjectById(subjectId) {
  const [rows] = await db.query(
    `SELECT id, group_id, name, scope, owner_tg_id
     FROM subjects
     WHERE id=?
     LIMIT 1`,
    [subjectId]
  );

  return rows[0] || null;
}
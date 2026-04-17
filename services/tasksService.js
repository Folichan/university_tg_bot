import { db } from "../db/pool.js";

export async function createTask({
  tgId,
  groupId,
  subjectId,
  title,
  description,
  dueDate,
  scope = "personal",
}) {
  const [res] = await db.query(
    `INSERT INTO tasks (group_id, subject_id, title, description, due_date, scope, owner_tg_id)
     VALUES (?,?,?,?,?,?,?)`,
    [groupId, subjectId, title, description, dueDate, scope, tgId]
  );

  return res.insertId;
}

export async function createTaskPublishRequest(taskId, groupId, tgId) {
  await db.query(
    `INSERT INTO task_publish_requests (task_id, group_id, requested_by_tg_id)
     VALUES (?,?,?)`,
    [taskId, groupId, tgId]
  );
}
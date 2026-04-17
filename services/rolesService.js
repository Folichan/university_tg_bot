import { db } from "../db/pool.js";

export async function ensureUserExists(tgId) {
  await db.query(
    `INSERT INTO users (tg_id) VALUES (?)
     ON DUPLICATE KEY UPDATE tg_id = VALUES(tg_id)`,
    [tgId]
  );
}

export async function getUsersByGroup(groupId) {
  const [rows] = await db.query(
    `SELECT u.tg_id, u.role
     FROM user_group ug
     JOIN users u ON u.tg_id = ug.user_tg_id
     WHERE ug.group_id=?
     ORDER BY u.tg_id ASC`,
    [groupId]
  );
  return rows;
}

export async function getUserRole(tgId) {
    const [rows] = await db.query(
        `SELECT u.role
        FROM users
        WHERE u.tg_id=?`,
        [tgId]
    );
    return rows;
}

export async function setStudentRole(targetTgId) {
  await db.query(`UPDATE users SET role='student' WHERE tg_id=?`, [targetTgId]);
  await db.query(`DELETE FROM group_curators WHERE curator_tg_id=?`, [targetTgId]);
}

export async function setCuratorRole(targetTgId, groupId) {
  await db.query(
    `UPDATE users SET role='curator' WHERE tg_id=?`,
    [targetTgId]
  );

  await db.query(
    `INSERT IGNORE INTO group_curators (group_id, curator_tg_id) VALUES (?, ?)`,
    [groupId, targetTgId]
  );
}

export async function isCuratorOfGroup(tgId, groupId) {
  const [rows] = await db.query(
    `SELECT 1
     FROM group_curators
     WHERE curator_tg_id=? AND group_id=?
     LIMIT 1`,
    [tgId, groupId]
  );

  return rows.length > 0;
}

export async function removeCuratorFromGroup(targetTgId, groupId) {
  await db.query(
    `DELETE FROM group_curators
     WHERE curator_tg_id=? AND group_id=?`,
    [targetTgId, groupId]
  );

  const [rows] = await db.query(
    `SELECT 1
     FROM group_curators
     WHERE curator_tg_id=?
     LIMIT 1`,
    [targetTgId]
  );

  if (rows.length === 0) {
    await db.query(
      `UPDATE users SET role='student' WHERE tg_id=?`,
      [targetTgId]
    );
  }
}

export async function getCuratorsByGroup(groupId) {
  const [rows] = await db.query(
    `SELECT u.tg_id, u.role
     FROM group_curators gc
     JOIN users u ON u.tg_id = gc.curator_tg_id
     WHERE gc.group_id=?
     ORDER BY u.tg_id ASC`,
    [groupId]
  );

  return rows;
}

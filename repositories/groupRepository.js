import { db } from "../db/pool.js";

export async function getGroupsPage(limit, offset) {
  const [rows] = await db.query(
    `SELECT id, name FROM groups WHERE is_active=1 ORDER BY name LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return rows;
}

export async function countGroups() {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS total FROM groups WHERE is_active=1`
  );
  return row.total;
}

export async function findGroupByExactName(name) {
  const [rows] = await db.query(
    `SELECT id, name FROM groups WHERE LOWER(name)=LOWER(?) LIMIT 1`,
    [name]
  );
  return rows[0] || null;
}

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});

const PAGE_SIZE = 8;

// ===== Простое хранилище состояния (на MVP) =====
const state = new Map(); // tgId -> { step, temp }

function setState(tgId, step, temp = {}) {
  state.set(tgId, { step, temp });
}
function getState(tgId) {
  return state.get(tgId) || { step: null, temp: {} };
}
function clearState(tgId) {
  state.delete(tgId);
}

// ===== DB helpers =====
async function upsertUser(tgId) {
  await db.query(
    `INSERT INTO users (tg_id) VALUES (?) 
     ON DUPLICATE KEY UPDATE tg_id = VALUES(tg_id)`,
    [tgId]
  );
}

async function getUserRole(tgId) {
  const [rows] = await db.query(`SELECT role FROM users WHERE tg_id=?`, [tgId]);
  return rows[0]?.role || "student";
}

async function getGroupsPage(page) {
  const offset = page * PAGE_SIZE;
  const [rows] = await db.query(
    `SELECT id, name FROM groups WHERE is_active=1 ORDER BY name LIMIT ? OFFSET ?`,
    [PAGE_SIZE, offset]
  );
  const [[cnt]] = await db.query(
    `SELECT COUNT(*) AS c FROM groups WHERE is_active=1`
  );
  return { rows, total: cnt.c };
}

async function findGroupByText(text) {
  const t = text.trim();
  // 1) точное (без учёта регистра)
  let [rows] = await db.query(
    `SELECT id, name FROM groups WHERE is_active=1 AND LOWER(name)=LOWER(?) LIMIT 5`,
    [t]
  );
  if (rows.length) return { type: "exact", rows };

  // 2) похожее
  [rows] = await db.query(
    `SELECT id, name FROM groups WHERE is_active=1 AND name LIKE ? ORDER BY name LIMIT 10`,
    [`%${t}%`]
  );
  if (rows.length === 1) return { type: "single", rows };
  if (rows.length > 1) return { type: "many", rows };
  return { type: "none", rows: [] };
}

async function setUserGroup(tgId, groupId) {
  await db.query(
    `INSERT INTO user_group (user_tg_id, group_id) VALUES (?,?)
     ON DUPLICATE KEY UPDATE group_id=VALUES(group_id)`,
    [tgId, groupId]
  );
}

async function groupExists(name) {
  const [rows] = await db.query(
    `SELECT id FROM groups WHERE LOWER(name)=LOWER(?) LIMIT 1`,
    [name.trim()]
  );
  return rows.length > 0;
}

async function pendingRequestExists(name) {
  const [rows] = await db.query(
    `SELECT id FROM group_requests WHERE LOWER(requested_name)=LOWER(?) AND status='pending' LIMIT 1`,
    [name.trim()]
  );
  return rows.length > 0;
}

async function createGroupRequest(tgId, name) {
  await db.query(
    `INSERT INTO group_requests (requested_name, requested_by_tg_id) VALUES (?,?)`,
    [name.trim(), tgId]
  );
}

async function getPendingRequestsPage(page) {
  const offset = page * PAGE_SIZE;
  const [rows] = await db.query(
    `SELECT id, requested_name, requested_by_tg_id, created_at
     FROM group_requests
     WHERE status='pending'
     ORDER BY created_at ASC
     LIMIT ? OFFSET ?`,
    [PAGE_SIZE, offset]
  );
  const [[cnt]] = await db.query(
    `SELECT COUNT(*) AS c FROM group_requests WHERE status='pending'`
  );
  return { rows, total: cnt.c };
}

async function approveRequest(adminTgId, requestId) {
  const [rows] = await db.query(
    `SELECT id, requested_name, requested_by_tg_id 
     FROM group_requests WHERE id=? AND status='pending' LIMIT 1`,
    [requestId]
  );
  if (!rows.length) return null;

  const req = rows[0];
  // Если группу уже добавили параллельно — просто отмечаем как approved
  const exists = await groupExists(req.requested_name);
  if (!exists) {
    await db.query(`INSERT INTO groups (name) VALUES (?)`, [req.requested_name]);
  }

  await db.query(
    `UPDATE group_requests 
     SET status='approved', decided_by_tg_id=?, decided_at=NOW()
     WHERE id=?`,
    [adminTgId, requestId]
  );
  return req;
}

async function rejectRequest(adminTgId, requestId) {
  const [rows] = await db.query(
    `SELECT id, requested_name, requested_by_tg_id 
     FROM group_requests WHERE id=? AND status='pending' LIMIT 1`,
    [requestId]
  );
  if (!rows.length) return null;

  const req = rows[0];
  await db.query(
    `UPDATE group_requests 
     SET status='rejected', decided_by_tg_id=?, decided_at=NOW()
     WHERE id=?`,
    [adminTgId, requestId]
  );
  return req;
}

// ===== UI builders =====
function groupsKeyboard(groups, page, total) {
  const buttons = groups.map(g => [{ text: g.name, callback_data: `grp:pick:${g.id}` }]);
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const nav = [];
  if (page > 0) nav.push({ text: "◀️", callback_data: `grp:page:${page - 1}` });
  nav.push({ text: `Стр. ${page + 1}/${maxPage + 1}`, callback_data: "noop" });
  if (page < maxPage) nav.push({ text: "▶️", callback_data: `grp:page:${page + 1}` });

  buttons.push(nav);
  buttons.push([{ text: "➕ Добавить группу", callback_data: "grp:req:new" }]);
  return { inline_keyboard: buttons };
}

function requestsKeyboard(reqs, page, total) {
  const rows = [];
  for (const r of reqs) {
    rows.push([{ text: `📌 ${r.requested_name}`, callback_data: "noop" }]);
    rows.push([
      { text: "✅ Принять", callback_data: `req:approve:${r.id}` },
      { text: "❌ Отклонить", callback_data: `req:reject:${r.id}` },
    ]);
  }
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const nav = [];
  if (page > 0) nav.push({ text: "◀️", callback_data: `req:page:${page - 1}` });
  nav.push({ text: `Стр. ${page + 1}/${maxPage + 1}`, callback_data: "noop" });
  if (page < maxPage) nav.push({ text: "▶️", callback_data: `req:page:${page + 1}` });
  rows.push(nav);
  return { inline_keyboard: rows.length ? rows : [[{ text: "Пусто", callback_data: "noop" }]] };
}

// ===== Основные команды =====
async function showGroupPicker(chatId, tgId, page = 0, editMessageId = null) {
  const { rows, total } = await getGroupsPage(page);
  const opts = { reply_markup: groupsKeyboard(rows, page, total) };

  if (editMessageId) {
    await bot.editMessageText("Выбери группу (кнопкой) или напиши её названием:", {
      chat_id: chatId,
      message_id: editMessageId,
      ...opts,
    });
  } else {
    await bot.sendMessage(chatId, "Выбери группу (кнопкой) или напиши её названием:", opts);
  }
  setState(tgId, "AWAIT_GROUP_PICK", { page });
}

bot.onText(/\/start/, async (msg) => {
  const tgId = msg.from.id;
  await upsertUser(tgId);
  await showGroupPicker(msg.chat.id, tgId, 0);
});

// ===== Обработка текста (пункт 1: ввод названия группы) =====
bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const tgId = msg.from.id;
  const chatId = msg.chat.id;
  const s = getState(tgId);

  if (s.step === "AWAIT_GROUP_NAME_FOR_REQUEST") {
    const name = msg.text.trim();

    if (name.length < 2) return bot.sendMessage(chatId, "Название слишком короткое. Введи ещё раз.");
    if (await groupExists(name)) return bot.sendMessage(chatId, "Такая группа уже существует. Напиши /start и выбери её.");
    if (await pendingRequestExists(name)) return bot.sendMessage(chatId, "Заявка на такую группу уже ожидает решения администратора.");

    await createGroupRequest(tgId, name);
    clearState(tgId);

    await bot.sendMessage(chatId, "Заявка отправлена администратору ✅");
    return;
  }

  if (s.step === "AWAIT_GROUP_PICK") {
    const res = await findGroupByText(msg.text);

    if (res.type === "exact" || res.type === "single") {
      const g = res.rows[0];
      await setUserGroup(tgId, g.id);
      clearState(tgId);
      return bot.sendMessage(chatId, `Группа выбрана: ${g.name} ✅`);
    }

    if (res.type === "many") {
      // показать варианты кнопками
      const kb = {
        inline_keyboard: res.rows.map(g => [{ text: g.name, callback_data: `grp:pick:${g.id}` }])
          .concat([[{ text: "➕ Добавить группу", callback_data: "grp:req:new" }]])
      };
      return bot.sendMessage(chatId, "Нашёл несколько вариантов. Выбери нужный:", { reply_markup: kb });
    }

    // none
    return bot.sendMessage(chatId, "Такой группы нет. Можешь нажать «➕ Добавить группу» в списке.");
  }
});

// ===== Callback кнопки =====
bot.on("callback_query", async (q) => {
  const tgId = q.from.id;
  const chatId = q.message.chat.id;
  const mid = q.message.message_id;
  const data = q.data || "";

  if (data === "noop") return bot.answerCallbackQuery(q.id);

  // Пагинация групп
  if (data.startsWith("grp:page:")) {
    const page = Number(data.split(":")[2] || 0);
    await showGroupPicker(chatId, tgId, page, mid);
    return bot.answerCallbackQuery(q.id);
  }

  // Выбор группы кнопкой
  if (data.startsWith("grp:pick:")) {
    const groupId = Number(data.split(":")[2]);
    await setUserGroup(tgId, groupId);

    clearState(tgId);
    await bot.answerCallbackQuery(q.id, { text: "Группа выбрана ✅" });
    return bot.sendMessage(chatId, "Группа сохранена ✅");
  }

  // Добавить группу
  if (data === "grp:req:new") {
    setState(tgId, "AWAIT_GROUP_NAME_FOR_REQUEST");
    await bot.answerCallbackQuery(q.id);
    return bot.sendMessage(chatId, "Введи название группы, которую нужно добавить:");
  }

  // Админ: открыть список заявок
  if (data.startsWith("req:page:")) {
    const role = await getUserRole(tgId);
    if (role !== "admin") {
      await bot.answerCallbackQuery(q.id, { text: "Недостаточно прав", show_alert: true });
      return;
    }
    const page = Number(data.split(":")[2] || 0);
    const { rows, total } = await getPendingRequestsPage(page);
    await bot.editMessageText("Заявки на добавление групп:", {
      chat_id: chatId,
      message_id: mid,
      reply_markup: requestsKeyboard(rows, page, total),
    });
    return bot.answerCallbackQuery(q.id);
  }

  // Админ: принять
  if (data.startsWith("req:approve:")) {
    const role = await getUserRole(tgId);
    if (role !== "admin") {
      await bot.answerCallbackQuery(q.id, { text: "Недостаточно прав", show_alert: true });
      return;
    }
    const requestId = Number(data.split(":")[2]);
    const req = await approveRequest(tgId, requestId);
    await bot.answerCallbackQuery(q.id, { text: req ? "Принято ✅" : "Уже обработано" });

    if (req) {
      await bot.sendMessage(req.requested_by_tg_id, `Заявка на группу "${req.requested_name}" принята ✅`);
    }
    return;
  }

  // Админ: отклонить
  if (data.startsWith("req:reject:")) {
    const role = await getUserRole(tgId);
    if (role !== "admin") {
      await bot.answerCallbackQuery(q.id, { text: "Недостаточно прав", show_alert: true });
      return;
    }
    const requestId = Number(data.split(":")[2]);
    const req = await rejectRequest(tgId, requestId);
    await bot.answerCallbackQuery(q.id, { text: req ? "Отклонено ❌" : "Уже обработано" });

    if (req) {
      await bot.sendMessage(req.requested_by_tg_id, `Заявка на группу "${req.requested_name}" отклонена ❌`);
    }
    return;
  }
});
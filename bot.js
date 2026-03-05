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

async function getUserGroupId(tgId) {
  const [rows] = await db.query(
    `SELECT group_id FROM user_group WHERE user_tg_id=?`,
    [tgId]
  );
  return rows[0]?.group_id || null;
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

// -------- Учебные предметы --------
async function getSubjectsForUser(tgId, groupId, page) {
  const offset = page * PAGE_SIZE;
  // group subjects + personal subjects of user
  const [rows] = await db.query(
    `SELECT id, name, scope
     FROM subjects
     WHERE group_id=?
       AND (scope='group' OR (scope='personal' AND owner_tg_id=?))
     ORDER BY scope DESC, name ASC
     LIMIT ? OFFSET ?`,
    [groupId, tgId, PAGE_SIZE, offset]
  );

  const [[cnt]] = await db.query(
    `SELECT COUNT(*) AS c
     FROM subjects
     WHERE group_id=?
       AND (scope='group' OR (scope='personal' AND owner_tg_id=?))`,
    [groupId, tgId]
  );

  return { rows, total: cnt.c };
}

async function subjectExists(groupId, name, scope, ownerTgId) {
  const [rows] = await db.query(
    `SELECT id FROM subjects 
     WHERE group_id=? AND LOWER(name)=LOWER(?) AND scope=? AND (owner_tg_id <=> ?) LIMIT 1`,
    [groupId, name.trim(), scope, ownerTgId ?? null]
  );
  return rows.length > 0;
}

async function createPersonalSubject(tgId, groupId, name) {
  await db.query(
    `INSERT INTO subjects (group_id, name, scope, owner_tg_id)
     VALUES (?,?, 'personal', ?)`,
    [groupId, name.trim(), tgId]
  );
}

async function createSubjectRequest(tgId, groupId, name, scope) {
  await db.query(
    `INSERT INTO subject_requests (group_id, requested_name, requested_by_tg_id, scope)
     VALUES (?,?,?,?)`,
    [groupId, name.trim(), tgId, scope]
  );
}

// -------- Задачи --------
async function createTask({ tgId, groupId, subjectId, title, description, dueDate, askGroup }) {
  const [res] = await db.query(
    `INSERT INTO tasks (group_id, subject_id, title, description, due_date, scope, owner_tg_id)
     VALUES (?,?,?,?,?,'personal',?)`,
    [groupId, subjectId, title, description, dueDate, tgId]
  );
  const taskId = res.insertId;

  if (askGroup) {
    await db.query(
      `INSERT INTO task_publish_requests (task_id, group_id, requested_by_tg_id)
       VALUES (?,?,?)`,
      [taskId, groupId, tgId]
    );
  }
  return taskId;
}

async function getTasksForUser(tgId, groupId) {
  const [rows] = await db.query(
    `SELECT t.id, t.title, t.due_date, t.scope,
            IFNULL(ts.is_done, 0) AS is_done
     FROM tasks t
     LEFT JOIN task_status ts ON ts.task_id = t.id AND ts.tg_id = ?
     WHERE t.group_id = ?
       AND (t.scope='group' OR (t.scope='personal' AND t.owner_tg_id=?))
     ORDER BY t.due_date ASC, t.created_at DESC
     LIMIT 50`,
    [tgId, groupId, tgId]
  );
  return rows;
}

async function getUndoneTasksForUser(tgId, groupId) {
  const [rows] = await db.query(
    `SELECT t.id, t.title, t.due_date, t.scope
     FROM tasks t
     LEFT JOIN task_status ts ON ts.task_id=t.id AND ts.tg_id=?
     WHERE t.group_id=?
       AND (t.scope='group' OR (t.scope='personal' AND t.owner_tg_id=?))
       AND IFNULL(ts.is_done,0)=0
     ORDER BY t.due_date ASC, t.created_at DESC
     LIMIT 50`,
    [tgId, groupId, tgId]
  );
  return rows;
}

async function markTaskDone(tgId, taskId) {
  await db.query(
    `INSERT INTO task_status (task_id, tg_id, is_done, done_at)
     VALUES (?,?,1,NOW())
     ON DUPLICATE KEY UPDATE is_done=1, done_at=NOW()`,
    [taskId, tgId]
  );
}

// ===== Функции куратора =====
async function getGroupCurators(groupId) {
  const [rows] = await db.query(
    `SELECT curator_tg_id FROM group_curators WHERE group_id=?`,
    [groupId]
  );
  return rows.map(r => r.curator_tg_id);
}

async function getPendingPublishRequestsForCurator(curatorTgId) {
  // показываем заявки только по тем группам, где он куратор
  const [rows] = await db.query(
    `SELECT r.id, r.task_id, r.group_id, r.requested_by_tg_id, r.created_at, t.title, t.due_date
     FROM task_publish_requests r
     JOIN group_curators gc ON gc.group_id=r.group_id AND gc.curator_tg_id=?
     JOIN tasks t ON t.id=r.task_id
     WHERE r.status='pending'
     ORDER BY r.created_at ASC
     LIMIT 50`,
    [curatorTgId]
  );
  return rows;
}

async function approvePublishRequest(curatorTgId, reqId) {
  const [rows] = await db.query(
    `SELECT r.id, r.task_id, r.requested_by_tg_id, t.title
     FROM task_publish_requests r
     JOIN tasks t ON t.id=r.task_id
     WHERE r.id=? AND r.status='pending'
     LIMIT 1`,
    [reqId]
  );
  if (!rows.length) return null;

  const req = rows[0];
  // делаем задачу групповой
  await db.query(`UPDATE tasks SET scope='group' WHERE id=?`, [req.task_id]);

  await db.query(
    `UPDATE task_publish_requests
     SET status='approved', decided_by_tg_id=?, decided_at=NOW()
     WHERE id=?`,
    [curatorTgId, reqId]
  );
  return req;
}

async function rejectPublishRequest(curatorTgId, reqId) {
  const [rows] = await db.query(
    `SELECT id, task_id, requested_by_tg_id FROM task_publish_requests
     WHERE id=? AND status='pending' LIMIT 1`,
    [reqId]
  );
  if (!rows.length) return null;
  const req = rows[0];

  await db.query(
    `UPDATE task_publish_requests
     SET status='rejected', decided_by_tg_id=?, decided_at=NOW()
     WHERE id=?`,
    [curatorTgId, reqId]
  );
  return req;
}

// ===== UI =====
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

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🗒 Задачи", callback_data: "menu:tasks" }],
      [{ text: "➕ Добавить задачу", callback_data: "menu:add_task" }],
      [{ text: "✅ Отметить выполненной", callback_data: "menu:done_pick" }],
    ],
  };
}

function tasksListKeyboard(tasks, prefix) {
  // prefix: "task:done:" например
  const rows = tasks.map(t => {
    const d = formatDateRu(t.due_date);
    const doneMark = t.is_done ? "✅ " : "";
    return [{ text: `${doneMark}${d} — ${t.title}`, callback_data: `${prefix}${t.id}` }];
  });
  return { inline_keyboard: rows.length ? rows : [[{ text: "Пусто", callback_data: "noop" }]] };
}

function subjectsKeyboard(subjects, page, total) {
  const rows = subjects.map(s => {
    const tag = s.scope === "group" ? "👥" : "👤";
    return [{ text: `${tag} ${s.name}`, callback_data: `sub:pick:${s.id}` }];
  });

  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const nav = [];
  if (page > 0) nav.push({ text: "◀️", callback_data: `sub:page:${page - 1}` });
  nav.push({ text: `Стр. ${page + 1}/${maxPage + 1}`, callback_data: "noop" });
  if (page < maxPage) nav.push({ text: "▶️", callback_data: `sub:page:${page + 1}` });
  rows.push(nav);

  rows.push([{ text: "➕ Добавить предмет", callback_data: "sub:add" }]);
  return { inline_keyboard: rows.length ? rows : [[{ text: "➕ Добавить предмет", callback_data: "sub:add" }]] };
}

function publishRequestsKeyboard(reqs) {
  const rows = [];
  for (const r of reqs) {
    rows.push([{ text: `📌 ${formatDateRu(r.due_date)} — ${r.title}`, callback_data: "noop" }]);
    rows.push([
      { text: "✅ Опубликовать для группы", callback_data: `pub:approve:${r.id}` },
      { text: "❌ Отклонить", callback_data: `pub:reject:${r.id}` },
    ]);
  }
  return { inline_keyboard: rows.length ? rows : [[{ text: "Пусто", callback_data: "noop" }]] };
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

// ===== Даты =====
function formatDateRu(dateLike) {
  // dateLike: Date или string
  const d = new Date(dateLike);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function parseDateInput(text) {
  const t = text.trim();
  // dd.mm.yyyy
  const m1 = t.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]), mm = Number(m1[2]), yyyy = Number(m1[3]);
    const d = new Date(yyyy, mm - 1, dd);
    if (d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd) {
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
    return null;
  }
  // yyyy-mm-dd
  const m2 = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return t;
  return null;
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

async function showMainMenu(chatId, tgId) {
  await bot.sendMessage(chatId, "Меню:", { reply_markup: mainMenuKeyboard() });
  clearState(tgId);
}

async function requireGroup(chatId, tgId) {
  const groupId = await getUserGroupId(tgId);
  if (!groupId) {
    await bot.sendMessage(chatId, "Сначала выбери группу: /start");
    return null;
  }
  return groupId;
}

bot.onText(/\/start/, async (msg) => {
  const tgId = msg.from.id;
  await upsertUser(tgId);
  await showGroupPicker(msg.chat.id, tgId, 0);
});

// Админ: заявки на группы
bot.onText(/\/pending_groups/, async (msg) => {
  const tgId = msg.from.id;
  const role = await getUserRole(tgId);
  if (role !== "admin") return bot.sendMessage(msg.chat.id, "Доступно только администратору.");

  const { rows, total } = await getPendingGroupRequestsPage(0);
  return bot.sendMessage(msg.chat.id, "Заявки на добавление групп:", {
    reply_markup: adminPendingGroupsKeyboard(rows, 0, total),
  });
});

// Куратор: заявки на публикацию задач
bot.onText(/\/pending_publish/, async (msg) => {
  const tgId = msg.from.id;
  const role = await getUserRole(tgId);
  if (role !== "curator" && role !== "admin") return bot.sendMessage(msg.chat.id, "Доступно только куратору/админу.");

  const reqs = await getPendingPublishRequestsForCurator(tgId);
  return bot.sendMessage(msg.chat.id, "Заявки на публикацию задач для группы:", {
    reply_markup: publishRequestsKeyboard(reqs),
  });
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
      await bot.sendMessage(chatId, `Группа выбрана: ${g.name} ✅`);
      return showMainMenu(chatId, tgId);
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

  // пункт 2: задачи
  if (s.step?.startsWith("TASK_")) {
    const groupId = await requireGroup(chatId, tgId);
    if (!groupId) return;

    if (s.step === "TASK_TITLE") {
      const title = msg.text.trim();
      if (title.length < 2) return bot.sendMessage(chatId, "Заголовок слишком короткий. Введи ещё раз.");
      setState(tgId, "TASK_DESC", { ...s.temp, title });
      return bot.sendMessage(chatId, "Введи описание (или отправь '-' если без описания):");
    }

    if (s.step === "TASK_DESC") {
      const description = msg.text.trim() === "-" ? "" : msg.text.trim();
      setState(tgId, "TASK_DUE", { ...s.temp, description });
      return bot.sendMessage(chatId, "Введи срок сдачи (ДД.ММ.ГГГГ или ГГГГ-ММ-ДД):");
    }

    if (s.step === "TASK_DUE") {
      const dueDate = parseDateInput(msg.text);
      if (!dueDate) return bot.sendMessage(chatId, "Неверный формат даты. Пример: 15.03.2026");
      // выбор предмета
      setState(tgId, "TASK_SUBJECT_PICK", { ...s.temp, dueDate, subjectPage: 0 });
      const { rows, total } = await getSubjectsForUser(tgId, groupId, 0);
      return bot.sendMessage(chatId, "Выбери учебный предмет:", {
        reply_markup: subjectsKeyboard(rows, 0, total),
      });
    }

    // Добавление предмета: ввод названия
    if (s.step === "SUBJECT_NAME") {
      const name = msg.text.trim();
      if (name.length < 2) return bot.sendMessage(chatId, "Название слишком короткое. Введи ещё раз.");

      // режим предмета выбран ранее: personal / group_request
      const mode = s.temp.subjectMode; // "personal" | "group_request"
      if (mode === "personal") {
        const exists = await subjectExists(groupId, name, "personal", tgId);
        if (exists) return bot.sendMessage(chatId, "У тебя уже есть такой личный предмет.");
        await createPersonalSubject(tgId, groupId, name);
        // вернуть к выбору предмета
        const back = getState(tgId); // уже обновится ниже
        setState(tgId, "TASK_SUBJECT_PICK", { ...back.temp, subjectPage: 0 });
        const { rows, total } = await getSubjectsForUser(tgId, groupId, 0);
        return bot.sendMessage(chatId, "Предмет добавлен 👤. Теперь выбери предмет:", {
          reply_markup: subjectsKeyboard(rows, 0, total),
        });
      }

      // запрос на добавление предмета
      await createSubjectRequest(tgId, groupId, name, "group");
      // вернуть к выбору предмета
      const back = getState(tgId);
      setState(tgId, "TASK_SUBJECT_PICK", { ...back.temp, subjectPage: 0 });
      const { rows, total } = await getSubjectsForUser(tgId, groupId, 0);
      return bot.sendMessage(chatId, "Заявка на предмет отправлена куратору 👥⏳. Пока выбери предмет из доступных:", {
        reply_markup: subjectsKeyboard(rows, 0, total),
      });
  }}
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
    await bot.sendMessage(chatId, "Группа сохранена ✅");
    return showMainMenu(chatId, tgId);
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

  // ===== МЕНЮ =====
  if (data === "menu:tasks") {
    const groupId = await requireGroup(chatId, tgId);
    if (!groupId) return bot.answerCallbackQuery(q.id);

    const tasks = await getTasksForUser(tgId, groupId);
    const text = tasks.length
      ? tasks.map(t => `${t.is_done ? "✅" : "▫️"} ${formatDateRu(t.due_date)} — ${t.title}`).join("\n")
      : "Задач пока нет.";

    await bot.answerCallbackQuery(q.id);
    return bot.sendMessage(chatId, `🗒 Список задач (ближайшие сверху):\n\n${text}`);
  }

  if (data === "menu:add_task") {
    const groupId = await requireGroup(chatId, tgId);
    if (!groupId) return bot.answerCallbackQuery(q.id);

    setState(tgId, "TASK_TITLE", {});
    await bot.answerCallbackQuery(q.id);
    return bot.sendMessage(chatId, "Введите заголовок задачи:");
  }

  if (data === "menu:done_pick") {
    const groupId = await requireGroup(chatId, tgId);
    if (!groupId) return bot.answerCallbackQuery(q.id);

    const tasks = await getUndoneTasksForUser(tgId, groupId);
    await bot.answerCallbackQuery(q.id);
    return bot.sendMessage(chatId, "Выбери задачу, которую отметить выполненной:", {
      reply_markup: tasksListKeyboard(tasks.map(t => ({ ...t, is_done: 0 })), "task:done:"),
    });
  }

  // ===== Успешное добавление задачи =====
  if (data.startsWith("task:done:")) {
    const taskId = Number(data.split(":")[2]);
    await markTaskDone(tgId, taskId);
    await bot.answerCallbackQuery(q.id, { text: "Отмечено ✅" });
    return bot.sendMessage(chatId, "Готово: задача отмечена как выполненная ✅");
  }

  // ===== Выбор предмета =====
  if (data.startsWith("sub:page:")) {
    const groupId = await requireGroup(chatId, tgId);
    if (!groupId) return bot.answerCallbackQuery(q.id);

    const s = getState(tgId);
    const page = Number(data.split(":")[2] || 0);

    // остаёмся в выборе предмета
    setState(tgId, "TASK_SUBJECT_PICK", { ...s.temp, subjectPage: page });

    const { rows, total } = await getSubjectsForUser(tgId, groupId, page);
    await bot.editMessageReplyMarkup(subjectsKeyboard(rows, page, total), {
      chat_id: chatId,
      message_id: mid,
    });

    return bot.answerCallbackQuery(q.id);
  }

  if (data.startsWith("sub:pick:")) {
    const subjectId = Number(data.split(":")[2]);
    const s = getState(tgId);
    // фиксируем subject и переходим к выбору режима публикации
    setState(tgId, "TASK_SCOPE", { ...s.temp, subjectId });

    await bot.answerCallbackQuery(q.id);

    return bot.sendMessage(chatId, "Как добавить задачу?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "👤 Только для себя", callback_data: "task:scope:personal" }],
          [{ text: "👥 Запрос куратору: для всей группы", callback_data: "task:scope:ask_group" }],
        ],
      },
    });
  }

  if (data === "sub:add") {
    // спросить режим добавления предмета
    await bot.answerCallbackQuery(q.id);
    return bot.sendMessage(chatId, "Как добавить предмет?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "👤 Для себя (сразу)", callback_data: "sub:add:personal" }],
          [{ text: "👥 Для группы (на модерацию куратора)", callback_data: "sub:add:group_request" }],
        ],
      },
    });
  }

  if (data.startsWith("sub:add:")) {
    const mode = data.split(":")[2]; // personal | group_request
    const s = getState(tgId);
    setState(tgId, "SUBJECT_NAME", { ...s.temp, subjectMode: mode });
    await bot.answerCallbackQuery(q.id);
    return bot.sendMessage(chatId, "Введи название предмета:");
  }

  // ===== Подтверждение объёма задач =====
  if (data.startsWith("task:scope:")) {
    const groupId = await requireGroup(chatId, tgId);
    if (!groupId) return bot.answerCallbackQuery(q.id);

    const mode = data.split(":")[2]; // personal | ask_group
    const s = getState(tgId);
    const title = s.temp.title;
    const description = s.temp.description;
    const dueDate = s.temp.dueDate;
    const subjectId = s.temp.subjectId;

    const askGroup = mode === "ask_group";
    const taskId = await createTask({
      tgId,
      groupId,
      subjectId,
      title,
      description,
      dueDate,
      askGroup,
    });

    clearState(tgId);
    await bot.answerCallbackQuery(q.id, { text: "Создано ✅" });

    if (askGroup) {
      // уведомить кураторов группы
      const curators = await getGroupCurators(groupId);
      for (const c of curators) {
        await bot.sendMessage(
          c,
          `🆕 Запрос на публикацию задачи для группы:\n${formatDateRu(dueDate)} — ${title}\n\nКоманда: /pending_publish`
        );
      }
      await bot.sendMessage(chatId, `Задача создана (личная) и отправлена на модерацию куратору ✅\nID: ${taskId}`);
    } else {
      await bot.sendMessage(chatId, `Задача создана ✅\nID: ${taskId}`);
    }

    return showMainMenu(chatId, tgId);
  }

  // ===== Модерация куратора =====
  if (data.startsWith("pub:approve:")) {
    const role = await getUserRole(tgId);
    if (role !== "curator" && role !== "admin") {
      await bot.answerCallbackQuery(q.id, { text: "Недостаточно прав", show_alert: true });
      return;
    }
    const reqId = Number(data.split(":")[2]);
    const req = await approvePublishRequest(tgId, reqId);
    await bot.answerCallbackQuery(q.id, { text: req ? "Опубликовано ✅" : "Уже обработано" });
    if (req) {
      await bot.sendMessage(req.requested_by_tg_id, `Куратор одобрил публикацию задачи "${req.title}" для группы ✅`);
    }
    return;
  }

  if (data.startsWith("pub:reject:")) {
    const role = await getUserRole(tgId);
    if (role !== "curator" && role !== "admin") {
      await bot.answerCallbackQuery(q.id, { text: "Недостаточно прав", show_alert: true });
      return;
    }
    const reqId = Number(data.split(":")[2]);
    const req = await rejectPublishRequest(tgId, reqId);
    await bot.answerCallbackQuery(q.id, { text: req ? "Отклонено ❌" : "Уже обработано" });
    if (req) {
      await bot.sendMessage(req.requested_by_tg_id, `Куратор отклонил публикацию задачи для группы ❌`);
    }
    return;
  }

  // default
  return bot.answerCallbackQuery(q.id);
});
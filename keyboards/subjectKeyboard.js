export function buildStudentSubjectAddKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 Добавить предмет для себя", callback_data: "subject:add:personal" }],
      [{ text: "📨 Отправить заявку на предмет для группы", callback_data: "subject:add:group_request" }],
    ],
  };
}

export function buildCuratorSubjectAddKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "👤 Добавить предмет для себя", callback_data: "subject:add:personal" }],
      [{ text: "👥 Добавить предмет всей группе", callback_data: "subject:add:group_direct" }],
      [{ text: "🗑 Удалить предмет группы", callback_data: "subject:delete:start" }],
    ],
  };
}

export function buildGroupSubjectsKeyboard(subjects) {
  return {
    inline_keyboard: subjects.map(subject => [
      { text: `🗑 ${subject.name}`, callback_data: `subject:delete:${subject.id}` }
    ]),
  };
}
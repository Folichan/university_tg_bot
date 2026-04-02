export function buildGroupKeyboard(groups, page, totalPages) {
  const rows = groups.map(group => [
    { text: group.name, callback_data: `grp:pick:${group.id}` }
  ]);

  rows.push([
    { text: "◀️", callback_data: `grp:page:${page - 1}` },
    { text: `${page + 1}/${totalPages}`, callback_data: "noop" },
    { text: "▶️", callback_data: `grp:page:${page + 1}` }
  ]);

  rows.push([
    { text: "➕ Добавить группу", callback_data: "grp:req:new" }
  ]);

  return { inline_keyboard: rows };
}

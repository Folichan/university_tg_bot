export function getOffset(page, pageSize) {
  return page * pageSize;
}

export function getTotalPages(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function parseDateInput(text) {
  const value = text.trim();

  const ru = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) {
    const day = Number(ru[1]);
    const month = Number(ru[2]);
    const year = Number(ru[3]);

    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return value;

  return null;
}

export function formatDate(dateValue) {
  const date = new Date(dateValue);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
}

// Shared date/time formatting so the whole app shows dates as dd/mm/yy and
// times in 12-hour (AM/PM) form. Accepts ISO strings, date-only strings, or Date.

const pad = (n: number) => String(n).padStart(2, '0');

const toDate = (value: string | number | Date | null | undefined): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

/** dd/mm/yy — e.g. 21/07/26 */
export function formatDate(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

/** h:mm AM/PM — e.g. 3:07 PM */
export function formatTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${ampm}`;
}

/** dd/mm/yy, h:mm AM/PM — e.g. 21/07/26, 3:07 PM */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${formatDate(d)}, ${formatTime(d)}`;
}

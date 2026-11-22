export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export function daysLabel(n: number): string {
  return n === 1 ? '1 dzień' : `${n} dni`;
}

export function exercisesLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1) return '1 ćwiczenie';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return `${n} ćwiczenia`;
  return `${n} ćwiczeń`;
}

/** Timestamp → DD.MM.YYYY (local time). */
export function formatDay(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

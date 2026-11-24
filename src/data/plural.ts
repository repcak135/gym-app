/** Polish plural form for n: 1 trening, 2 treningi, 5 treningów. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const l = n % 10;
  const l2 = n % 100;
  return l >= 2 && l <= 4 && !(l2 >= 12 && l2 <= 14) ? few : many;
}

export const workoutsLabel = (n: number) => `${n} ${plural(n, 'trening', 'treningi', 'treningów')}`;
export const setsLabel = (n: number) => `${n} ${plural(n, 'seria', 'serie', 'serii')}`;
export const exercisesLabel = (n: number) => `${n} ${plural(n, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}`;
export const daysLabel = (n: number) => `${n} ${plural(n, 'dzień', 'dni', 'dni')}`;
export const workingSetsLabel = (n: number) => `${setsLabel(n)} ${plural(n, 'robocza', 'robocze', 'roboczych')}`;

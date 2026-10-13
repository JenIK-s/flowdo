export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const addDays = (n: number, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return iso(d);
};

export const today = () => iso(new Date());
export const parseIso = (s: string) => new Date(s + "T00:00:00");
export const daysBetween = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 864e5);

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

/** «Сегодня», «Завтра», «Пт», «12 дек» — коротко и по-человечески. */
export function prettyDate(s: string): string {
  const diff = daysBetween(today(), s);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Завтра";
  if (diff === -1) return "Вчера";
  if (diff > 1 && diff < 7) {
    const w = WEEKDAYS[parseIso(s).getDay()];
    return w[0].toUpperCase() + w.slice(1);
  }
  const d = parseIso(s);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).replace(".", "");
}

export type DueTone = "late" | "today" | "soon" | "later";
export function dueTone(s: string): DueTone {
  const diff = daysBetween(today(), s);
  return diff < 0 ? "late" : diff === 0 ? "today" : diff <= 2 ? "soon" : "later";
}

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

export const tasksWord = (n: number) => `${n} ${plural(n, "задача", "задачи", "задач")}`;

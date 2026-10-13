import { addDays, iso } from "./dates";

/**
 * Умный ввод: «Купить молоко !срочно #дом @завтра».
 *  !низкий !обычный !высокий !срочно, !0–!3, !! / !!!  — приоритет
 *  #тег                                                 — теги
 *  @сегодня @завтра @послезавтра @неделя @+3 @пт @25.12 @2026-12-31 — срок
 */
export type TokenKind = "priority" | "tag" | "due";
export type Token = { start: number; end: number; kind: TokenKind };
export type Parsed = { title: string; priority: number | null; due: string | null; tags: string[]; tokens: Token[] };

const PRIO: Record<string, number> = {
  низкий: 0, низ: 0, low: 0, "0": 0,
  обычный: 1, средний: 1, normal: 1, "1": 1,
  высокий: 2, важно: 2, важный: 2, high: 2, "2": 2,
  срочно: 3, срочный: 3, urgent: 3, "3": 3,
};

const WEEKDAY: Record<string, number> = {
  вс: 0, воскресенье: 0, sun: 0, sunday: 0,
  пн: 1, понедельник: 1, mon: 1, monday: 1,
  вт: 2, вторник: 2, tue: 2, tuesday: 2,
  ср: 3, среда: 3, среду: 3, wed: 3, wednesday: 3,
  чт: 4, четверг: 4, thu: 4, thursday: 4,
  пт: 5, пятница: 5, пятницу: 5, fri: 5, friday: 5,
  сб: 6, суббота: 6, субботу: 6, sat: 6, saturday: 6,
};

const RELATIVE: Record<string, number> = {
  сегодня: 0, сег: 0, today: 0,
  завтра: 1, зав: 1, tomorrow: 1, tmr: 1,
  послезавтра: 2,
  неделя: 7, нед: 7, week: 7,
  месяц: 30, month: 30,
};

export function parseDate(word: string, now = new Date()): string | null {
  const w = word.toLowerCase();
  if (w in RELATIVE) return addDays(RELATIVE[w], now);
  if (/^\+\d{1,3}$/.test(w)) return addDays(+w.slice(1), now);
  if (w in WEEKDAY) return addDays((WEEKDAY[w] - now.getDay() + 7) % 7 || 7, now);
  let m = w.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = w.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/);
  if (m) {
    const [d, mo] = [+m[1], +m[2]];
    if (m[3]) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], mo, d);
    // без года — ближайшая такая дата в будущем
    const thisYear = valid(now.getFullYear(), mo, d);
    if (thisYear && thisYear < iso(now)) return valid(now.getFullYear() + 1, mo, d);
    return thisYear;
  }
  return null;
}

function valid(y: number, m: number, d: number): string | null {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? iso(dt) : null;
}

const TOKEN = /(?<=^|\s)(!{1,3}[\p{L}\d]*|#[\p{L}\d_\-./]+|@[\p{L}\d+./\-]+)(?=\s|$)/gu;

export function parseQuick(text: string, now = new Date()): Parsed {
  const out: Parsed = { title: "", priority: null, due: null, tags: [], tokens: [] };
  for (const m of text.matchAll(TOKEN)) {
    const raw = m[0], start = m.index!, body = raw.replace(/^[!#@]+/, "").toLowerCase();
    let kind: TokenKind | null = null;
    if (raw[0] === "!") {
      const bangs = raw.length - raw.replace(/^!+/, "").length;
      if (!body && bangs >= 2) { out.priority = bangs === 3 ? 3 : 2; kind = "priority"; }
      else if (bangs === 1 && body in PRIO) { out.priority = PRIO[body]; kind = "priority"; }
    } else if (raw[0] === "#") {
      if (!out.tags.includes(body)) out.tags.push(body);
      kind = "tag";
    } else {
      const d = parseDate(body, now);
      if (d) { out.due = d; kind = "due"; }
    }
    if (kind) out.tokens.push({ start, end: start + raw.length, kind });
  }
  let title = "", pos = 0;
  for (const t of out.tokens) { title += text.slice(pos, t.start); pos = t.end; }
  out.title = (title + text.slice(pos)).replace(/\s+/g, " ").trim();
  return out;
}

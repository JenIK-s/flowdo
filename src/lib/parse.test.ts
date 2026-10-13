import { describe, expect, it } from "vitest";
import { parseDate, parseQuick } from "./parse";

// Понедельник, 12 октября 2026
const NOW = new Date(2026, 9, 12, 10, 0);

describe("parseQuick", () => {
  it("разбирает приоритет, теги и срок", () => {
    const p = parseQuick("Купить молоко !срочно #дом @завтра", NOW);
    expect(p).toMatchObject({ title: "Купить молоко", priority: 3, due: "2026-10-13", tags: ["дом"] });
    expect(p.tokens.map((t) => t.kind)).toEqual(["priority", "tag", "due"]);
  });

  it("поддерживает !! и !!!", () => {
    expect(parseQuick("a !!", NOW).priority).toBe(2);
    expect(parseQuick("!!! a", NOW).priority).toBe(3);
    expect(parseQuick("a !2", NOW).priority).toBe(2);
  });

  it("не трогает обычный текст и неизвестные токены", () => {
    const p = parseQuick("Почта info@site.ru и !привет @никогда", NOW);
    expect(p.title).toBe("Почта info@site.ru и !привет @никогда");
    expect(p).toMatchObject({ priority: null, due: null, tags: [] });
  });

  it("убирает дубли тегов и лишние пробелы", () => {
    expect(parseQuick("  a  #x   b #X ", NOW)).toMatchObject({ title: "a b", tags: ["x"] });
  });
});

describe("parseDate", () => {
  it.each([
    ["сегодня", "2026-10-12"],
    ["послезавтра", "2026-10-14"],
    ["+10", "2026-10-22"],
    ["пт", "2026-10-16"],
    ["пн", "2026-10-19"],
    ["неделя", "2026-10-19"],
    ["25.12", "2026-12-25"],
    ["01.02", "2027-02-01"],
    ["5.3.27", "2027-03-05"],
    ["2026-12-31", "2026-12-31"],
  ])("%s → %s", (w, d) => expect(parseDate(w, NOW)).toBe(d));

  it("отклоняет несуществующие даты", () => {
    expect(parseDate("31.02", NOW)).toBeNull();
    expect(parseDate("2026-13-01", NOW)).toBeNull();
  });
});

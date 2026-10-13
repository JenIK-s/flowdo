<script lang="ts">
  import Dropdown from "./Dropdown.svelte";
  import Icon from "./Icon.svelte";
  import { addDays, dueTone, iso, parseIso, prettyDate, today } from "../dates";
  import { parseDate } from "../parse";

  let { value, onchange, placeholder = "Срок", up = false }: {
    value: string | null; onchange: (v: string | null) => void; placeholder?: string; up?: boolean;
  } = $props();

  let open = $state(false);
  let typed = $state("");
  let month = $state(new Date());

  const nextWeekday = (wd: number) => addDays(((wd - new Date().getDay() + 7) % 7) || 7);
  const quick = $derived([
    { label: "Сегодня", icon: "sun", v: today() },
    { label: "Завтра", icon: "arrow", v: addDays(1) },
    { label: "На выходных", icon: "sparkles", v: new Date().getDay() === 6 ? today() : nextWeekday(6) },
    { label: "След. неделя", icon: "calendar", v: nextWeekday(1) },
  ]);

  $effect(() => {
    if (open) { month = value ? parseIso(value) : new Date(); typed = ""; }
  });

  const days = $derived.by(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const shift = (first.getDay() + 6) % 7; // неделя с понедельника
    return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i - shift + 1));
  });
  const typedDate = $derived(typed.trim() ? parseDate(typed.trim().replace(/^@/, "")) : null);

  function pick(v: string | null) { onchange(v); open = false; }
  const shiftMonth = (n: number) => (month = new Date(month.getFullYear(), month.getMonth() + n, 1));
  const weekday = (v: string) => parseIso(v).toLocaleDateString("ru-RU", { weekday: "short" });
</script>

<Dropdown bind:open width={264} {up}>
  {#snippet trigger()}
    <button class="trigger {value ? dueTone(value) : ''}" class:empty={!value} onclick={() => (open = !open)}>
      <Icon name="calendar" size={14} />{value ? prettyDate(value) : placeholder}
    </button>
  {/snippet}
  <input class="field typed" placeholder="пт, 25.12, +3, завтра…" bind:value={typed}
    onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (typedDate) pick(typedDate); } }} />
  {#if typedDate}
    <button class="mi on" onclick={() => pick(typedDate)}><Icon name="enter" size={14} />{prettyDate(typedDate)}<span class="r">{typedDate}</span></button>
  {/if}
  {#each quick as q}
    <button class="mi" onclick={() => pick(q.v)}><Icon name={q.icon} size={14} />{q.label}<span class="r">{weekday(q.v)}</span></button>
  {/each}
  {#if value}<button class="mi danger" onclick={() => pick(null)}><Icon name="x" size={14} />Убрать срок</button>{/if}
  <hr />
  <div class="cal">
    <div class="head">
      <b>{month.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</b>
      <button class="icon-btn" onclick={() => shiftMonth(-1)} aria-label="Назад"><span style="transform:rotate(180deg);display:grid"><Icon name="right" size={14} /></span></button>
      <button class="icon-btn" onclick={() => shiftMonth(1)} aria-label="Вперёд"><Icon name="right" size={14} /></button>
    </div>
    <div class="grid">
      {#each ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as w}<span class="wd">{w}</span>{/each}
      {#each days as d}
        {@const v = iso(d)}
        <button class="day" class:out={d.getMonth() !== month.getMonth()} class:now={v === today()} class:sel={v === value}
          class:past={v < today()} onclick={() => pick(v)}>{d.getDate()}</button>
      {/each}
    </div>
  </div>
</Dropdown>

<style>
  .trigger {
    display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 7px;
    font-size: 13px; color: var(--text); background: var(--hover); transition: background 0.15s;
  }
  .trigger:hover { background: var(--line-2); }
  .trigger.empty { color: var(--mute); background: transparent; border: 1px dashed var(--line-2); }
  .trigger.late { color: var(--late); }
  .trigger.today { color: var(--today); }
  .trigger.soon { color: var(--soon); }
  .typed { height: 32px; margin-bottom: 4px; font-size: 13px; }
  .cal { padding: 2px 4px 4px; }
  .head { display: flex; align-items: center; gap: 2px; margin-bottom: 4px; }
  .head b { flex: 1; font-size: 13px; font-weight: 600; text-transform: capitalize; padding-left: 4px; }
  .head .icon-btn { width: 26px; height: 26px; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
  .wd { font-size: 11px; color: var(--faint); text-align: center; padding: 2px 0; }
  .day { height: 30px; border-radius: 7px; font-size: 12.5px; transition: background 0.12s, transform 0.12s; }
  .day:hover { background: var(--hover); }
  .day:active { transform: scale(0.9); }
  .day.out { color: var(--faint); }
  .day.past { opacity: 0.5; }
  .day.now { color: var(--accent-text); font-weight: 700; }
  .day.sel { background: var(--accent); color: white; opacity: 1; }
</style>

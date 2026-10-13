<script lang="ts">
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { Tween } from "svelte/motion";
  import Icon from "./Icon.svelte";
  import { PRIO, store } from "../store.svelte";
  import { addDays, parseIso, plural, today } from "../dates";

  const doneOn = $derived.by(() => {
    const m = new Map<string, number>();
    for (const t of store.tasks) if (t.done && t.completed_at) m.set(t.completed_at.slice(0, 10), (m.get(t.completed_at.slice(0, 10)) ?? 0) + 1);
    return m;
  });
  const days = $derived(Array.from({ length: 14 }, (_, i) => addDays(i - 13)).map((d) => ({ d, n: doneOn.get(d) ?? 0 })));
  const max = $derived(Math.max(1, ...days.map((x) => x.n)));
  const week = $derived(days.slice(7).reduce((s, x) => s + x.n, 0));
  const prevWeek = $derived(days.slice(0, 7).reduce((s, x) => s + x.n, 0));
  const streak = $derived.by(() => {
    let n = 0, i = doneOn.has(today()) ? 0 : 1; // серия не обрывается, пока сегодняшний день не закончился
    while (doneOn.has(addDays(-i))) { n++; i++; }
    return n;
  });
  const active = $derived(store.tasks.filter((t) => !t.done));
  const late = $derived(active.filter((t) => t.due && t.due < today()).length);
  const byPrio = $derived([3, 2, 1, 0].map((p) => ({ p, n: active.filter((t) => t.priority === p).length })));
  const prioMax = $derived(Math.max(1, ...byPrio.map((x) => x.n)));
  const projects = $derived(
    [{ id: null as number | null, name: "Входящие", color: "var(--mute)" }, ...store.projects]
      .map((p) => {
        const all = store.tasks.filter((t) => t.project_id === p.id);
        return { ...p, total: all.length, done: all.filter((t) => t.done).length };
      })
      .filter((p) => p.total),
  );

  const kpis = $derived([
    { label: "Активных задач", v: active.length, icon: "layers", c: "#8b5cf6" },
    { label: "Выполнено за 7 дней", v: week, icon: "done", c: "#10b981", trend: week - prevWeek },
    { label: "Просрочено", v: late, icon: "flag", c: "#ef4444" },
    { label: `${plural(streak, "день", "дня", "дней")} подряд`, v: streak, icon: "sparkles", c: "#f59e0b" },
  ]);

  // анимированный «рост» графика при открытии
  const grow = new Tween(0, { duration: 900, easing: cubicOut });
  $effect(() => { grow.target = 1; });
  let hover = $state<number | null>(null);
  const label = (d: string) => parseIso(d).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" });
</script>

<div class="page">
  <h1>Аналитика</h1>
  <p class="sub">Ваш ритм за последние две недели</p>

  <div class="kpis">
    {#each kpis as k, i}
      <div class="kpi" style="--c:{k.c}" in:fly={{ y: 14, duration: 450, delay: i * 70, easing: cubicOut }}>
        <span class="ki"><Icon name={k.icon} size={17} /></span>
        <b>{Math.round(k.v * grow.current)}</b>
        <span class="kl">{k.label}</span>
        {#if k.trend !== undefined && (week || prevWeek)}
          <span class="trend" class:up={k.trend >= 0}>{k.trend >= 0 ? "▲" : "▼"} {Math.abs(k.trend)} к прошлой неделе</span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="card" in:fly={{ y: 14, duration: 450, delay: 280, easing: cubicOut }}>
    <h3>Выполнено по дням</h3>
    <div class="chart">
      {#each days as x, i}
        <div class="col" role="img" aria-label="{label(x.d)}: {x.n}" onmouseenter={() => (hover = i)} onmouseleave={() => (hover = null)}>
          {#if hover === i}<span class="tip">{x.n} · {label(x.d)}</span>{/if}
          <i class:today={x.d === today()} style:height="{Math.max(3, (x.n / max) * 150 * grow.current)}px" style:transition-delay="{i * 25}ms"></i>
          <span class="dl">{parseIso(x.d).getDate()}</span>
        </div>
      {/each}
    </div>
  </div>

  <div class="grid2">
    <div class="card" in:fly={{ y: 14, duration: 450, delay: 340, easing: cubicOut }}>
      <h3>Активные по приоритету</h3>
      {#each byPrio as x}
        <div class="hb"><span>{PRIO[x.p]}</span><div><i style:width="{(x.n / prioMax) * 100 * grow.current}%" style:background="var(--p{x.p})"></i></div><b>{x.n}</b></div>
      {/each}
    </div>
    <div class="card" in:fly={{ y: 14, duration: 450, delay: 400, easing: cubicOut }}>
      <h3>Прогресс проектов</h3>
      {#each projects as p}
        <div class="hb"><span class="pn"><span class="dot" style:background={p.color}></span>{p.name}</span>
          <div><i style:width="{(p.done / p.total) * 100 * grow.current}%" style:background={p.color}></i></div><b>{p.done}/{p.total}</b></div>
      {:else}
        <p class="none">Задач пока нет</p>
      {/each}
    </div>
  </div>
</div>

<style>
  .page { max-width: 900px; margin: 0 auto; padding: 6px 40px 60px; overflow-y: auto; height: 100%; }
  h1 { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
  .sub { margin: 2px 0 22px; color: var(--mute); font-size: 13px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
  .kpi, .card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; }
  .kpi { display: flex; flex-direction: column; gap: 2px; position: relative; overflow: hidden; }
  .kpi::after { content: ""; position: absolute; right: -30px; top: -30px; width: 90px; height: 90px; border-radius: 50%; background: var(--c); opacity: 0.08; filter: blur(10px); }
  .ki { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; color: var(--c); background: color-mix(in oklab, var(--c) 15%, transparent); margin-bottom: 8px; }
  .kpi b { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .kl { font-size: 12.5px; color: var(--mute); }
  .trend { font-size: 11.5px; color: var(--late); margin-top: 4px; }
  .trend.up { color: var(--today); }
  .card { margin-bottom: 12px; }
  h3 { margin: 0 0 14px; font-size: 13.5px; font-weight: 600; }
  .chart { display: flex; align-items: flex-end; gap: 8px; height: 190px; }
  .col { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 6px; }
  .col i { width: 100%; max-width: 30px; border-radius: 7px 7px 3px 3px; background: linear-gradient(180deg, var(--accent), color-mix(in oklab, var(--accent) 35%, transparent)); transition: filter 0.15s; }
  .col i.today { background: linear-gradient(180deg, var(--today), color-mix(in oklab, var(--today) 35%, transparent)); }
  .col:hover i { filter: brightness(1.25); }
  .dl { font-size: 11px; color: var(--faint); }
  .tip { position: absolute; top: -6px; white-space: nowrap; font-size: 11.5px; padding: 3px 8px; border-radius: 6px; background: var(--surface-2); box-shadow: var(--shadow); z-index: 2; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .hb { display: grid; grid-template-columns: 110px 1fr 44px; align-items: center; gap: 10px; margin: 10px 0; font-size: 13px; }
  .hb > span { color: var(--mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pn { display: flex; align-items: center; gap: 8px; }
  .hb div { height: 8px; border-radius: 8px; background: var(--line); overflow: hidden; }
  .hb i { display: block; height: 100%; border-radius: 8px; }
  .hb b { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  .none { color: var(--faint); font-size: 13px; }
  @media (max-width: 980px) { .kpis { grid-template-columns: repeat(2, 1fr); } .grid2 { grid-template-columns: 1fr; } }
</style>

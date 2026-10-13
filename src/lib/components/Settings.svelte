<script lang="ts">
  import Icon from "./Icon.svelte";
  import { ACCENTS, store, type Theme } from "../store.svelte";
  import { exportData, importData } from "../io";

  const THEMES: { v: Theme; label: string; icon: string }[] = [
    { v: "system", label: "Как в системе", icon: "monitor" },
    { v: "dark", label: "Тёмная", icon: "moon" },
    { v: "light", label: "Светлая", icon: "sun" },
  ];
  const KEYS: [string, string][] = [
    ["Ctrl K", "Поиск и команды"],
    ["N", "Новая задача"],
    ["↑ ↓ / J K", "Перемещение по списку"],
    ["Space", "Выполнить / вернуть"],
    ["Enter", "Открыть задачу"],
    ["1 – 4", "Приоритет выбранной задачи"],
    ["Del", "Удалить задачу"],
    ["Ctrl D", "Дублировать"],
    ["Ctrl 1–5", "Разделы"],
    ["Ctrl B", "Боковая панель"],
  ];
</script>

<div class="page">
  <h1>Настройки</h1>
  <p class="sub">Оформление, данные и горячие клавиши</p>

  <section class="card">
    <h3>Тема</h3>
    <div class="seg">
      {#each THEMES as t}
        <button class:on={store.theme === t.v} onclick={() => store.setTheme(t.v)}><Icon name={t.icon} size={15} />{t.label}</button>
      {/each}
    </div>
    <h3>Акцентный цвет</h3>
    <div class="colors">
      {#each ACCENTS as c}
        <button class="sw" class:on={store.accent === c} style:background={c} aria-label="Акцент {c}" onclick={() => store.setAccent(c)}></button>
      {/each}
    </div>
  </section>

  <section class="card">
    <h3>Данные</h3>
    <p class="hint">Все задачи хранятся локально на этом компьютере. Сделайте резервную копию или перенесите задачи на другое устройство.</p>
    <div class="row">
      <button class="btn" onclick={() => exportData("json")}><Icon name="download" size={15} />Экспорт JSON</button>
      <button class="btn" onclick={() => exportData("csv")}><Icon name="download" size={15} />Экспорт в Excel</button>
      <button class="btn" onclick={importData}><Icon name="upload" size={15} />Импорт JSON</button>
    </div>
  </section>

  <section class="card">
    <h3>Умный ввод</h3>
    <p class="hint">Пишите задачу как обычно — FlowDo сам поймёт детали:</p>
    <div class="ex"><span>Отчёт для клиента</span> <mark class="p">!срочно</mark> <mark class="t">#работа</mark> <mark class="d">@пт</mark></div>
    <ul class="legend">
      <li><b>!низкий !высокий !срочно</b> или <b>!!</b> / <b>!!!</b> — приоритет</li>
      <li><b>#тег</b> — любое количество тегов</li>
      <li><b>@сегодня @завтра @пн…@вс @+3 @25.12 @неделя</b> — срок</li>
    </ul>
  </section>

  <section class="card">
    <h3>Горячие клавиши</h3>
    <div class="keys">
      {#each KEYS as [k, d]}<div><span>{d}</span><span>{#each k.split(" ") as part}<kbd>{part}</kbd>{/each}</span></div>{/each}
    </div>
  </section>

  <p class="ver">FlowDo {store.version}</p>
</div>

<style>
  .page { max-width: 760px; margin: 0 auto; padding: 6px 40px 60px; overflow-y: auto; height: 100%; }
  h1 { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
  .sub { margin: 2px 0 22px; color: var(--mute); font-size: 13px; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; margin-bottom: 12px; }
  h3 { margin: 0 0 10px; font-size: 13.5px; }
  h3:not(:first-child) { margin-top: 20px; }
  .seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--line); }
  .seg button { display: flex; align-items: center; gap: 7px; height: 32px; padding: 0 14px; border-radius: 8px; font-size: 13px; color: var(--mute); transition: all 0.2s var(--ease); }
  .seg button.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2), inset 0 0 0 1px var(--line); }
  .colors { display: flex; gap: 12px; }
  .sw { width: 28px; height: 28px; border-radius: 50%; transition: transform 0.2s var(--spring), box-shadow 0.2s; }
  .sw:hover { transform: scale(1.12); }
  .sw.on { box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px var(--text); }
  .hint { margin: -4px 0 12px; color: var(--mute); font-size: 13px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .ex { padding: 12px 14px; border-radius: 10px; background: var(--surface-2); font-size: 14.5px; }
  mark { padding: 1px 4px; border-radius: 5px; }
  mark.p { color: var(--p3); background: color-mix(in oklab, var(--p3) 18%, transparent); }
  mark.t { color: var(--accent-text); background: var(--accent-soft); }
  mark.d { color: var(--today); background: color-mix(in oklab, var(--today) 18%, transparent); }
  .legend { margin: 12px 0 0; padding-left: 18px; color: var(--mute); font-size: 13px; line-height: 1.9; }
  .legend b { color: var(--text); font-weight: 500; }
  .keys { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 28px; }
  .keys div { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--mute); padding: 4px 0; }
  .keys kbd { margin-left: 3px; }
  .ver { text-align: center; color: var(--faint); font-size: 12px; }
</style>

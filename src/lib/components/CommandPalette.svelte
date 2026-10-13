<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import Icon from "./Icon.svelte";
  import { PAGES, SMART, store, type View } from "../store.svelte";
  import { exportData, importData } from "../io";
  import { prettyDate } from "../dates";
  import { parseQuick } from "../parse";

  type Item = { group: string; title: string; icon: string; hint?: string; color?: string; done?: boolean; run: () => void };

  let q = $state("");
  let idx = $state(0);
  let list = $state<HTMLElement>();

  const go = (v: View) => () => store.go(v);
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

  const items = $derived.by<Item[]>(() => {
    const query = norm(q.trim());
    const has = (s: string) => !query || norm(s).includes(query);
    const out: Item[] = [];

    if (query) {
      const tasks = store.tasks
        .filter((t) => has(t.title) || norm(t.notes).includes(query) || t.tags.some((g) => has(g)))
        .sort((a, b) => +a.done - +b.done)
        .slice(0, 8);
      for (const t of tasks)
        out.push({
          group: "Задачи", title: t.title, icon: "check", done: t.done,
          hint: t.due ? prettyDate(t.due) : store.projects.find((p) => p.id === t.project_id)?.name,
          run: () => { store.openId = t.id; store.selectedId = t.id; },
        });
    }
    for (const s of SMART) if (has(s.title)) out.push({ group: "Перейти", title: s.title, icon: s.icon, color: s.color, hint: "Ctrl " + s.key, run: go({ kind: s.kind }) });
    for (const p of store.projects) if (has(p.name)) out.push({ group: "Перейти", title: p.name, icon: "folder", color: p.color, run: go({ kind: "project", id: p.id }) });
    for (const p of PAGES) if (has(p.title)) out.push({ group: "Перейти", title: p.title, icon: p.icon, run: go({ kind: p.kind }) });

    const actions: Item[] = [
      { group: "Действия", title: "Новый проект", icon: "plus", run: () => (store.projectDialog = { id: null }) },
      { group: "Действия", title: "Тёмная тема", icon: "moon", run: () => store.setTheme("dark") },
      { group: "Действия", title: "Светлая тема", icon: "sun", run: () => store.setTheme("light") },
      { group: "Действия", title: "Экспорт в JSON", icon: "download", run: () => exportData("json") },
      { group: "Действия", title: "Экспорт в Excel (CSV)", icon: "download", run: () => exportData("csv") },
      { group: "Действия", title: "Импорт из JSON", icon: "upload", run: importData },
      { group: "Действия", title: "Свернуть боковую панель", icon: "sidebar", hint: "Ctrl B", run: () => store.toggleSidebar() },
    ];
    out.push(...actions.filter((a) => has(a.title)));

    if (query) {
      const p = parseQuick(q);
      if (p.title)
        out.push({
          group: "Создать", title: `Создать задачу «${p.title}»`, icon: "plus",
          run: () => {
            const d = store.defaults();
            store.add({ title: p.title, priority: p.priority ?? 1, due: p.due ?? d.due, tags: [...(d.tags ?? []), ...p.tags], project_id: d.project_id });
          },
        });
    }
    return out;
  });

  $effect(() => { q; idx = 0; });
  $effect(() => { if (store.palette) q = ""; });
  $effect(() => { list?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" }); });

  function run(i: number) {
    const it = items[i];
    if (!it) return;
    store.palette = false;
    it.run();
  }
  function key(e: KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); idx = (idx + 1) % items.length; }
    else if (e.key === "ArrowUp") { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; }
    else if (e.key === "Enter") { e.preventDefault(); run(idx); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); store.palette = false; }
  }
  const autofocus = (n: HTMLInputElement) => n.focus();
</script>

{#if store.palette}
  <div class="overlay" role="presentation" onclick={() => (store.palette = false)} transition:fade={{ duration: 150 }}></div>
  <div class="pal" role="dialog" aria-label="Команды" transition:scale={{ start: 0.96, duration: 200, easing: cubicOut }}>
    <div class="inp">
      <Icon name="search" size={18} />
      <input use:autofocus bind:value={q} onkeydown={key} placeholder="Найти задачу, раздел или команду…  (можно сразу написать новую задачу)" spellcheck="false" />
      <kbd>Esc</kbd>
    </div>
    <div class="res" bind:this={list}>
      {#each items as it, i}
        {#if i === 0 || items[i - 1].group !== it.group}<div class="grp">{it.group}</div>{/if}
        <button class="it" class:on={i === idx} data-i={i} onmousemove={() => (idx = i)} onclick={() => run(i)}>
          <span class="ic" style:color={it.color ?? null}><Icon name={it.icon} size={16} /></span>
          <span class="t" class:done={it.done}>{it.title}</span>
          {#if it.hint}<span class="h">{it.hint}</span>{/if}
        </button>
      {:else}
        <div class="none">Ничего не найдено</div>
      {/each}
    </div>
    <div class="foot"><span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span><span><kbd>Enter</kbd> открыть</span><span><kbd>!срочно</kbd> <kbd>#тег</kbd> <kbd>@пт</kbd> при создании</span></div>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.35); backdrop-filter: blur(2px); }
  .pal {
    position: fixed; z-index: 61; top: 14vh; left: 50%; width: min(620px, calc(100vw - 40px)); margin-left: calc(min(620px, calc(100vw - 40px)) / -2);
    background: var(--glass); backdrop-filter: blur(30px) saturate(1.6); border-radius: 16px; box-shadow: var(--shadow); overflow: hidden;
  }
  .inp { display: flex; align-items: center; gap: 12px; padding: 0 16px; height: 56px; border-bottom: 1px solid var(--line); color: var(--mute); }
  .inp input { flex: 1; border: 0; outline: none; background: transparent; font-size: 16px; color: var(--text); }
  .inp input::placeholder { color: var(--faint); font-size: 14px; }
  .res { max-height: 380px; overflow-y: auto; padding: 6px; }
  .grp { padding: 10px 10px 4px; font-size: 11px; font-weight: 600; color: var(--faint); text-transform: uppercase; letter-spacing: 0.05em; }
  .it { display: flex; align-items: center; gap: 12px; width: 100%; height: 40px; padding: 0 10px; border-radius: 9px; text-align: left; }
  .it.on { background: var(--accent-soft); }
  .it.on .ic { color: var(--accent-text); }
  .ic { display: grid; color: var(--mute); }
  .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .t.done { color: var(--faint); text-decoration: line-through; }
  .h { font-size: 12px; color: var(--faint); }
  .none { padding: 30px; text-align: center; color: var(--faint); }
  .foot { display: flex; gap: 16px; padding: 8px 14px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--faint); }
  .foot kbd { margin-right: 2px; }
</style>

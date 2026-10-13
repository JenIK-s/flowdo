<script lang="ts">
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import Icon from "./Icon.svelte";
  import { api, type Activity } from "../api";
  import { store } from "../store.svelte";
  import { prettyDate } from "../dates";

  const ACT: Record<string, [string, string, string]> = {
    created: ["Создана задача", "plus", "#3b82f6"],
    updated: ["Изменена", "edit", "#64748b"],
    completed: ["Выполнена", "check", "#10b981"],
    reopened: ["Возвращена в работу", "history", "#f59e0b"],
    deleted: ["Удалена", "trash", "#ef4444"],
    restored: ["Восстановлена", "history", "#8b5cf6"],
    cleared: ["Очистка выполненных", "trash", "#ef4444"],
    imported: ["Импорт", "upload", "#14b8a6"],
    project_created: ["Создан проект", "folder", "#8b5cf6"],
    project_deleted: ["Удалён проект", "folder", "#ef4444"],
  };

  let items = $state<Activity[]>([]);
  let loaded = $state(false);
  $effect(() => {
    store.tasks.length; // обновляем при изменениях
    api.activity(400).then((a) => { items = a; loaded = true; }).catch((e) => store.error(e));
  });

  const days = $derived.by(() => {
    const m = new Map<string, Activity[]>();
    for (const a of items) {
      const d = a.ts.slice(0, 10);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(a);
    }
    return [...m.entries()];
  });
</script>

<div class="page">
  <h1>Журнал</h1>
  <p class="sub">История всех изменений</p>
  {#each days as [d, list], gi (d)}
    <section in:fly={{ y: 12, duration: 400, delay: Math.min(gi, 5) * 60, easing: cubicOut }}>
      <h3>{prettyDate(d)}</h3>
      <ul>
        {#each list as a (a.id)}
          {@const m = ACT[a.action] ?? [a.action, "history", "#64748b"]}
          <li>
            <span class="ic" style="--c:{m[2]}"><Icon name={m[1]} size={13} stroke={2.2} /></span>
            <span class="what">{m[0]}</span>
            <span class="det">{a.detail}</span>
            <time>{a.ts.slice(11, 16)}</time>
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    {#if loaded}<p class="none">Событий пока нет</p>{/if}
  {/each}
</div>

<style>
  .page { max-width: 900px; margin: 0 auto; padding: 6px 40px 60px; overflow-y: auto; height: 100%; }
  h1 { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
  .sub { margin: 2px 0 18px; color: var(--mute); font-size: 13px; }
  h3 { margin: 18px 0 6px; font-size: 12.5px; color: var(--mute); font-weight: 600; }
  ul { list-style: none; margin: 0; padding: 0 0 0 4px; position: relative; }
  ul::before { content: ""; position: absolute; left: 15px; top: 10px; bottom: 10px; width: 1px; background: var(--line-2); }
  li { position: relative; display: flex; align-items: center; gap: 12px; padding: 7px 8px 7px 0; border-radius: 8px; font-size: 13.5px; }
  .ic { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; color: var(--c); background: var(--bg); box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--c) 50%, transparent); z-index: 1; flex: none; }
  .what { color: var(--mute); white-space: nowrap; }
  .det { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  time { color: var(--faint); font-size: 12px; font-variant-numeric: tabular-nums; }
  .none { color: var(--faint); }
</style>

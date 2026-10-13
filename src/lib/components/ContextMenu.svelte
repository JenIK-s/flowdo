<script lang="ts">
  import { scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import Icon from "./Icon.svelte";
  import { PRIO, store } from "../store.svelte";
  import { addDays, today } from "../dates";

  const m = $derived(store.menu);
  const task = $derived(m ? store.tasks.find((t) => t.id === m.id) : null);
  let el = $state<HTMLElement>();
  let pos = $state({ x: 0, y: 0 });

  // не даём меню вылезти за край окна
  $effect(() => {
    if (!m || !el) return;
    const r = el.getBoundingClientRect();
    pos = { x: Math.min(m.x, innerWidth - r.width - 8), y: Math.min(m.y, innerHeight - r.height - 8) };
  });

  const close = () => (store.menu = null);
  const act = (fn: () => void) => () => { close(); fn(); };
</script>

<svelte:window onpointerdown={(e) => { if (m && el && !el.contains(e.target as Node)) close(); }}
  onkeydowncapture={(e) => { if (m && e.key === "Escape") { e.stopPropagation(); close(); } }} onblur={close} />

{#if m && task}
  <div class="ctx" bind:this={el} style:left="{pos.x || m.x}px" style:top="{pos.y || m.y}px" transition:scale={{ start: 0.95, duration: 130, easing: cubicOut }}>
    <button class="mi" onclick={act(() => (store.openId = task.id))}><Icon name="edit" size={14} />Открыть<span class="r">Enter</span></button>
    <button class="mi" onclick={act(() => store.toggle(task.id))}><Icon name="done" size={14} />{task.done ? "Вернуть в работу" : "Выполнить"}<span class="r">Space</span></button>
    <hr />
    <div class="row">
      <span class="lbl">Срок</span>
      <button title="Сегодня" onclick={act(() => store.update(task.id, { due: today() }))}><Icon name="sun" size={15} /></button>
      <button title="Завтра" onclick={act(() => store.update(task.id, { due: addDays(1) }))}><Icon name="arrow" size={15} /></button>
      <button title="Через неделю" onclick={act(() => store.update(task.id, { due: addDays(7) }))}><Icon name="calendar" size={15} /></button>
      <button title="Без срока" onclick={act(() => store.update(task.id, { due: null }))}><Icon name="x" size={15} /></button>
    </div>
    <div class="row">
      <span class="lbl">Приоритет</span>
      {#each [3, 2, 1, 0] as p}
        <button title={PRIO[p]} class:on={task.priority === p} style="color:var(--p{p})" onclick={act(() => store.update(task.id, { priority: p }))}><Icon name="flag" size={15} /></button>
      {/each}
    </div>
    <hr />
    <div class="cap">Переместить</div>
    <button class="mi" class:on={task.project_id == null} onclick={act(() => store.update(task.id, { project_id: null }))}><Icon name="inbox" size={14} />Входящие</button>
    {#each store.projects as p (p.id)}
      <button class="mi" class:on={task.project_id === p.id} onclick={act(() => store.update(task.id, { project_id: p.id }))}><span class="dot" style:background={p.color}></span>{p.name}</button>
    {/each}
    <hr />
    <button class="mi" onclick={act(() => store.duplicate(task.id))}><Icon name="copy" size={14} />Дублировать<span class="r">Ctrl D</span></button>
    <button class="mi danger" onclick={act(() => store.remove(task.id))}><Icon name="trash" size={14} />Удалить<span class="r">Del</span></button>
  </div>
{/if}

<style>
  .ctx {
    position: fixed; z-index: 70; width: 236px; padding: 6px; max-height: calc(100vh - 16px); overflow-y: auto;
    background: var(--glass); backdrop-filter: blur(24px) saturate(1.5); border-radius: 12px; box-shadow: var(--shadow); transform-origin: top left;
  }
  .mi { display: flex; align-items: center; gap: 10px; width: 100%; height: 32px; padding: 0 10px; border-radius: 7px; font-size: 13px; text-align: left; }
  .mi:hover { background: var(--hover); }
  .mi.on { color: var(--accent-text); }
  .mi.danger { color: var(--late); }
  .r { margin-left: auto; color: var(--faint); font-size: 11.5px; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 5px 4px; }
  .cap { padding: 4px 10px; font-size: 11px; font-weight: 600; color: var(--faint); text-transform: uppercase; letter-spacing: 0.04em; }
  .row { display: flex; align-items: center; gap: 2px; padding: 2px 6px 2px 10px; }
  .lbl { flex: 1; font-size: 12.5px; color: var(--mute); }
  .row button { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 7px; color: var(--mute); }
  .row button:hover { background: var(--hover); color: var(--text); }
  .row button.on { background: var(--hover); box-shadow: inset 0 0 0 1px currentColor; }
</style>

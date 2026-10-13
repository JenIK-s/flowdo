<script lang="ts">
  import Checkbox from "./Checkbox.svelte";
  import Icon from "./Icon.svelte";
  import type { Task } from "../api";
  import { dueTone, prettyDate } from "../dates";
  import { store } from "../store.svelte";

  let { task }: { task: Task } = $props();

  let editing = $state(false);
  let draft = $state("");
  let over = $state<"before" | "after" | null>(null);
  let el: HTMLElement;

  const completing = $derived(store.completing.includes(task.id));
  const project = $derived(store.view.kind !== "project" ? store.projects.find((p) => p.id === task.project_id) : null);
  const subsDone = $derived(task.subtasks.filter((s) => s.d).length);
  const selected = $derived(store.selectedId === task.id || store.openId === task.id);

  $effect(() => {
    if (store.selectedId === task.id) el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  function startEdit(e: MouseEvent) {
    e.stopPropagation();
    draft = task.title;
    editing = true;
  }
  function commit() {
    editing = false;
    const v = draft.trim();
    if (v && v !== task.title) store.update(task.id, { title: v });
  }
  function focusSelect(node: HTMLInputElement) { node.focus(); node.select(); }

  function dragstart(e: DragEvent) {
    store.dragId = task.id;
    e.dataTransfer!.effectAllowed = "move";
    e.dataTransfer!.setData("text/plain", task.title);
  }
  function dragover(e: DragEvent) {
    if (store.dragId == null || store.dragId === task.id || !store.canDrag) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    over = e.clientY > r.top + r.height / 2 ? "after" : "before";
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    if (store.dragId != null && over) store.reorder(store.dragId, task.id, over === "after");
    over = null;
  }
  function menu(e: MouseEvent) {
    e.preventDefault();
    store.selectedId = task.id;
    store.menu = { x: e.clientX, y: e.clientY, id: task.id };
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div bind:this={el} class="item" class:done={task.done} class:completing class:selected class:drag={store.dragId === task.id}
  class:over-before={over === "before"} class:over-after={over === "after"}
  role="listitem" draggable={store.canDrag && !task.done && !editing}
  ondragstart={dragstart} ondragend={() => { store.dragId = null; over = null; }}
  ondragover={dragover} ondragleave={() => (over = null)} ondrop={drop}
  onclick={() => { store.selectedId = task.id; store.openId = task.id; }} oncontextmenu={menu}
  onkeydown={() => {}}>
  {#if store.canDrag && !task.done}<span class="grip"><Icon name="grip" size={14} /></span>{/if}
  <Checkbox checked={task.done || completing} priority={task.priority} onchange={() => store.toggle(task.id)} />
  <div class="body">
    {#if editing}
      <input class="edit" bind:value={draft} use:focusSelect onclick={(e) => e.stopPropagation()} onblur={commit}
        onkeydown={(e) => { e.stopPropagation(); if (e.key === "Enter") commit(); if (e.key === "Escape") editing = false; }} maxlength="300" />
    {:else}
      <div class="title" role="textbox" tabindex="-1" ondblclick={startEdit}>{task.title}</div>
    {/if}
    {#if task.due || task.tags.length || task.subtasks.length || task.notes || project}
      <div class="meta">
        {#if task.due}<span class="chip {task.done ? '' : dueTone(task.due)}"><Icon name="calendar" size={12} />{prettyDate(task.due)}</span>{/if}
        {#if task.subtasks.length}
          <span class="chip" class:full={subsDone === task.subtasks.length}>
            <svg viewBox="0 0 16 16" width="12" height="12"><circle cx="8" cy="8" r="6" class="trk" /><circle cx="8" cy="8" r="6" class="val"
              style:stroke-dashoffset={37.7 * (1 - subsDone / task.subtasks.length)} /></svg>{subsDone}/{task.subtasks.length}
          </span>
        {/if}
        {#if task.notes}<span class="chip icon" title="Есть заметки"><Icon name="notes" size={12} /></span>{/if}
        {#each task.tags as t}<span class="chip tag">#{t}</span>{/each}
        {#if project}<span class="proj"><span class="dot" style:background={project.color}></span>{project.name}</span>{/if}
      </div>
    {/if}
  </div>
  <div class="acts">
    <button class="icon-btn" title="Переименовать" onclick={startEdit}><Icon name="edit" size={15} /></button>
    <button class="icon-btn del" title="Удалить (Del)" onclick={(e) => { e.stopPropagation(); store.remove(task.id); }}><Icon name="trash" size={15} /></button>
  </div>
</div>

<style>
  .item {
    position: relative; display: flex; align-items: flex-start; gap: 12px; padding: 11px 10px 11px 14px; border-radius: 11px;
    transition: background 0.15s, opacity 0.3s, transform 0.2s var(--ease); --pad: 1px;
  }
  .item :global(.cb) { margin-top: 1px; }
  .item:hover { background: var(--hover); }
  .item.selected { background: var(--accent-soft); }
  .item.drag { opacity: 0.35; transform: scale(0.98); }
  .item.over-before::before, .item.over-after::after {
    content: ""; position: absolute; left: 10px; right: 10px; height: 2px; border-radius: 2px; background: var(--accent);
    box-shadow: 0 0 10px var(--accent);
  }
  .item.over-before::before { top: -1px; }
  .item.over-after::after { bottom: -1px; }
  .grip { position: absolute; left: -4px; top: 13px; color: var(--faint); opacity: 0; cursor: grab; transition: opacity 0.15s; }
  .item:hover .grip { opacity: 1; }
  .body { flex: 1; min-width: 0; }
  .title {
    font-size: 14.5px; line-height: 22px; word-break: break-word; width: fit-content; max-width: 100%;
    background: linear-gradient(currentColor, currentColor) no-repeat 0 55% / 0 1.5px; transition: background-size 0.35s var(--ease), color 0.3s;
  }
  .done .title, .completing .title { color: var(--faint); background-size: 100% 1.5px; }
  .completing { animation: settle 0.7s var(--ease); }
  @keyframes settle { 0%, 60% { opacity: 1; } 100% { opacity: 0.5; } }
  .edit {
    width: 100%; font-size: 14.5px; line-height: 22px; padding: 0 6px; margin-left: -6px; border-radius: 6px;
    background: var(--surface); border: 1px solid var(--accent); box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 5px; }
  .chip.icon { padding: 0 5px; }
  .chip svg { transform: rotate(-90deg); }
  .trk { fill: none; stroke: var(--line-2); stroke-width: 2.5; }
  .val { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-dasharray: 37.7; transition: stroke-dashoffset 0.4s var(--ease); }
  .chip.full { color: var(--today); }
  .chip.full .val { stroke: var(--today); }
  .proj { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--mute); padding: 0 4px; }
  .proj .dot { width: 7px; height: 7px; }
  .acts { display: flex; gap: 2px; opacity: 0; transform: translateX(4px); transition: opacity 0.15s, transform 0.2s var(--ease); }
  .item:hover .acts { opacity: 1; transform: none; }
  .acts .del:hover { color: var(--late); }
  .done { opacity: 0.75; }
</style>

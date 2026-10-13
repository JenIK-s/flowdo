<script lang="ts">
  import { fly, fade, slide } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import Checkbox from "./Checkbox.svelte";
  import DatePicker from "./DatePicker.svelte";
  import Icon from "./Icon.svelte";
  import PriorityPicker from "./PriorityPicker.svelte";
  import ProjectPicker from "./ProjectPicker.svelte";
  import type { Sub, Task } from "../api";
  import { store } from "../store.svelte";

  const task = $derived(store.openTask);

  let title = $state("");
  let notes = $state("");
  let tagDraft = $state("");
  let subDraft = $state("");
  let loadedId = -1;
  let timer: ReturnType<typeof setTimeout>;

  // при открытии другой задачи подставляем её поля (локальные черновики не перетираются при сохранении)
  $effect(() => {
    if (task && task.id !== loadedId) {
      flush();
      loadedId = task.id;
      title = task.title;
      notes = task.notes;
      tagDraft = subDraft = "";
    }
    if (!task) loadedId = -1;
  });

  let pending: { id: number; title: string; notes: string } | null = null;
  function queue() {
    if (!task) return;
    pending = { id: task.id, title, notes };
    clearTimeout(timer);
    timer = setTimeout(flush, 450);
  }
  function flush() {
    clearTimeout(timer);
    if (!pending) return;
    const { id, title: t, notes: n } = pending;
    pending = null;
    const cur = store.tasks.find((x) => x.id === id);
    if (!cur) return;
    const patch: Partial<Task> = {};
    if (t.trim() && t.trim() !== cur.title) patch.title = t.trim();
    if (n !== cur.notes) patch.notes = n;
    if (Object.keys(patch).length) store.update(id, patch);
  }

  function close() { flush(); store.openId = null; }
  const setSubs = (subs: Sub[]) => task && store.update(task.id, { subtasks: subs });

  function addTag() {
    const t = tagDraft.trim().replace(/^#/, "").toLowerCase();
    if (task && t && !task.tags.includes(t)) store.update(task.id, { tags: [...task.tags, t] });
    tagDraft = "";
  }
  function addSub() {
    const t = subDraft.trim();
    if (task && t) setSubs([...task.subtasks, { t, d: false }]);
    subDraft = "";
  }
  function autosize(node: HTMLTextAreaElement, _v?: string) {
    const fit = () => { node.style.height = "auto"; node.style.height = node.scrollHeight + "px"; };
    fit();
    return { update: fit };
  }
  const fmt = (s: string) => new Date(s).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const subsDone = $derived(task ? task.subtasks.filter((s) => s.d).length : 0);
</script>

<svelte:window onkeydown={(e) => { if (task && e.key === "Escape" && !(e.target as HTMLElement).closest(".menu")) { e.preventDefault(); close(); } }} />

{#if task}
  <div class="backdrop" role="presentation" onclick={close} transition:fade={{ duration: 200 }}></div>
  <aside class="panel" transition:fly={{ x: 420, duration: 380, easing: cubicOut, opacity: 1 }}>
    <div class="top">
      <Checkbox checked={task.done} priority={task.priority} size={22} onchange={() => store.toggle(task.id)} />
      <span class="state" class:ok={task.done}>{task.done ? "Выполнена" : "В работе"}</span>
      <span class="grow"></span>
      <button class="icon-btn" title="Дублировать" onclick={() => store.duplicate(task.id)}><Icon name="copy" size={16} /></button>
      <button class="icon-btn del" title="Удалить" onclick={() => store.remove(task.id)}><Icon name="trash" size={16} /></button>
      <button class="icon-btn" title="Закрыть (Esc)" onclick={close}><Icon name="x" size={18} /></button>
    </div>

    <div class="scroll">
      <textarea class="title" rows="1" bind:value={title} use:autosize={title} oninput={queue} onblur={flush} maxlength="300"
        placeholder="Название задачи" onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLElement).blur(); } }}></textarea>

      <div class="props">
        <span class="k"><Icon name="calendar" size={15} />Срок</span>
        <div><DatePicker value={task.due} onchange={(v) => store.update(task.id, { due: v })} placeholder="Без срока" /></div>
        <span class="k"><Icon name="flag" size={15} />Приоритет</span>
        <div><PriorityPicker value={task.priority} onchange={(v) => store.update(task.id, { priority: v })} /></div>
        <span class="k"><Icon name="folder" size={15} />Проект</span>
        <div><ProjectPicker value={task.project_id} onchange={(v) => store.update(task.id, { project_id: v })} /></div>
        <span class="k"><Icon name="hash" size={15} />Теги</span>
        <div class="tags">
          {#each task.tags as t (t)}
            <span class="chip tag" transition:fly={{ y: 4, duration: 160 }}>#{t}
              <button aria-label="Убрать тег" onclick={() => store.update(task.id, { tags: task.tags.filter((x) => x !== t) })}><Icon name="x" size={11} /></button>
            </span>
          {/each}
          <input class="tag-in" placeholder="+ тег" bind:value={tagDraft} onblur={addTag}
            onkeydown={(e) => { if (e.key === "Enter" || e.key === "," || e.key === " ") { e.preventDefault(); addTag(); } }} />
        </div>
      </div>

      <div class="sec">
        <div class="sec-h">
          <Icon name="subtasks" size={15} />Подзадачи
          {#if task.subtasks.length}<span class="cnt">{subsDone} из {task.subtasks.length}</span>{/if}
        </div>
        {#if task.subtasks.length}
          <div class="bar"><i style:width="{(subsDone / task.subtasks.length) * 100}%"></i></div>
        {/if}
        {#each task.subtasks as s, i (i + s.t)}
          <div class="sub" animate:flip={{ duration: 200 }} transition:slide={{ duration: 180 }}>
            <Checkbox checked={s.d} size={17} onchange={() => setSubs(task.subtasks.map((x, j) => (j === i ? { ...x, d: !x.d } : x)))} />
            <input class:dn={s.d} value={s.t} onchange={(e) => setSubs(task.subtasks.map((x, j) => (j === i ? { ...x, t: e.currentTarget.value } : x)))} />
            <button class="icon-btn x" aria-label="Удалить подзадачу" onclick={() => setSubs(task.subtasks.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
          </div>
        {/each}
        <div class="sub add">
          <span class="plus"><Icon name="plus" size={15} /></span>
          <input placeholder="Добавить подзадачу" bind:value={subDraft} onkeydown={(e) => { if (e.key === "Enter") addSub(); }} />
        </div>
      </div>

      <div class="sec">
        <div class="sec-h"><Icon name="notes" size={15} />Заметки</div>
        <textarea class="notes" bind:value={notes} use:autosize={notes} oninput={queue} onblur={flush} placeholder="Детали, ссылки, мысли…"></textarea>
      </div>
    </div>

    <footer>
      Создана {fmt(task.created_at)}{#if task.completed_at} · выполнена {fmt(task.completed_at)}{/if}
    </footer>
  </aside>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 30; background: rgba(0, 0, 0, 0.18); }
  .panel {
    position: fixed; top: 8px; right: 8px; bottom: 8px; z-index: 31; width: min(440px, calc(100vw - 80px));
    display: flex; flex-direction: column; background: var(--surface); border-radius: 16px; box-shadow: var(--shadow), -30px 0 80px -30px rgba(0, 0, 0, 0.5);
  }
  .top { display: flex; align-items: center; gap: 8px; padding: 14px 14px 10px 20px; }
  .state { font-size: 12.5px; color: var(--mute); }
  .state.ok { color: var(--today); }
  .grow { flex: 1; }
  .del:hover { color: var(--late); }
  .scroll { flex: 1; overflow-y: auto; padding: 0 20px 20px; }
  textarea { width: 100%; resize: none; border: 0; background: transparent; padding: 0; overflow: hidden; line-height: 1.5; }
  .title { font-size: 21px; font-weight: 650; letter-spacing: -0.01em; margin: 6px 0 14px; }
  .props { display: grid; grid-template-columns: 112px 1fr; align-items: center; gap: 8px 10px; padding: 12px 0 16px; border-bottom: 1px solid var(--line); }
  .k { display: flex; align-items: center; gap: 8px; color: var(--mute); font-size: 13px; }
  .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  .tags .chip { height: 24px; padding-right: 4px; }
  .tags .chip button { display: grid; opacity: 0.6; border-radius: 4px; }
  .tags .chip button:hover { opacity: 1; }
  .tag-in { width: 80px; height: 26px; padding: 0 6px; border: 0; background: transparent; font-size: 13px; border-radius: 6px; }
  .tag-in:focus { background: var(--hover); }
  .sec { padding: 16px 0 4px; }
  .sec-h { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--mute); margin-bottom: 8px; }
  .cnt { margin-left: auto; font-weight: 500; color: var(--faint); }
  .bar { height: 4px; border-radius: 4px; background: var(--line); margin-bottom: 8px; overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--accent), var(--today)); transition: width 0.4s var(--ease); }
  .sub { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 6px; border-radius: 8px; }
  .sub:hover { background: var(--hover); }
  .sub input { flex: 1; height: 30px; border: 0; background: transparent; font-size: 14px; }
  .sub input.dn { color: var(--faint); text-decoration: line-through; }
  .sub .x { width: 26px; height: 26px; opacity: 0; }
  .sub:hover .x { opacity: 1; }
  .add .plus { display: grid; place-items: center; width: 17px; color: var(--accent); }
  .add input::placeholder { color: var(--faint); }
  .notes { min-height: 90px; font-size: 14px; padding: 10px 12px; border-radius: 10px; background: var(--surface-2); border: 1px solid var(--line); }
  .notes:focus { border-color: var(--accent); }
  footer { padding: 12px 20px; font-size: 11.5px; color: var(--faint); border-top: 1px solid var(--line); }
</style>

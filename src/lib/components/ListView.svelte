<script lang="ts">
  import { flip } from "svelte/animate";
  import { fly, slide, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { Tween } from "svelte/motion";
  import Composer from "./Composer.svelte";
  import Dropdown from "./Dropdown.svelte";
  import Icon from "./Icon.svelte";
  import TaskItem from "./TaskItem.svelte";
  import { SMART, store, type Sort } from "../store.svelte";
  import { tasksWord, plural } from "../dates";

  let composer = $state<Composer>();
  let sortOpen = $state(false);
  let moreOpen = $state(false);
  export const focusComposer = () => composer?.focus();

  const meta = $derived(
    store.project
      ? { title: store.project.name, icon: "folder", color: store.project.color }
      : SMART.find((s) => s.kind === store.view.kind) ?? SMART[0],
  );
  const p = $derived(store.progress);
  const ring = new Tween(0, { duration: 700, easing: cubicOut });
  $effect(() => { ring.target = p.pct; });

  const subtitle = $derived.by(() => {
    if (store.view.kind === "done") return p.done ? `${tasksWord(p.done)} выполнено` : "Здесь появятся выполненные задачи";
    if (!p.total) return "Пока пусто — добавьте первую задачу";
    if (!p.left) return "Всё сделано — отличная работа ✨";
    return `Осталось ${tasksWord(p.left)}` + (p.late ? ` · ${p.late} ${plural(p.late, "просрочена", "просрочены", "просрочено")}` : "");
  });
  const SORTS: { v: Sort; label: string }[] = [
    { v: "manual", label: "Вручную" },
    { v: "priority", label: "По приоритету" },
    { v: "due", label: "По сроку" },
  ];
  const tags = $derived([...new Set(store.scope.filter((t) => !t.done).flatMap((t) => t.tags))].sort());
  const groups = $derived(store.groups);
  const empty = $derived(groups.every((g) => !g.tasks.length));
  const showComposer = $derived(store.view.kind !== "done");
  const EMPTY: Record<string, [string, string]> = {
    today: ["На сегодня всё чисто", "Наслаждайтесь днём или запланируйте что-нибудь новое"],
    upcoming: ["Ничего не запланировано", "Добавьте задачу со сроком: «Встреча @пт»"],
    done: ["Пока ничего не выполнено", "Отмечайте задачи — они появятся здесь"],
    default: ["Здесь пока пусто", "Введите задачу выше и нажмите Enter"],
  };
  const emptyText = $derived(store.tag ? ["Нет задач с этим тегом", "Снимите фильтр, чтобы увидеть все задачи"] : EMPTY[store.view.kind] ?? EMPTY.default);
</script>

<div class="view">
  <header>
    <div class="ico" style="--c:{meta.color}"><Icon name={meta.icon} size={22} stroke={2} /></div>
    <div class="ttl">
      {#key store.view.kind + (store.view.id ?? "")}
        <h1 in:fly={{ y: 8, duration: 300, easing: cubicOut }}>{meta.title}</h1>
      {/key}
      <p>{subtitle}</p>
    </div>
    <div class="tools">
      {#if store.view.kind !== "done" && store.view.kind !== "upcoming"}
        <Dropdown bind:open={sortOpen} align="right">
          {#snippet trigger()}
            <button class="icon-btn" class:active={store.sort !== "manual"} title="Сортировка" onclick={() => (sortOpen = !sortOpen)}><Icon name="sort" /></button>
          {/snippet}
          <div class="cap">Сортировка</div>
          {#each SORTS as s}
            <button class="mi" class:on={store.sort === s.v} onclick={() => { store.setSort(s.v); sortOpen = false; }}>
              {s.label}{#if store.sort === s.v}<span class="r"><Icon name="check" size={14} /></span>{/if}
            </button>
          {/each}
        </Dropdown>
      {/if}
      <Dropdown bind:open={moreOpen} align="right" width={230}>
        {#snippet trigger()}
          <button class="icon-btn" title="Ещё" onclick={() => (moreOpen = !moreOpen)}><Icon name="more" /></button>
        {/snippet}
        {#if store.view.kind !== "done"}
          <button class="mi" onclick={() => { store.toggleShowDone(); moreOpen = false; }}>
            <Icon name="done" size={14} />{store.showDone ? "Скрыть" : "Показать"} выполненные
          </button>
        {/if}
        <button class="mi" onclick={() => { store.clearCompleted(); moreOpen = false; }}><Icon name="trash" size={14} />Убрать выполненные</button>
        {#if store.project}
          <hr />
          <button class="mi" onclick={() => { store.projectDialog = { id: store.project!.id }; moreOpen = false; }}><Icon name="edit" size={14} />Изменить проект</button>
        {/if}
      </Dropdown>
      <div class="ring" title="{p.done} из {p.total} выполнено">
        <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="bg" /><circle cx="22" cy="22" r="18" class="fg" style:stroke-dashoffset={113.1 * (1 - ring.current / 100)} /></svg>
        <b>{Math.round(ring.current)}%</b>
      </div>
    </div>
  </header>

  <div class="scroll">
    <div class="inner">
      {#if showComposer}<Composer bind:this={composer} />{/if}

      {#if tags.length}
        <div class="tags" transition:slide={{ duration: 200 }}>
          {#each tags as t (t)}
            <button class="chip tag" class:on={store.tag === t} onclick={() => (store.tag = store.tag === t ? null : t)}>#{t}</button>
          {/each}
        </div>
      {/if}

      {#each groups as g (g.key)}
        {#if g.tasks.length}
          <section transition:slide={{ duration: 250, easing: cubicOut }}>
            {#if g.title}<h3 class={g.tone}>{g.title}<span>{g.tasks.length}</span></h3>{/if}
            <div class="list" role="list">
              {#each g.tasks as task (task.id)}
                <div animate:flip={{ duration: 320, easing: cubicOut }} in:fly={{ y: -10, duration: 320, easing: cubicOut }} out:slide={{ duration: 220 }}>
                  <TaskItem {task} />
                </div>
              {/each}
            </div>
          </section>
        {/if}
      {/each}

      {#if empty}
        <div class="empty" in:fade={{ duration: 300, delay: 150 }}>
          <svg viewBox="0 0 120 100" width="120" height="100" aria-hidden="true">
            <defs><linearGradient id="eg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".9" /><stop offset="1" stop-color="var(--accent)" stop-opacity=".25" /></linearGradient></defs>
            <rect x="22" y="14" width="76" height="72" rx="14" fill="url(#eg)" opacity=".18" />
            <rect x="32" y="28" width="56" height="10" rx="5" fill="var(--accent)" opacity=".5" />
            <rect x="32" y="46" width="40" height="10" rx="5" fill="var(--accent)" opacity=".3" />
            <rect x="32" y="64" width="48" height="10" rx="5" fill="var(--accent)" opacity=".2" />
            <circle cx="96" cy="22" r="12" fill="var(--accent)" class="pulse" /><path d="M90 22l4 4 8-8" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <b>{emptyText[0]}</b><span>{emptyText[1]}</span>
        </div>
      {/if}

      {#if store.view.kind !== "done" && store.completed.length}
        <button class="done-toggle" onclick={() => store.toggleShowDone()}>
          <span class="chev" class:open={store.showDone}><Icon name="right" size={14} /></span>
          Выполнено <span class="n">{store.completed.length}</span>
        </button>
        {#if store.showDone}
          <div class="list" role="list" transition:slide={{ duration: 260, easing: cubicOut }}>
            {#each store.completed as task (task.id)}
              <div animate:flip={{ duration: 300 }} in:fade={{ duration: 200 }} out:slide={{ duration: 200 }}><TaskItem {task} /></div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .view { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { display: flex; align-items: center; gap: 14px; padding: 6px 40px 16px; max-width: 900px; width: 100%; margin: 0 auto; }
  .ico {
    display: grid; place-items: center; width: 44px; height: 44px; border-radius: 13px; color: var(--c);
    background: color-mix(in oklab, var(--c) 15%, transparent); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--c) 25%, transparent);
  }
  .ttl { flex: 1; min-width: 0; }
  h1 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  p { margin: 2px 0 0; color: var(--mute); font-size: 13px; }
  .tools { display: flex; align-items: center; gap: 4px; }
  .icon-btn.active { color: var(--accent-text); background: var(--accent-soft); }
  .ring { position: relative; width: 44px; height: 44px; margin-left: 8px; }
  .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .ring circle { fill: none; stroke-width: 4; }
  .ring .bg { stroke: var(--line); }
  .ring .fg { stroke: var(--accent); stroke-linecap: round; stroke-dasharray: 113.1; filter: drop-shadow(0 0 4px color-mix(in oklab, var(--accent) 60%, transparent)); }
  .ring b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }
  .inner { max-width: 900px; margin: 0 auto; padding: 0 40px 120px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: -6px 0 14px; }
  .tags .chip { height: 24px; padding: 0 9px; cursor: pointer; background: transparent; border: 1px solid var(--line); color: var(--mute); transition: all 0.15s; }
  .tags .chip:hover { border-color: var(--accent); color: var(--accent-text); }
  .tags .chip.on { background: var(--accent); color: white; border-color: transparent; }
  section { margin-bottom: 12px; }
  h3 { display: flex; align-items: center; gap: 8px; margin: 14px 0 4px 14px; font-size: 12.5px; font-weight: 600; color: var(--mute); }
  h3 span { font-weight: 500; color: var(--faint); }
  h3.late { color: var(--late); }
  h3.p3 { color: var(--p3); } h3.p2 { color: var(--p2); }
  .list { display: flex; flex-direction: column; gap: 1px; }
  .empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; padding: 56px 0 24px; color: var(--mute); }
  .empty b { margin-top: 10px; color: var(--text); font-size: 15px; }
  .empty span { font-size: 13px; }
  .pulse { animation: pulse 2.4s ease-in-out infinite; transform-origin: 96px 22px; }
  @keyframes pulse { 50% { transform: scale(1.12); } }
  .done-toggle { display: flex; align-items: center; gap: 6px; margin: 18px 0 6px 6px; padding: 4px 8px; border-radius: 7px; font-size: 13px; font-weight: 600; color: var(--mute); }
  .done-toggle:hover { background: var(--hover); color: var(--text); }
  .chev { display: grid; transition: transform 0.25s var(--ease); }
  .chev.open { transform: rotate(90deg); }
  .n { color: var(--faint); font-weight: 500; }
</style>

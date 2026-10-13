<script lang="ts">
  import { flip } from "svelte/animate";
  import { fly } from "svelte/transition";
  import Icon from "./Icon.svelte";
  import { PAGES, SMART, store, type View } from "../store.svelte";

  let { mac = false }: { mac?: boolean } = $props();
  let dropKey = $state<string | null>(null);

  const key = (v: View) => v.kind + (v.id ?? "");
  const active = (v: View) => store.view.kind === v.kind && (v.kind !== "project" || store.view.id === v.id);

  // перетаскивание задач на разделы и проекты, а также сортировка проектов
  function over(e: DragEvent, v: View) {
    if (store.dragId != null && v.kind !== "all") { e.preventDefault(); dropKey = key(v); }
    else if (store.dragProject != null && v.kind === "project" && v.id !== store.dragProject) { e.preventDefault(); dropKey = key(v); }
  }
  function drop(e: DragEvent, v: View) {
    e.preventDefault();
    dropKey = null;
    if (store.dragId != null) store.dropOn(v, store.dragId);
    else if (store.dragProject != null && v.id != null) store.reorderProjects(store.dragProject, v.id);
    store.dragId = store.dragProject = null;
  }
</script>

{#snippet item(v: View, title: string, icon: string, color: string | null, count: number | null, dot = false)}
  <button class="nav" class:on={active(v)} class:drop={dropKey === key(v)} style="--c:{color ?? 'var(--mute)'}"
    onclick={() => store.go(v)} ondragover={(e) => over(e, v)} ondragleave={() => (dropKey = null)} ondrop={(e) => drop(e, v)}
    draggable={v.kind === "project"} ondragstart={() => v.kind === "project" && (store.dragProject = v.id!)} ondragend={() => (store.dragProject = null)}
    ondblclick={() => v.kind === "project" && (store.projectDialog = { id: v.id! })}
    oncontextmenu={(e) => { if (v.kind === "project") { e.preventDefault(); store.projectDialog = { id: v.id! }; } }}>
    {#if dot}<span class="pdot"></span>{:else}<span class="ic"><Icon name={icon} size={17} /></span>{/if}
    <span class="label">{title}</span>
    {#if count}{#key count}<em in:fly={{ y: -6, duration: 250 }}>{count}</em>{/key}{/if}
  </button>
{/snippet}

<aside class:mac>
  <div class="brand" data-tauri-drag-region>
    <svg viewBox="0 0 1024 1024" width="24" height="24" aria-hidden="true">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa" /><stop offset=".5" stop-color="#7c3aed" /><stop offset="1" stop-color="#2563eb" /></linearGradient></defs>
      <rect x="64" y="64" width="896" height="896" rx="216" fill="url(#lg)" />
      <path d="M290 530 L445 680 L740 360" fill="none" stroke="#fff" stroke-width="96" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <b data-tauri-drag-region>FlowDo</b>
  </div>

  <button class="search" onclick={() => (store.palette = true)}>
    <Icon name="search" size={15} /><span>Поиск и команды</span><kbd>Ctrl K</kbd>
  </button>

  <nav>
    {#each SMART as s}
      {@render item({ kind: s.kind }, s.title, s.icon, s.color, store.count({ kind: s.kind }) || null)}
    {/each}

    <div class="cap">
      <span>Проекты</span>
      <button class="icon-btn" title="Новый проект" onclick={() => (store.projectDialog = { id: null })}><Icon name="plus" size={15} /></button>
    </div>
    {#each store.projects as p (p.id)}
      <div animate:flip={{ duration: 250 }} style="--pc:{p.color}">
        {@render item({ kind: "project", id: p.id }, p.name, "folder", p.color, store.count({ kind: "project", id: p.id }) || null, true)}
      </div>
    {:else}
      <button class="ghost" onclick={() => (store.projectDialog = { id: null })}>+ Создать первый проект</button>
    {/each}
  </nav>

  <div class="foot">
    {#each PAGES as pg}
      {@render item({ kind: pg.kind }, pg.title, pg.icon, null, null)}
    {/each}
  </div>
</aside>

<style>
  aside { display: flex; flex-direction: column; width: 248px; height: 100%; padding: 0 10px 10px; background: var(--side); border-right: 1px solid var(--line); }
  .brand { display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 8px; flex: none; }
  .mac .brand { padding-left: 78px; }
  .brand b { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
  .search {
    display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 8px 0 10px; margin-bottom: 10px; border-radius: 9px;
    color: var(--mute); background: var(--hover); border: 1px solid var(--line); transition: border-color 0.15s, color 0.15s;
  }
  .search:hover { border-color: var(--line-2); color: var(--text); }
  .search span { flex: 1; text-align: left; font-size: 13px; }
  nav { flex: 1; overflow-y: auto; margin: 0 -4px; padding: 0 4px; }
  .nav {
    position: relative; display: flex; align-items: center; gap: 10px; width: 100%; height: 34px; padding: 0 10px; border-radius: 8px;
    color: var(--mute); font-size: 13.5px; transition: background 0.15s, color 0.15s, transform 0.15s var(--spring);
  }
  .nav:hover { background: var(--hover); color: var(--text); }
  .nav.on { background: var(--surface-2); color: var(--text); font-weight: 600; box-shadow: 0 1px 0 var(--line), inset 0 0 0 1px var(--line); }
  .nav.on .ic { color: var(--c); }
  .nav.drop { background: var(--accent-soft); color: var(--text); transform: scale(1.03); box-shadow: inset 0 0 0 1.5px var(--accent); }
  .ic { display: grid; transition: color 0.2s; }
  .pdot { width: 10px; height: 10px; margin: 0 3.5px; border-radius: 4px; background: var(--c); box-shadow: 0 0 0 3px color-mix(in oklab, var(--c) 20%, transparent); }
  .label { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  em { font-style: normal; font-size: 12px; font-weight: 500; color: var(--faint); font-variant-numeric: tabular-nums; }
  .nav.on em { color: var(--mute); }
  .cap { display: flex; align-items: center; justify-content: space-between; margin: 18px 4px 4px 10px; font-size: 11.5px; font-weight: 600; color: var(--faint); text-transform: uppercase; letter-spacing: 0.05em; }
  .cap .icon-btn { width: 24px; height: 24px; }
  .ghost { width: 100%; padding: 8px 10px; text-align: left; font-size: 13px; color: var(--faint); border-radius: 8px; }
  .ghost:hover { color: var(--accent-text); background: var(--hover); }
  .foot { padding-top: 8px; border-top: 1px solid var(--line); }
</style>

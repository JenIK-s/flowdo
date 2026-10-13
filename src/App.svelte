<script lang="ts">
  import { fade } from "svelte/transition";
  import ActivityLog from "./lib/components/ActivityLog.svelte";
  import CommandPalette from "./lib/components/CommandPalette.svelte";
  import Confetti from "./lib/components/Confetti.svelte";
  import ContextMenu from "./lib/components/ContextMenu.svelte";
  import ListView from "./lib/components/ListView.svelte";
  import ProjectDialog from "./lib/components/ProjectDialog.svelte";
  import Settings from "./lib/components/Settings.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import Stats from "./lib/components/Stats.svelte";
  import TaskPanel from "./lib/components/TaskPanel.svelte";
  import TitleBar from "./lib/components/TitleBar.svelte";
  import Toasts from "./lib/components/Toasts.svelte";
  import { api } from "./lib/api";
  import { SMART, store } from "./lib/store.svelte";

  const mac = navigator.userAgent.includes("Mac");
  // на Windows/Linux окно без системной рамки — рисуем свои кнопки
  const controls = api.inTauri && !mac;
  let list = $state<ListView>();

  store.load();

  // тема: системная / тёмная / светлая + акцентный цвет
  let systemDark = $state(matchMedia("(prefers-color-scheme: dark)").matches);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => (systemDark = e.matches));
  $effect(() => {
    const dark = store.theme === "system" ? systemDark : store.theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.setProperty("--accent", store.accent);
  });

  function keydown(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    if (mod && (k === "k" || k === "л")) { e.preventDefault(); store.palette = !store.palette; return; }
    if (mod && (k === "b" || k === "и")) { e.preventDefault(); store.toggleSidebar(); return; }
    if (mod && /^[1-5]$/.test(e.key)) { e.preventDefault(); store.go({ kind: SMART[+e.key - 1].kind }); return; }
    if (typing || store.palette || store.projectDialog) return;

    if (mod && (k === "n" || k === "т")) { e.preventDefault(); focusNew(); return; }
    if (mod) {
      if ((k === "d" || k === "в") && store.selectedId) { e.preventDefault(); store.duplicate(store.selectedId); }
      return;
    }
    if (k === "n" || k === "т") { e.preventDefault(); focusNew(); return; }
    if (e.key === "Escape") { if (store.openId) store.openId = null; else store.selectedId = null; return; }
    if (!store.isListView || store.openId) return;

    const flat = store.flat;
    const i = flat.findIndex((t) => t.id === store.selectedId);
    const sel = flat[i];
    if (e.key === "ArrowDown" || k === "j" || k === "о") { e.preventDefault(); store.selectedId = flat[Math.min(flat.length - 1, i + 1)]?.id ?? null; }
    else if (e.key === "ArrowUp" || k === "k" || k === "л") { e.preventDefault(); store.selectedId = flat[Math.max(0, i - 1)]?.id ?? null; }
    else if (!sel) return;
    else if (e.key === " " || k === "x" || k === "ч") { e.preventDefault(); store.toggle(sel.id); }
    else if (e.key === "Enter") { e.preventDefault(); store.openId = sel.id; }
    else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      store.selectedId = (flat[i + 1] ?? flat[i - 1])?.id ?? null;
      store.remove(sel.id);
    }
    else if (/^[1-4]$/.test(e.key)) store.update(sel.id, { priority: +e.key - 1 });
  }

  function focusNew() {
    if (!store.isListView || store.view.kind === "done") store.go({ kind: "inbox" });
    store.openId = null;
    setTimeout(() => list?.focusComposer(), 0);
  }
</script>

<svelte:window onkeydown={keydown} />
<svelte:document oncontextmenu={(e) => { if (!(e.target as HTMLElement).closest("input, textarea")) e.preventDefault(); }} />

<div class="app" class:no-side={!store.sidebar}>
  <div class="side-wrap">
    <Sidebar mac={mac && api.inTauri} />
  </div>
  <main>
    <TitleBar {controls} />
    {#if store.ready}
      {#key store.isListView ? "list" : store.view.kind}
        <div class="content" in:fade={{ duration: 180 }}>
          {#if store.isListView}<ListView bind:this={list} />
          {:else if store.view.kind === "stats"}<Stats />
          {:else if store.view.kind === "activity"}<ActivityLog />
          {:else}<Settings />{/if}
        </div>
      {/key}
    {/if}
  </main>
</div>

<TaskPanel />
<CommandPalette />
<ContextMenu />
<ProjectDialog />
<Toasts />
<Confetti />

<style>
  .app { display: flex; height: 100vh; }
  .side-wrap { width: 248px; flex: none; overflow: hidden; transition: width 0.35s var(--ease), opacity 0.25s; }
  .no-side .side-wrap { width: 0; opacity: 0; }
  main { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--bg); }
  main::before {
    content: ""; position: absolute; inset: 0 0 auto; height: 260px; pointer-events: none;
    background: radial-gradient(600px 200px at 30% -40px, color-mix(in oklab, var(--accent) 10%, transparent), transparent);
  }
  .content { position: relative; flex: 1; min-height: 0; }
</style>

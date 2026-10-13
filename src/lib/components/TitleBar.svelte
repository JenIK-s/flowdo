<script lang="ts">
  import Icon from "./Icon.svelte";
  import { api } from "../api";
  import { store } from "../store.svelte";

  let { controls = false }: { controls?: boolean } = $props();
  let maximized = $state(false);

  const win = () => import("@tauri-apps/api/window").then((m) => m.getCurrentWindow());

  $effect(() => {
    if (!controls || !api.inTauri) return;
    let unlisten: (() => void) | undefined;
    win().then(async (w) => {
      maximized = await w.isMaximized();
      unlisten = await w.onResized(async () => (maximized = await w.isMaximized()));
    });
    return () => unlisten?.();
  });
</script>

<div class="bar" data-tauri-drag-region>
  <button class="icon-btn" title="Боковая панель (Ctrl B)" onclick={() => store.toggleSidebar()}><Icon name="sidebar" size={16} /></button>
  <span class="grow" data-tauri-drag-region></span>
  {#if controls}
    <div class="win">
      <button title="Свернуть" onclick={() => win().then((w) => w.minimize())}><Icon name="min" size={14} /></button>
      <button title={maximized ? "Восстановить" : "Развернуть"} onclick={() => win().then((w) => w.toggleMaximize())}>
        {#if maximized}<Icon name="copy" size={12} />{:else}<Icon name="max" size={12} />{/if}
      </button>
      <button class="close" title="Закрыть" onclick={() => win().then((w) => w.close())}><Icon name="x" size={15} /></button>
    </div>
  {/if}
</div>

<style>
  .bar { display: flex; align-items: center; height: 44px; padding-left: 12px; flex: none; }
  .grow { flex: 1; height: 100%; }
  .win { display: flex; align-self: flex-start; height: 34px; }
  .win button { display: grid; place-items: center; width: 46px; height: 100%; color: var(--mute); transition: background 0.12s, color 0.12s; }
  .win button:hover { background: var(--hover); color: var(--text); }
  .win .close:hover { background: #e81123; color: white; }
</style>

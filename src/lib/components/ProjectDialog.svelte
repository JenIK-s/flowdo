<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import Icon from "./Icon.svelte";
  import { PROJECT_COLORS, store } from "../store.svelte";

  const d = $derived(store.projectDialog);
  const existing = $derived(d?.id != null ? store.projects.find((p) => p.id === d.id) : null);
  let name = $state("");
  let color = $state(PROJECT_COLORS[0]);
  let confirm = $state(false);

  $effect(() => {
    if (!d) return;
    name = existing?.name ?? "";
    color = existing?.color ?? PROJECT_COLORS[store.projects.length % PROJECT_COLORS.length];
    confirm = false;
  });

  const close = () => (store.projectDialog = null);
  async function save(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    if (await store.saveProject(d!.id, name, color)) close();
  }
  async function del() {
    if (!confirm) return (confirm = true);
    await store.deleteProject(d!.id!);
    close();
  }
  const autofocus = (n: HTMLInputElement) => { n.focus(); n.select(); };
  const count = $derived(existing ? store.tasks.filter((t) => t.project_id === existing.id).length : 0);
</script>

{#if d}
  <div class="overlay" role="presentation" onclick={close} transition:fade={{ duration: 150 }}></div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <form class="dlg" onsubmit={save} transition:scale={{ start: 0.94, duration: 220, easing: cubicOut }}
    onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
    <div class="head">
      <span class="badge" style:background={color}><Icon name="folder" size={18} /></span>
      <h2>{existing ? "Проект" : "Новый проект"}</h2>
    </div>
    <label>Название
      <input class="field" use:autofocus bind:value={name} maxlength="40" placeholder="Например, «Ремонт» или «Работа»" />
    </label>
    <div class="lbl">Цвет</div>
    <div class="colors">
      {#each PROJECT_COLORS as c}
        <button type="button" class="sw" class:on={c === color} style:background={c} aria-label="Цвет {c}" onclick={() => (color = c)}></button>
      {/each}
    </div>
    <div class="actions">
      {#if existing}
        <button type="button" class="btn danger" onclick={del}>{confirm ? `Удалить? Задач: ${count} → во «Входящие»` : "Удалить"}</button>
      {/if}
      <span class="grow"></span>
      <button type="button" class="btn" onclick={close}>Отмена</button>
      <button class="btn primary" disabled={!name.trim()}>{existing ? "Сохранить" : "Создать"}</button>
    </div>
  </form>
{/if}

<style>
  .overlay { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(3px); }
  .dlg {
    position: fixed; z-index: 61; top: 50%; left: 50%; width: 420px; max-width: calc(100vw - 32px); translate: -50% -50%;
    padding: 22px; background: var(--surface); border-radius: 18px; box-shadow: var(--shadow);
  }
  .head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  .badge { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; color: white; transition: background 0.25s; }
  h2 { margin: 0; font-size: 18px; }
  label, .lbl { display: grid; gap: 6px; font-size: 12.5px; color: var(--mute); font-weight: 500; }
  .lbl { margin-top: 16px; }
  .colors { display: flex; gap: 10px; margin-top: 8px; }
  .sw { width: 26px; height: 26px; border-radius: 50%; transition: transform 0.2s var(--spring), box-shadow 0.2s; }
  .sw:hover { transform: scale(1.12); }
  .sw.on { box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px currentColor; color: var(--text); transform: scale(1.05); }
  .actions { display: flex; align-items: center; gap: 8px; margin-top: 24px; }
  .grow { flex: 1; }
  .btn:disabled { opacity: 0.5; cursor: default; }
</style>

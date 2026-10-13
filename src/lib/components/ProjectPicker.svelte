<script lang="ts">
  import Dropdown from "./Dropdown.svelte";
  import Icon from "./Icon.svelte";
  import { store } from "../store.svelte";

  let { value, onchange, up = false }: { value: number | null; onchange: (v: number | null) => void; up?: boolean } = $props();
  let open = $state(false);
  const current = $derived(store.projects.find((p) => p.id === value));
</script>

<Dropdown bind:open width={220} {up}>
  {#snippet trigger()}
    <button class="trigger" onclick={() => (open = !open)}>
      {#if current}<span class="dot" style:background={current.color}></span>{current.name}
      {:else}<Icon name="inbox" size={14} />Входящие{/if}
    </button>
  {/snippet}
  <button class="mi" class:on={value == null} onclick={() => { onchange(null); open = false; }}><Icon name="inbox" size={14} />Входящие</button>
  {#if store.projects.length}<hr />{/if}
  {#each store.projects as p (p.id)}
    <button class="mi" class:on={p.id === value} onclick={() => { onchange(p.id); open = false; }}>
      <span class="dot" style:background={p.color}></span>{p.name}
      {#if p.id === value}<span class="r"><Icon name="check" size={14} /></span>{/if}
    </button>
  {/each}
  <hr />
  <button class="mi" onclick={() => { open = false; store.projectDialog = { id: null }; }}><Icon name="plus" size={14} />Новый проект</button>
</Dropdown>

<style>
  .trigger {
    display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 10px; border-radius: 7px; font-size: 13px;
    background: var(--hover); max-width: 180px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  }
  .trigger:hover { background: var(--line-2); }
</style>

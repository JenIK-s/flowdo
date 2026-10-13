<script lang="ts">
  import Dropdown from "./Dropdown.svelte";
  import Icon from "./Icon.svelte";
  import { PRIO } from "../store.svelte";

  let { value, onchange, up = false }: { value: number; onchange: (v: number) => void; up?: boolean } = $props();
  let open = $state(false);
</script>

<Dropdown bind:open width={190} {up}>
  {#snippet trigger()}
    <button class="trigger" class:empty={value === 1} style="--c:var(--p{value})" onclick={() => (open = !open)}>
      <Icon name="flag" size={14} />{PRIO[value]}
    </button>
  {/snippet}
  {#each [3, 2, 1, 0] as p}
    <button class="mi" class:on={p === value} style="--c:var(--p{p})" onclick={() => { onchange(p); open = false; }}>
      <span class="f"><Icon name="flag" size={14} /></span>{PRIO[p]}<span class="r">!{p}</span>
    </button>
  {/each}
</Dropdown>

<style>
  .trigger {
    display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 7px; font-size: 13px;
    color: var(--c); background: color-mix(in oklab, var(--c) 14%, transparent); transition: background 0.15s;
  }
  .trigger.empty { color: var(--mute); background: transparent; border: 1px dashed var(--line-2); }
  .f { color: var(--c); display: grid; }
</style>

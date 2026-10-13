<script lang="ts">
  import type { Snippet } from "svelte";
  import { scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  let { open = $bindable(false), trigger, children, align = "left", up = false, width }: {
    open?: boolean; trigger: Snippet; children: Snippet; align?: "left" | "right"; up?: boolean; width?: number;
  } = $props();

  let root: HTMLElement;

  function outside(e: PointerEvent) {
    if (open && !root.contains(e.target as Node)) open = false;
  }
  function key(e: KeyboardEvent) {
    if (open && e.key === "Escape") { e.stopPropagation(); open = false; }
  }
</script>

<svelte:window onpointerdown={outside} onkeydowncapture={key} />

<div class="dd" bind:this={root}>
  {@render trigger()}
  {#if open}
    <div class="menu {align}" class:up style:width={width ? width + "px" : null}
      transition:scale={{ start: 0.95, duration: 160, easing: cubicOut }}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .dd { position: relative; display: inline-flex; }
  .menu {
    position: absolute; top: calc(100% + 6px); z-index: 50; min-width: 200px; padding: 6px;
    background: var(--glass); backdrop-filter: blur(24px) saturate(1.5); border-radius: 12px; box-shadow: var(--shadow);
    transform-origin: top left;
  }
  .menu.right { right: 0; transform-origin: top right; }
  .menu.left { left: 0; }
  .menu.up { top: auto; bottom: calc(100% + 6px); transform-origin: bottom left; }
  .menu :global(.mi) {
    display: flex; align-items: center; gap: 10px; width: 100%; height: 32px; padding: 0 10px; border-radius: 7px;
    text-align: left; color: var(--text); font-size: 13px; transition: background 0.12s;
  }
  .menu :global(.mi:hover), .menu :global(.mi.on) { background: var(--hover); }
  .menu :global(.mi .r) { margin-left: auto; color: var(--faint); font-size: 12px; }
  .menu :global(.mi.danger) { color: var(--late); }
  .menu :global(hr) { border: 0; border-top: 1px solid var(--line); margin: 5px 4px; }
  .menu :global(.cap) { padding: 6px 10px 4px; font-size: 11px; font-weight: 600; color: var(--faint); text-transform: uppercase; letter-spacing: 0.04em; }
</style>

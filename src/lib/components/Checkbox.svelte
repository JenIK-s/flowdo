<script lang="ts">
  let { checked, priority = 1, size = 20, onchange }: { checked: boolean; priority?: number; size?: number; onchange: () => void } = $props();
  let burst = $state(0);

  function click(e: MouseEvent) {
    e.stopPropagation();
    if (!checked) burst++;
    onchange();
  }
</script>

<button class="cb p{priority}" class:checked style="--s:{size}px" onclick={click} aria-label={checked ? "Вернуть в работу" : "Выполнить"} role="checkbox" aria-checked={checked}>
  <svg viewBox="0 0 20 20"><path d="M5.5 10.5l3 3 6-7" /></svg>
  {#key burst}
    {#if burst}
      <span class="burst" aria-hidden="true">{#each Array(8) as _, i}<i style="--a:{i * 45}deg"></i>{/each}</span>
    {/if}
  {/key}
</button>

<style>
  .cb {
    --c: var(--p1);
    position: relative; flex: none; width: var(--s); height: var(--s); border-radius: 50%;
    border: 1.8px solid color-mix(in oklab, var(--c) 85%, transparent);
    background: color-mix(in oklab, var(--c) 8%, transparent);
    display: grid; place-items: center; transition: background 0.25s var(--ease), border-color 0.2s, transform 0.2s var(--spring);
  }
  .p0 { --c: var(--p0); }
  .p2 { --c: var(--p2); }
  .p3 { --c: var(--p3); }
  .cb:hover { background: color-mix(in oklab, var(--c) 20%, transparent); }
  .cb:active { transform: scale(0.85); }
  svg { width: 72%; height: 72%; fill: none; stroke: white; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; overflow: visible; }
  path { stroke-dasharray: 16; stroke-dashoffset: 16; transition: stroke-dashoffset 0.3s var(--ease) 0.05s; }
  .cb:not(.checked):hover path { stroke: var(--c); stroke-dashoffset: 0; opacity: 0.5; }
  .checked { background: var(--c); border-color: var(--c); animation: pop 0.4s var(--spring); }
  .checked.p1 { --c: var(--accent); }
  .checked path { stroke-dashoffset: 0; }
  @keyframes pop { 0% { transform: scale(0.7); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }

  .burst { position: absolute; inset: 0; pointer-events: none; }
  .burst i {
    position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px; border-radius: 50%;
    background: var(--c); transform: rotate(var(--a)) translateY(0); animation: fly 0.6s var(--ease) forwards;
  }
  .burst i:nth-child(odd) { background: var(--accent); width: 3px; height: 3px; }
  @keyframes fly { to { transform: rotate(var(--a)) translateY(calc(var(--s) * -0.95)); opacity: 0; } }
</style>

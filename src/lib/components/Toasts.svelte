<script lang="ts">
  import { fly } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import Icon from "./Icon.svelte";
  import { store } from "../store.svelte";
</script>

<div class="toasts" aria-live="polite">
  {#each store.toasts as t (t.id)}
    <div class="toast {t.tone ?? ''}" animate:flip={{ duration: 250 }} in:fly={{ y: 24, duration: 320, easing: cubicOut }} out:fly={{ y: 12, duration: 200 }}>
      {#if t.tone === "ok"}<span class="ic ok"><Icon name="check" size={14} stroke={2.6} /></span>{/if}
      {#if t.tone === "err"}<span class="ic err"><Icon name="x" size={14} stroke={2.6} /></span>{/if}
      <span class="txt">{t.text}</span>
      {#if t.action}
        <button onclick={() => { t.run?.(); store.dismiss(t.id); }}>{t.action}</button>
      {/if}
      <i class="timer" style:animation-duration={t.run ? "6s" : "3.2s"}></i>
    </div>
  {/each}
</div>

<style>
  .toasts { position: fixed; z-index: 80; bottom: 22px; left: 50%; translate: -50% 0; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
  .toast {
    position: relative; display: flex; align-items: center; gap: 10px; min-height: 42px; max-width: 520px; padding: 0 8px 0 14px;
    border-radius: 12px; background: var(--glass); backdrop-filter: blur(24px) saturate(1.5); box-shadow: var(--shadow);
    pointer-events: auto; overflow: hidden; font-size: 13.5px;
  }
  .txt { padding: 10px 6px 10px 0; }
  .ic { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; color: white; flex: none; }
  .ic.ok { background: var(--ok); }
  .ic.err { background: var(--p3); }
  button { height: 28px; padding: 0 10px; border-radius: 7px; font-weight: 600; color: var(--accent-text); }
  button:hover { background: var(--accent-soft); }
  .timer { position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; background: var(--accent); opacity: 0.6; transform-origin: left; animation: shrink linear forwards; }
  @keyframes shrink { to { transform: scaleX(0); } }
</style>

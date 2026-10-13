<script lang="ts">
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import Icon from "./Icon.svelte";
  import DatePicker from "./DatePicker.svelte";
  import PriorityPicker from "./PriorityPicker.svelte";
  import ProjectPicker from "./ProjectPicker.svelte";
  import { parseQuick } from "../parse";
  import { store } from "../store.svelte";

  let text = $state("");
  let focused = $state(false);
  let input: HTMLInputElement;
  let mirror: HTMLDivElement;
  let form: HTMLFormElement;
  let shake = $state(false);

  // значения, выбранные мышью; токены в тексте имеют приоритет
  let manual = $state<{ priority: number; due: string | null; project: number | null }>({ priority: 1, due: null, project: null });

  function reset() {
    const d = store.defaults();
    manual = { priority: 1, due: d.due ?? null, project: d.project_id ?? null };
  }
  $effect(() => { store.view; reset(); });

  const parsed = $derived(parseQuick(text));
  const priority = $derived(parsed.priority ?? manual.priority);
  const due = $derived(parsed.due ?? manual.due);
  const segments = $derived.by(() => {
    const out: { s: string; k?: string }[] = [];
    let pos = 0;
    for (const t of parsed.tokens) {
      out.push({ s: text.slice(pos, t.start) }, { s: text.slice(t.start, t.end), k: t.kind });
      pos = t.end;
    }
    out.push({ s: text.slice(pos) });
    return out;
  });
  const expanded = $derived(focused || text.length > 0);

  export function focus() { input?.focus(); }

  async function submit(e: Event) {
    e.preventDefault();
    if (!parsed.title) {
      shake = true;
      setTimeout(() => (shake = false), 400);
      return;
    }
    const tags = [...new Set([...(store.defaults().tags ?? []), ...parsed.tags])];
    const t = await store.add({ title: parsed.title, priority, due, tags, project_id: manual.project });
    if (t) {
      text = "";
      store.selectedId = t.id;
    }
  }

  function key(e: KeyboardEvent) {
    if (e.key === "Escape") { text = ""; input.blur(); }
  }
  const sync = () => mirror && (mirror.scrollLeft = input.scrollLeft);
</script>

<form class="composer" class:focused={expanded} class:shake onsubmit={submit} bind:this={form}
  onfocusin={() => (focused = true)} onfocusout={(e) => { if (!form.contains(e.relatedTarget as Node)) focused = false; }}>
  <div class="row">
    <span class="plus"><Icon name="plus" size={18} stroke={2.2} /></span>
    <div class="wrap">
      <div class="mirror" bind:this={mirror} aria-hidden="true">
        {#each segments as seg}{#if seg.k}<mark class={seg.k}>{seg.s}</mark>{:else}{seg.s}{/if}{/each}&nbsp;
      </div>
      <input bind:this={input} bind:value={text} maxlength="300" spellcheck="false" autocomplete="off"
        placeholder="Добавить задачу…" onkeydown={key} oninput={sync} onscroll={sync} data-composer />
    </div>
    {#if text}<kbd class="enter">Enter ↵</kbd>{:else}<kbd class="enter faint">N</kbd>{/if}
  </div>
  {#if expanded}
    <div class="assist" transition:slide={{ duration: 220, easing: cubicOut }}>
      <!-- mousedown не должен уводить фокус, чтобы панель не схлопывалась -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="pickers" role="group" onmousedown={(e) => { if (!(e.target as HTMLElement).closest("input")) e.preventDefault(); }}>
        <DatePicker value={due} onchange={(v) => { manual.due = v; text = text.replace(/(^|\s)@\S+/g, "$1"); }} />
        <PriorityPicker value={priority} onchange={(v) => { manual.priority = v; text = text.replace(/(^|\s)!\S*/g, "$1"); }} />
        <ProjectPicker value={manual.project} onchange={(v) => (manual.project = v)} />
        {#each parsed.tags as t}<span class="chip tag">#{t}</span>{/each}
      </div>
      <span class="hint"><b>!срочно</b> <b>#тег</b> <b>@завтра</b></span>
    </div>
  {/if}
</form>

<style>
  .composer {
    position: relative; margin: 4px 0 18px; border-radius: 14px; background: var(--surface);
    border: 1px solid var(--line); transition: border-color 0.2s, box-shadow 0.3s var(--ease), transform 0.2s;
  }
  .composer.focused { border-color: color-mix(in oklab, var(--accent) 55%, transparent); box-shadow: 0 0 0 4px var(--accent-soft), 0 18px 40px -20px var(--accent); }
  .composer.shake { animation: shake 0.35s; }
  @keyframes shake { 20%, 60% { transform: translateX(-5px); } 40%, 80% { transform: translateX(5px); } }
  .row { display: flex; align-items: center; gap: 10px; height: 50px; padding: 0 14px; }
  .plus { color: var(--accent); display: grid; transition: transform 0.3s var(--spring); }
  .focused .plus { transform: rotate(90deg); }
  .wrap { position: relative; flex: 1; height: 100%; min-width: 0; }
  .wrap input, .mirror {
    position: absolute; inset: 0; width: 100%; padding: 0; border: 0; font-size: 15px; line-height: 50px;
    white-space: pre; overflow: hidden; letter-spacing: normal;
  }
  .wrap input { background: transparent; color: transparent; caret-color: var(--text); outline: none; }
  .wrap input::placeholder { color: var(--faint); }
  .mirror { color: var(--text); pointer-events: none; }
  mark { border-radius: 5px; padding: 2px 0; box-shadow: 0 0 0 2px var(--bgc); background: var(--bgc); color: var(--fc); }
  mark.priority { --bgc: color-mix(in oklab, var(--p3) 22%, transparent); --fc: var(--p3); }
  mark.tag { --bgc: var(--accent-soft); --fc: var(--accent-text); }
  mark.due { --bgc: color-mix(in oklab, var(--today) 20%, transparent); --fc: var(--today); }
  .enter { transition: opacity 0.2s; }
  .enter.faint { opacity: 0.5; }
  .assist { display: flex; align-items: center; gap: 8px; padding: 0 14px 12px 42px; flex-wrap: wrap; }
  .pickers { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .hint { margin-left: auto; font-size: 12px; color: var(--faint); }
  .hint b { font-weight: 500; color: var(--mute); }
</style>

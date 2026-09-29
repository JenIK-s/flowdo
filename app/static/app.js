const $ = s => document.querySelector(s);
const PRIO = ["Низкий", "Обычный", "Высокий", "Срочный"];
const PRIO_WORDS = { низкий: 0, low: 0, обычный: 1, средний: 1, высокий: 2, high: 2, срочно: 3, срочный: 3, urgent: 3 };
const state = { tasks: [], filter: "all", tag: null, q: "", sort: "manual", editing: null, prio: 1, projects: [], project: null, view: "tasks", subs: [], pEdit: null };

const api = async (url, method = "GET", body) => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.status === 204 ? null : r.json();
};

/* ---------- даты ---------- */
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());
const prettyDate = s => {
  if (s === today()) return "Сегодня";
  if (s === addDays(1)) return "Завтра";
  if (s === addDays(-1)) return "Вчера";
  return new Date(s + "T00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
};

/* ---------- умный ввод: !срочно #тег @завтра ---------- */
function parseQuick(text) {
  const out = { title: text, priority: 1, due: null, tags: [] };
  out.title = text.replace(/(^|\s)([!#@])([\wа-яё\-.]+)/gi, (m, sp, sign, w) => {
    const l = w.toLowerCase();
    if (sign === "!") { if (l in PRIO_WORDS) { out.priority = PRIO_WORDS[l]; return ""; } if (/^[0-3]$/.test(l)) { out.priority = +l; return ""; } }
    if (sign === "#") { out.tags.push(l); return ""; }
    if (sign === "@") {
      if (["сегодня", "today"].includes(l)) { out.due = today(); return ""; }
      if (["завтра", "tomorrow"].includes(l)) { out.due = addDays(1); return ""; }
      if (/^\+\d+$/.test(l)) { out.due = addDays(+l.slice(1)); return ""; }
      if (/^\d{4}-\d{2}-\d{2}$/.test(l)) { out.due = l; return ""; }
    }
    return m;
  }).trim();
  return out;
}

/* ---------- фильтрация ---------- */
function visible() {
  let t = state.tasks.filter(x => {
    if (state.project != null && x.project_id !== state.project) return false;
    if (state.filter === "active" && x.done) return false;
    if (state.filter === "done" && !x.done) return false;
    if (state.filter === "today" && (x.done || !x.due || x.due > today())) return false;
    if (state.tag && !x.tags.includes(state.tag)) return false;
    if (state.q && !(x.title + x.notes + x.tags.join(" ")).toLowerCase().includes(state.q)) return false;
    return true;
  });
  if (state.sort === "priority") t = [...t].sort((a, b) => a.done - b.done || b.priority - a.priority);
  if (state.sort === "due") t = [...t].sort((a, b) => a.done - b.done || (a.due || "9") .localeCompare(b.due || "9"));
  return t;
}
const canDrag = () => state.sort === "manual" && state.filter === "all" && !state.tag && !state.q;

/* ---------- рендер ---------- */
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function render() {
  const list = $("#list"), items = visible();
  list.innerHTML = items.map(t => {
    const late = t.due && !t.done && t.due < today();
    return `<li class="item ${t.done ? "done" : ""}" data-id="${t.id}" data-p="${t.priority}" draggable="${canDrag()}">
      <button class="chk" aria-label="Отметить"></button>
      <div class="body">
        <div class="title">${esc(t.title)}</div>
        ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ""}
        <div class="meta">
          <span class="chip">${PRIO[t.priority]}</span>
          ${t.subtasks.length ? `<span class="chip date">Подзадачи ${t.subtasks.filter(x => x.d).length}/${t.subtasks.length}</span>` : ""}
          ${t.due ? `<span class="chip ${late ? "late" : "date"}">${late ? "Просрочено · " : ""}${prettyDate(t.due)}</span>` : ""}
          ${t.tags.map(g => `<span class="chip tg">#${esc(g)}</span>`).join("")}
        </div>
      </div>
      <div class="acts"><button data-a="edit">Изменить</button><button data-a="del">Удалить</button></div>
    </li>`;
  }).join("");

  const empty = $("#empty");
  empty.hidden = items.length > 0;
  if (!items.length) empty.innerHTML = state.tasks.length
    ? `Ничего не найдено. Измените фильтр или поисковый запрос.`
    : `Список пуст. Введите задачу и нажмите Enter.`;

  // тег-бар
  const tags = [...new Set(state.tasks.flatMap(t => t.tags))].sort();
  $("#tagbar").innerHTML = tags.map(g => `<button class="tag ${state.tag === g ? "on" : ""}" data-t="${esc(g)}">#${esc(g)}</button>`).join("");

  // статистика
  const total = state.tasks.length, done = state.tasks.filter(t => t.done).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  $("#ring").style.strokeDashoffset = 276.46 * (1 - pct / 100);
  $("#pct").textContent = pct + "%";
  const left = total - done, late = state.tasks.filter(t => !t.done && t.due && t.due < today()).length;
  $("#sub").textContent = !total ? "Начните с первой задачи" : left === 0 ? "Все задачи выполнены"
    : `Осталось ${left}${late ? `, из них просрочено ${late}` : ""}`;
  $("#count").textContent = `${done} из ${total} выполнено`;
  renderSide();
  const h = new Date().getHours();
  $("#greet").textContent = curProj() ? curProj().name : h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
}

/* ---------- действия ---------- */
async function load() { [state.tasks, state.projects] = await Promise.all([api("/api/tasks"), api("/api/projects")]); showView(); }

async function toggle(id, el) {
  const t = state.tasks.find(x => x.id === id), done = !t.done;
  Object.assign(t, await api(`/api/tasks/${id}`, "PATCH", { done }));
  render();
}

async function remove(id) {
  const t = state.tasks.find(x => x.id === id);
  await api(`/api/tasks/${id}`, "DELETE");
  state.tasks = state.tasks.filter(x => x.id !== id); render();
  toast(`Удалено: «${t.title.slice(0, 30)}»`, "Вернуть", async () => {
    const { id: _, ...rest } = t; await api("/api/tasks", "POST", rest); load();
  });
}

let toastTimer;
function toast(msg, label, fn) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(msg)}</span>${label ? `<button>${label}</button>` : ""}`;
  if (label) el.querySelector("button").onclick = () => { fn(); el.classList.remove("show"); };
  el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 5000);
}

/* ---------- модалка редактирования ---------- */
function drawPrio() {
  $("#ePrio").innerHTML = PRIO.map((n, i) => `<button type="button" data-p="${i}" class="${state.prio === i ? "on" : ""}" style="--pc:var(--p${i})">${n}</button>`).join("");
}
function openEdit(id) {
  const t = state.tasks.find(x => x.id === id);
  state.editing = id; state.prio = t.priority;
  $("#eTitle").value = t.title; $("#eNotes").value = t.notes; $("#eDue").value = t.due || ""; $("#eTags").value = t.tags.join(", ");
  state.subs = structuredClone(t.subtasks); fillProj(t.project_id); drawSubs(); drawPrio(); $("#dlg").showModal(); $("#eTitle").focus();
}
$("#ePrio").onclick = e => { const b = e.target.closest("button"); if (b) { state.prio = +b.dataset.p; drawPrio(); } };
$("#eCancel").onclick = () => $("#dlg").close();
$("#editForm").onsubmit = async () => {
  const p = await api(`/api/tasks/${state.editing}`, "PATCH", {
    title: $("#eTitle").value.trim(), notes: $("#eNotes").value, due: $("#eDue").value || "",
    priority: state.prio, project_id: $("#eProj").value ? +$("#eProj").value : null, subtasks: state.subs, tags: $("#eTags").value.split(",").map(s => s.trim().replace(/^#/, "").toLowerCase()).filter(Boolean),
  });
  Object.assign(state.tasks.find(x => x.id === state.editing), p); render(); toast("Сохранено");
};

/* ---------- события ---------- */
$("#addForm").onsubmit = async e => {
  e.preventDefault();
  const v = $("#addInput").value.trim(); if (!v) return;
  const p = parseQuick(v); if (!p.title) return;
  p.project_id = state.project;
  state.tasks.unshift(await api("/api/tasks", "POST", p));
  $("#addInput").value = ""; $("#hint").innerHTML = ""; render();
};
$("#addInput").oninput = e => {
  const p = parseQuick(e.target.value);
  const bits = [];
  if (p.priority !== 1) bits.push(`приоритет <b>${PRIO[p.priority]}</b>`);
  if (p.due) bits.push(`срок <b>${prettyDate(p.due)}</b>`);
  if (p.tags.length) bits.push(`теги <b>${p.tags.map(t => "#" + t).join(" ")}</b>`);
  $("#hint").innerHTML = bits.join(" · ") || (e.target.value ? "" : "");
};
$("#list").onclick = e => {
  const li = e.target.closest(".item"); if (!li) return; const id = +li.dataset.id;
  if (e.target.closest(".chk")) toggle(id, li);
  else if (e.target.closest("[data-a=edit]")) openEdit(id);
  else if (e.target.closest("[data-a=del]")) remove(id);
};
$("#list").ondblclick = e => { const li = e.target.closest(".item"); if (li && !e.target.closest("button")) openEdit(+li.dataset.id); };
$("#tabs").onclick = e => { const b = e.target.closest("button"); if (!b) return; state.filter = b.dataset.f;
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b)); render(); };
$("#tagbar").onclick = e => { const b = e.target.closest("button"); if (b) { state.tag = state.tag === b.dataset.t ? null : b.dataset.t; render(); } };
$("#sort").onchange = e => { state.sort = e.target.value; render(); };
$("#search").oninput = e => { state.q = e.target.value.toLowerCase(); render(); };
$("#clear").onclick = async () => {
  if (!state.tasks.some(t => t.done)) return toast("Нет выполненных задач");
  await api("/api/completed", "DELETE"); load(); toast("Выполненные убраны");
};

/* drag & drop */
let dragId = null;
$("#list").addEventListener("dragstart", e => { const li = e.target.closest(".item"); if (!li) return; dragId = +li.dataset.id; li.classList.add("drag"); });
$("#list").addEventListener("dragend", () => { document.querySelectorAll(".item").forEach(x => x.classList.remove("drag", "over")); });
$("#list").addEventListener("dragover", e => {
  e.preventDefault(); document.querySelectorAll(".over").forEach(x => x.classList.remove("over"));
  e.target.closest(".item")?.classList.add("over");
});
$("#list").addEventListener("drop", async e => {
  e.preventDefault(); const li = e.target.closest(".item"); if (!li || dragId == null) return;
  const to = state.tasks.findIndex(t => t.id === +li.dataset.id), from = state.tasks.findIndex(t => t.id === dragId);
  const [m] = state.tasks.splice(from, 1); state.tasks.splice(to, 0, m); render();
  await api("/api/reorder", "POST", { ids: state.tasks.map(t => t.id) });
});

/* тема и горячие клавиши */
const setTheme = t => { document.documentElement.dataset.theme = t; localStorage.setItem("theme", t); };
setTheme(localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
$("#theme").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
addEventListener("keydown", e => {
  if (e.target.matches("input,textarea,select") || e.metaKey || e.ctrlKey) return;
  if (e.key === "/" || e.key === "n") { e.preventDefault(); (e.key === "/" ? $("#search") : $("#addInput")).focus(); }
  if (e.key === "t") $("#theme").click();
});

/* ---------- проекты, подзадачи, журнал, аналитика ---------- */
const ACT = { created: "Создана", updated: "Изменена", completed: "Выполнена", reopened: "Возвращена в работу", deleted: "Удалена", cleared: "Очистка", imported: "Импорт" };
function curProj() { return state.projects.find(p => p.id === state.project); }

function renderSide() {
  const open = id => state.tasks.filter(t => !t.done && (id === null || t.project_id === id)).length;
  const item = (v, p, label, n) => `<button class="nav ${state.view === v && (v !== "tasks" || state.project === p) ? "on" : ""}" data-v="${v}" data-p="${p ?? ""}"><span>${esc(label)}</span>${n != null ? `<em>${n}</em>` : ""}</button>`;
  $("#nav").innerHTML = item("tasks", null, "Все задачи", open(null))
    + `<div class="cap"><span>Проекты</span><button id="addProj" title="Новый проект">+</button></div>`
    + state.projects.map(p => item("tasks", p.id, p.name, open(p.id))).join("")
    + `<div class="cap"><span>Отчёты</span></div>` + item("stats", null, "Аналитика") + item("activity", null, "Журнал действий");
}
async function showView() {
  ["tasks", "stats", "activity"].forEach(v => $("#v-" + v).hidden = v !== state.view);
  if (state.view === "tasks") render(); else if (state.view === "stats") await drawStats(); else await drawActivity();
  renderSide();
}
$("#nav").onclick = e => {
  if (e.target.closest("#addProj")) return openProj(null);
  const b = e.target.closest(".nav"); if (!b) return;
  state.view = b.dataset.v; state.project = b.dataset.p === "" ? null : +b.dataset.p; showView();
};
$("#nav").ondblclick = e => { const b = e.target.closest(".nav"); if (b && b.dataset.p) openProj(+b.dataset.p); };

async function drawStats() {
  const s = await api("/api/stats"), wm = Math.max(1, ...s.week.map(d => d.n)), pm = Math.max(1, ...s.by_priority);
  $("#v-stats").innerHTML = `<h1>Аналитика</h1><div class="kpis">`
    + [["Всего", s.total], ["Выполнено", s.done], ["В работе", s.total - s.done], ["Просрочено", s.overdue]].map(([l, n]) => `<div class="kpi"><b>${n}</b><span>${l}</span></div>`).join("")
    + `</div><h3>Выполнено за 7 дней</h3><div class="bars">`
    + s.week.map(d => `<div class="col"><b>${d.n}</b><i style="height:${d.n / wm * 100}px"></i><span>${d.day.slice(8)}.${d.day.slice(5, 7)}</span></div>`).join("")
    + `</div><h3>Активные задачи по приоритету</h3>`
    + s.by_priority.map((n, i) => `<div class="hbar"><span>${PRIO[i]}</span><div><i style="width:${n / pm * 100}%;background:var(--p${i})"></i></div><b>${n}</b></div>`).join("");
}
async function drawActivity() {
  const a = await api("/api/activity"), fmt = { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };
  $("#v-activity").innerHTML = `<h1>Журнал действий</h1>` + (a.length
    ? `<ul class="log">${a.map(x => `<li><time>${new Date(x.ts).toLocaleString("ru-RU", fmt)}</time><b>${ACT[x.action] || x.action}</b><span>${esc(x.detail)}</span></li>`).join("")}</ul>`
    : `<div class="empty">Событий пока нет.</div>`);
}

/* проекты */
function openProj(id) {
  state.pEdit = id; const p = state.projects.find(x => x.id === id);
  $("#pTitle").textContent = p ? "Проект" : "Новый проект"; $("#pName").value = p ? p.name : ""; $("#pDel").hidden = !p;
  $("#pdlg").showModal(); $("#pName").focus();
}
$("#pCancel").onclick = () => $("#pdlg").close();
$("#pForm").onsubmit = async () => {
  const name = $("#pName").value.trim();
  try { state.pEdit ? await api(`/api/projects/${state.pEdit}`, "PATCH", { name }) : await api("/api/projects", "POST", { name }); }
  catch { toast("Проект с таким названием уже есть"); }
  await load();
};
$("#pDel").onclick = async () => {
  await api(`/api/projects/${state.pEdit}`, "DELETE");
  if (state.project === state.pEdit) state.project = null;
  $("#pdlg").close(); await load(); toast("Проект удалён, задачи сохранены");
};

/* подзадачи и проект в редакторе задачи */
function fillProj(id) {
  $("#eProj").innerHTML = `<option value="">Без проекта</option>` + state.projects.map(p => `<option value="${p.id}" ${p.id === id ? "selected" : ""}>${esc(p.name)}</option>`).join("");
}
function drawSubs() {
  $("#eSubs").innerHTML = state.subs.map((s, i) => `<div class="sub"><input type="checkbox" data-i="${i}" ${s.d ? "checked" : ""}><span class="${s.d ? "dn" : ""}">${esc(s.t)}</span><button type="button" data-x="${i}" title="Удалить">×</button></div>`).join("");
}
$("#eSubs").onchange = e => { state.subs[+e.target.dataset.i].d = e.target.checked; drawSubs(); };
$("#eSubs").onclick = e => { const x = e.target.dataset.x; if (x != null) { state.subs.splice(+x, 1); drawSubs(); } };
$("#eSubNew").onkeydown = e => {
  if (e.key !== "Enter") return; e.preventDefault();
  const t = e.target.value.trim(); if (t) { state.subs.push({ t, d: false }); e.target.value = ""; drawSubs(); }
};

/* импорт */
$("#imp").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const r = await api("/api/import", "POST", JSON.parse(await f.text())); toast(`Импортировано задач: ${r.tasks}`); load(); }
  catch { toast("Не удалось прочитать файл"); }
  e.target.value = "";
};

load();

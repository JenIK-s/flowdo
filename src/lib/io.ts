import { api } from "./api";
import { store } from "./store.svelte";

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportData(format: "json" | "csv") {
  if (!api.inTauri) return store.toast("Экспорт доступен в настольном приложении");
  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: `flowdo-${stamp()}.${format}`,
    filters: [format === "csv" ? { name: "Таблица Excel (CSV)", extensions: ["csv"] } : { name: "FlowDo JSON", extensions: ["json"] }],
  });
  if (!path) return;
  try {
    await api.exportFile(path, format);
    store.toast("Файл сохранён", { tone: "ok" });
  } catch (e) {
    store.error(e);
  }
}

export async function importData() {
  if (!api.inTauri) return store.toast("Импорт доступен в настольном приложении");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ multiple: false, filters: [{ name: "FlowDo JSON", extensions: ["json"] }] });
  if (!path) return;
  try {
    const n = await api.importFile(path as string);
    await store.load();
    store.toast(`Импортировано задач: ${n}`, { tone: "ok" });
  } catch (e) {
    store.error(e);
  }
}

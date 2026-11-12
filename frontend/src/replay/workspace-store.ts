import { mergeWorkspaces } from "./workspace-merge";
import { validateWorkspace } from "./workspace-validation";
import { readArchive } from "./archive";
import { isCuratedDataset, readCuratedDataset } from "./curated-data";
const LEGACY_CACHE = "eazy-trading-workspace-v1";
function cacheKey() {
  if (typeof sessionStorage === "undefined") return LEGACY_CACHE;
  return (
    LEGACY_CACHE +
    ":" +
    (sessionStorage.getItem("replay-user-id") || "signed-out")
  );
}
export const blankWorkspace = () => ({
  version: 1,
  sessions: [],
  playbooks: [],
  settings: {},
  revision: 0,
});
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
export function escapeHTML(value: any) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function sameContent(left: any, right: any) {
  const { revision: lr, ...a } = left,
    { revision: rr, ...b } = right,
    stack = [[a, b]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x === y) continue;
    if (
      !x ||
      !y ||
      typeof x !== "object" ||
      typeof y !== "object" ||
      Array.isArray(x) !== Array.isArray(y)
    )
      return false;
    const keys = Object.keys(x);
    if (keys.length !== Object.keys(y).length) return false;
    for (const key of keys) {
      if (!Object.hasOwn(y, key)) return false;
      stack.push([x[key], y[key]]);
    }
  }
  return true;
}
export class WorkspaceStore {
  constructor(onStatus: any = () => {}) {
    this.onStatus = onStatus;
    this.value = blankWorkspace();
    this.dirty = false;
    this.ready = false;
    this.conflict = false;
    this.saving = false;
    this.generation = 0;
    this.timer = null;
    this.base = null;
    this.needsSync = false;
    this.refreshing = false;
    this.canSync = () => true;
    this.onRemote = async () => {};
  }
  cache() {
    try {
      localStorage.setItem(
        cacheKey(),
        JSON.stringify({
          value: this.value,
          dirty: this.dirty,
          base: this.base,
        }),
      );
    } catch {
      this.onStatus(
        "error",
        "Не хватает памяти браузера. Экспортируйте резервную копию.",
      );
    }
  }
  async load() {
    let cached;
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey()) || "null");
    } catch {}
    if (cached?.value) {
      try {
        this.value = validateWorkspace(cached.value);
        this.dirty = !!cached.dirty;
        if (cached.base) this.base = validateWorkspace(cached.base);
      } catch {
        this.onStatus(
          "error",
          "Локальный архив повреждён. Используется облачная копия.",
        );
      }
    }
    try {
      const response = await fetch("/api/workspace", {
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
      if (!response.ok) throw Error("HTTP " + response.status);
      const remote = validateWorkspace(await response.json());
      await this.acceptRemote(remote, false);
    } catch {
      this.onStatus("offline", "Локально · нет соединения с сервером");
    }
    this.ready = true;
    if (this.dirty && !this.conflict) this.schedule();
    return this.value;
  }
  async acceptRemote(remote: any, notify = true) {
    const previous = this.value;
    if (this.dirty && !this.base && remote.revision === this.value.revision)
      this.base = structuredClone(remote);
    const next = this.dirty
      ? mergeWorkspaces(this.base, this.value, remote)
      : remote;
    this.base = structuredClone(remote);
    this.value = next;
    this.dirty = !sameContent(next, remote);
    this.conflict = false;
    this.needsSync = false;
    this.cache();
    if (notify && !sameContent(previous, next)) await this.onRemote(previous);
    this.onStatus(
      this.dirty ? "pending" : "saved",
      this.dirty ? "Сохранение…" : "Синхронизировано",
    );
    if (this.dirty && this.ready) this.schedule();
  }
  async refresh() {
    if (!this.ready || this.saving || this.refreshing || !this.canSync())
      return false;
    this.refreshing = true;
    const generation = this.generation;
    try {
      const response = await fetch(
        `/api/workspace?revision=${this.value.revision}`,
        {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        },
      );
      if (response.status === 204) {
        this.needsSync = false;
        this.onStatus(
          this.dirty ? "pending" : "saved",
          this.dirty ? "Сохранение…" : "Синхронизировано",
        );
        return true;
      }
      if (!response.ok) throw Error("HTTP " + response.status);
      const remote = validateWorkspace(await response.json());
      // A slow response must not replace edits made after this request started.
      if (generation !== this.generation || !this.canSync()) return false;
      if (remote.revision !== this.value.revision || this.needsSync)
        await this.acceptRemote(remote);
      return true;
    } catch (error) {
      this.onStatus(
        "offline",
        "Локально · " + (error.message || "нет соединения"),
      );
      return false;
    } finally {
      this.refreshing = false;
    }
  }
  changed() {
    this.dirty = true;
    this.generation++;
    this.cache();
    if (!this.conflict) {
      this.onStatus("pending", "Сохранение…");
      this.schedule();
    }
  }
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      async () => {
        if (this.needsSync) {
          await this.refresh();
          if (this.needsSync) {
            this.schedule();
            return;
          }
        }
        await this.flush();
      },
      this.needsSync ? 5000 : 900,
    );
  }
  async flush() {
    clearTimeout(this.timer);
    if (
      !this.ready ||
      !this.dirty ||
      this.needsSync ||
      this.saving ||
      this.refreshing
    )
      return false;
    this.saving = true;
    const generation = this.generation,
      payload = structuredClone(this.value);
    try {
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      if (response.status === 409) {
        this.needsSync = true;
        this.onStatus("pending", "Синхронизация…");
        return false;
      }
      if (!response.ok) {
        let msg;
        try {
          msg = (await response.json()).message;
        } catch {}
        throw Error(msg || "HTTP " + response.status);
      }
      const result = await response.json();
      if (!Number.isInteger(result.revision))
        throw Error("Некорректное подтверждение сохранения");
      this.base = { ...payload, revision: result.revision };
      this.value.revision = result.revision;
      this.dirty = this.generation !== generation;
      this.cache();
      this.onStatus(
        this.dirty ? "pending" : "saved",
        this.dirty ? "Сохранение…" : "Сохранено",
      );
      return true;
    } catch (error) {
      this.onStatus(
        "offline",
        "Локально · " + (error.message || "нет соединения"),
      );
      return false;
    } finally {
      this.saving = false;
      if (this.dirty && (this.needsSync || this.generation !== generation))
        this.schedule();
    }
  }
  async useRemote() {
    clearTimeout(this.timer);
    if (this.saving) throw Error("Дождитесь завершения текущего сохранения");
    const response = await fetch("/api/workspace", {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error("Облачная копия пока недоступна");
    const remote = validateWorkspace(await response.json());
    this.value = remote;
    this.base = structuredClone(remote);
    this.needsSync = false;
    this.dirty = false;
    this.conflict = false;
    this.generation++;
    this.cache();
    this.onStatus("saved", "Синхронизировано");
    return remote;
  }
  async uploadDataset(dataset: any) {
    const id = dataset.id || uid(),
      response = await fetch("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...dataset, id }),
        signal: AbortSignal.timeout(60000),
      });
    if (!response.ok) {
      let msg;
      try {
        msg = (await response.json()).message;
      } catch {}
      throw Error(msg || "Не удалось сохранить историю на сервере");
    }
    return { id, ...(await response.json()) };
  }
  async dataset(id: any) {
    if (isCuratedDataset(id)) return readCuratedDataset(id);
    const response = await fetch("/api/datasets/" + encodeURIComponent(id), {
      cache: "no-store",
    });
    if (!response.ok)
      throw Error("Архив сессии недоступен. Повторите загрузку или импорт.");
    const data = await response.json();
    return data.dataset || data;
  }
  async datasetRange(id: any, from: any, to: any) {
    const data = await this.dataset(id);
    return data.kind === "archive"
      ? readArchive(data, from, to, (partId: any) => this.dataset(partId))
      : data;
  }
  async createArchive(input: any) {
    const response = await fetch("/api/archives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(60000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.message || "Не удалось сохранить индекс архива");
    return result;
  }
  async attachment(file: any) {
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    )
      throw Error("Нужен PNG, JPEG или WebP до 5 МБ.");
    const response = await fetch("/api/attachments", {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        "X-Filename": encodeURIComponent(file.name),
      },
      body: file,
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(result.message || "Не удалось сохранить изображение");
    return result;
  }

  base: any;
  needsSync: boolean;
  refreshing: boolean;
  canSync: () => boolean;
  onRemote: (previous: any) => Promise<void>;
  onStatus: any;
  value: any;
  dirty: any;
  ready: any;
  conflict: any;
  saving: any;
  generation: any;
  timer: any;
}

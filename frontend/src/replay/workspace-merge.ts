import { validateWorkspace } from "./workspace-validation";

export function equalValues(a: any, b: any): boolean {
  if (a === b) return true;
  if (
    !a ||
    !b ||
    typeof a !== "object" ||
    typeof b !== "object" ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && equalValues(a[key], b[key]))
  );
}
const record = (v: any) => v && typeof v === "object" && !Array.isArray(v);
function merge(base: any, local: any, remote: any, conflict: () => void): any {
  if (equalValues(local, base)) return structuredClone(remote);
  if (equalValues(remote, base) || equalValues(local, remote))
    return structuredClone(local);
  if (record(local) && record(remote) && (base === undefined || record(base))) {
    const result: any = {};
    for (const key of new Set([
      ...Object.keys(local),
      ...Object.keys(remote),
      ...Object.keys(base || {}),
    ])) {
      const value =
        key === "updatedAt"
          ? [local[key], remote[key]].filter(Boolean).sort().at(-1)
          : merge(base?.[key], local[key], remote[key], conflict);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  conflict();
  return structuredClone(local);
}
const replayKeys = [
  "symbol",
  "datasetId",
  "comparisonDatasetId",
  "from",
  "to",
  "session",
  "capital",
  "snapshot",
];
const replayState = (session: any) =>
  session &&
  Object.fromEntries(
    replayKeys
      .filter((key) => Object.hasOwn(session, key))
      .map((key) => [key, session[key]]),
  );

// Merge against the last acknowledged version, never splice two trading ledgers.
// Incompatible edits retain the remote entity as a separate cloud-synced copy.
export function mergeWorkspaces(base: any, local: any, remote: any) {
  function entities(key: "sessions" | "playbooks") {
    const before = new Map<string, any>(
      (base?.[key] || []).map((v: any) => [v.id, v]),
    );
    const left = new Map<string, any>(local[key].map((v: any) => [v.id, v]));
    const right = new Map<string, any>(remote[key].map((v: any) => [v.id, v]));
    const result: any[] = [];
    for (const id of new Set([...left.keys(), ...right.keys()])) {
      const b = before.get(id),
        l = left.get(id),
        r = right.get(id);
      if (!l || !r) {
        const remaining = l || r;
        if (!b || !equalValues(remaining, b))
          result.push(structuredClone(remaining));
        continue;
      }
      let conflicted = false;
      const mark = () => {
        conflicted = true;
      };
      const value =
        key === "sessions"
          ? (() => {
              const strip = (s: any) =>
                s &&
                Object.fromEntries(
                  Object.entries(s).filter(
                    ([key]) => !replayKeys.includes(key),
                  ),
                );
              const merged = merge(strip(b), strip(l), strip(r), mark);
              const state = merge(
                replayState(b),
                replayState(l),
                replayState(r),
                mark,
              );
              // A replay snapshot and its instrument/range/capital are one atomic unit.
              const localChanged = !equalValues(replayState(l), replayState(b));
              const remoteChanged = !equalValues(
                replayState(r),
                replayState(b),
              );
              if (
                localChanged &&
                remoteChanged &&
                !equalValues(replayState(l), replayState(r))
              ) {
                conflicted = true;
                // Notes and annotations belong to this exact trading ledger too.
                return structuredClone(l);
              }
              return { ...merged, ...state };
            })()
          : merge(b, l, r, mark);
      result.push(value);
      if (conflicted)
        result.push({
          ...structuredClone(r),
          id: crypto.randomUUID(),
          name: r.name.slice(0, 80) + " · sync copy",
        });
    }
    return result;
  }
  return validateWorkspace({
    version: 1,
    revision: remote.revision,
    sessions: entities("sessions"),
    playbooks: entities("playbooks"),
    settings: merge(base?.settings, local.settings, remote.settings, () => {}),
  });
}

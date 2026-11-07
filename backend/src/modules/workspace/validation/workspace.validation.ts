import { fail } from "../../../common/exceptions/api-error";
import { object, validId } from "../../../common/validation/json";
import type { WorkspacePayload } from "../dto/workspace.dto";
export function workspaceValidation(value: unknown): WorkspacePayload {
  if (
    !object(value) ||
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  )
    fail(
      400,
      "INVALID_WORKSPACE",
      "Неверная версия или ревизия рабочего пространства.",
    );
  if (
    !Array.isArray(value.sessions) ||
    value.sessions.length > 1000 ||
    !Array.isArray(value.playbooks) ||
    value.playbooks.length > 500 ||
    !object(value.settings)
  )
    fail(
      400,
      "INVALID_WORKSPACE",
      "Неверные сессии, модели или настройки рабочего пространства.",
    );
  for (const [name, entries] of [
    ["sessions", value.sessions],
    ["playbooks", value.playbooks],
  ]) {
    const seen = new Set();
    for (const entry of entries) {
      if (!object(entry) || !validId(entry.id) || seen.has(entry.id))
        fail(
          400,
          "INVALID_WORKSPACE",
          "У каждой записи " + name + " должен быть уникальный корректный id.",
        );
      seen.add(entry.id);
      if (
        entry.datasetId !== undefined &&
        entry.datasetId !== null &&
        !validId(entry.datasetId)
      )
        fail(
          400,
          "INVALID_WORKSPACE",
          "Неверная ссылка на исторические данные.",
        );
      if (
        entry.comparisonDatasetId !== undefined &&
        (!validId(entry.comparisonDatasetId) ||
          entry.comparisonDatasetId === entry.datasetId)
      )
        fail(
          400,
          "INVALID_WORKSPACE",
          "Неверная ссылка на данные второго инструмента.",
        );
    }
  }
  return {
    version: 1,
    sessions: value.sessions,
    playbooks: value.playbooks,
    settings: value.settings,
  };
}

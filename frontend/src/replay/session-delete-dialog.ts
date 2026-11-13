import { t } from "../i18n/language";

export function confirmSessionDeletion(session: {
  name: string;
  symbol: string;
  comparisonDatasetId?: string;
  from: string;
  to: string;
}): Promise<boolean> {
  const dialog = document.createElement("dialog");
  dialog.className = "session-delete-dialog";
  dialog.setAttribute("aria-labelledby", "session-delete-title");
  dialog.setAttribute("aria-describedby", "session-delete-description");
  const node = (tag: string, className: string, text?: string) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const header = node("div", "session-delete-header");
  const icon = node("span", "session-delete-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
  const close = node("button", "session-delete-close") as HTMLButtonElement;
  close.type = "button";
  close.setAttribute("aria-label", t("Закрыть"));
  close.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  header.append(icon, close);
  const title = node("h2", "", t("Удалить сессию?"));
  title.id = "session-delete-title";
  const description = node(
    "p",
    "session-delete-description",
    t(
      "Сессия, её сделки, разметка и заметки будут удалены. Это действие нельзя отменить.",
    ),
  );
  description.id = "session-delete-description";
  const summary = node("div", "session-delete-summary");
  summary.append(
    node("strong", "", session.name),
    node(
      "span",
      "",
      `${session.comparisonDatasetId ? "NQ + ES" : session.symbol} · ${session.from} → ${session.to}`,
    ),
  );
  const actions = node("div", "session-delete-actions");
  const cancel = node(
    "button",
    "session-delete-cancel",
    t("Отмена"),
  ) as HTMLButtonElement;
  cancel.type = "button";
  cancel.autofocus = true;
  const accept = node(
    "button",
    "session-delete-accept",
    t("Удалить сессию"),
  ) as HTMLButtonElement;
  accept.type = "button";
  actions.append(cancel, accept);
  dialog.append(header, title, description, summary, actions);
  const opener = document.activeElement as HTMLElement | null;
  (document.fullscreenElement || document.body).append(dialog);
  return new Promise((resolve) => {
    let accepted = false;
    cancel.onclick = close.onclick = () => dialog.close();
    accept.onclick = () => {
      accepted = true;
      dialog.close();
    };
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        dialog.close();
    });
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        if (opener?.isConnected) opener.focus({ preventScroll: true });
        resolve(accepted);
      },
      { once: true },
    );
    dialog.showModal();
  });
}

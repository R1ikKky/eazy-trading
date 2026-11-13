import { t } from "../i18n/language";

type Change = { label: string; detail?: string };
export function confirmRewind({
  from,
  to,
  changes,
}: {
  from: string;
  to: string;
  changes: Change[];
}): Promise<boolean> {
  const dialog = document.createElement("dialog");
  dialog.className = "rewind-dialog";
  dialog.setAttribute("aria-labelledby", "rewind-title");
  dialog.setAttribute("aria-describedby", "rewind-description");
  const node = (tag: string, className: string, text?: string) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const header = node("div", "rewind-dialog-header");
  const icon = node("span", "rewind-dialog-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 10h10a6 6 0 1 1 0 12M4 10l6-6M4 10l6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const close = node("button", "rewind-dialog-close") as HTMLButtonElement;
  close.type = "button";
  close.setAttribute("aria-label", t("Закрыть"));
  close.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  header.append(icon, close);
  const title = node("h2", "", t("Вернуться на одну свечу?"));
  title.id = "rewind-title";
  const description = node(
    "p",
    "rewind-description",
    t(
      "Состояние сделки вернётся к предыдущей свече. Следующие изменения будут отменены.",
    ),
  );
  description.id = "rewind-description";
  const time = node("div", "rewind-time");
  for (const [label, value] of [
    [t("Текущая свеча"), from],
    [t("Предыдущая свеча"), to],
  ]) {
    const column = node("div", "");
    column.append(node("span", "", label), node("strong", "", value));
    time.append(column);
  }
  const list = node("ul", "rewind-changes");
  for (const change of changes) {
    const row = node("li", "");
    row.append(node("span", "", change.label));
    if (change.detail) row.append(node("small", "", change.detail));
    list.append(row);
  }
  const footer = node("div", "rewind-dialog-actions");
  const cancel = node(
    "button",
    "button secondary",
    t("Остаться здесь"),
  ) as HTMLButtonElement;
  cancel.type = "button";
  cancel.autofocus = true;
  const accept = node(
    "button",
    "button primary",
    t("Вернуть свечу"),
  ) as HTMLButtonElement;
  accept.type = "button";
  footer.append(cancel, accept);
  dialog.append(header, title, description, time, list, footer);
  const opener = document.activeElement as HTMLElement | null;
  // Keep the dialog in the top layer even when a chart pane is fullscreen.
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
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
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

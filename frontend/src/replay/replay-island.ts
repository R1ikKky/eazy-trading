export function installReplayIsland() {
  const ticket = document.getElementById("orderTicket");
  const trigger = document.querySelector<HTMLElement>(".island-trade-toggle");
  const dock = document.querySelector<HTMLElement>(".app-sidebar");
  if (!ticket || !trigger || !dock) return;
  const position = () => {
    const button = trigger.getBoundingClientRect();
    const bar = dock.getBoundingClientRect();
    const width = Math.min(340, innerWidth - 28);
    ticket.style.left = Math.max(14, Math.min(button.right - width, innerWidth - width - 14)) + "px";
    ticket.style.right = "auto";
    ticket.style.top = bar.bottom + 10 + "px";
    ticket.style.maxHeight = Math.max(100, innerHeight - bar.bottom - 24) + "px";
  };
  ticket.addEventListener("beforetoggle", (event) => {
    if ((event as ToggleEvent).newState === "open") position();
  });
  window.addEventListener("resize", () => {
    if (ticket.matches(":popover-open")) position();
  });
}

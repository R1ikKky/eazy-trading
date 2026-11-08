import TomSelect from "tom-select/base";

/** Bridge the terminal's native select controllers to one shared dropdown UI. */
export function installDropdowns() {
  const controls = new Map<HTMLSelectElement, { ui: TomSelect; signature: string; allowEmpty: boolean }>();
  const valueProperty = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!;
  const signature = (select: HTMLSelectElement) => JSON.stringify(
    Array.from(select.options, (option) => [option.value, option.text, option.disabled]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
  const position = (ui: TomSelect) => {
    const rect = ui.control.getBoundingClientRect();
    const below = innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upwards = below < 180 && above > below;
    Object.assign(ui.dropdown.style, {
      position: "fixed", margin: "0", right: "auto",
      width: Math.min(Math.max(rect.width, 150), innerWidth - 24) + "px",
      left: Math.max(12, Math.min(rect.left, innerWidth - Math.max(rect.width, 150) - 12)) + "px",
      top: upwards ? "auto" : rect.bottom + 7 + "px",
      bottom: upwards ? innerHeight - rect.top + 7 + "px" : "auto",
    });
    ui.dropdown_content.style.maxHeight = Math.max(60, Math.min(300, (upwards ? above : below) - 18)) + "px";
  };
  function enhance(select: HTMLSelectElement) {
    if (select.multiple || controls.has(select)) return;
    const allowEmpty = Array.from(select.options).some((option) => option.value === "");
    const ui = new TomSelect(select, {
      create: false, allowEmptyOption: allowEmpty, hideSelected: false,
      render: { option: (data, escape) => `<div aria-label="${escape(data.text)}">${escape(data.text)}</div>` },
      maxOptions: null, controlInput: null, closeAfterSelect: true, openOnFocus: false,
      dropdownParent: "body",
    });
    select.closest("dialog, [popover]")?.appendChild(ui.dropdown);
    ui.wrapper.classList.add("replay-select");
    ui.dropdown.classList.add("replay-select-menu");
    // A popover escapes scroll-container clipping and remains above modal dialogs.
    ui.dropdown.setAttribute("popover", "manual");
    ui.dropdown.setAttribute("aria-label", select.getAttribute("aria-label") || select.id);
    if (!ui.focus_node.hasAttribute("aria-labelledby")) {
      ui.focus_node.setAttribute("aria-label", select.getAttribute("aria-label") || select.closest("label")?.childNodes[0]?.textContent?.trim() || select.id);
    }
    select.setAttribute("aria-hidden", "true");
    ui.focus_node.addEventListener("keydown", (event) => {
      if ((event.key === " " || event.key === "Enter") && !ui.isOpen && !ui.isDisabled) {
        event.preventDefault();
        event.stopImmediatePropagation();
        ui.open();
      }
    }, true);
    ui.positionDropdown = () => position(ui);
    ui.onClick = () => {
      if (ui.isDisabled || ui.isReadOnly) return;
      if (ui.isOpen) ui.close();
      else { ui.focus(); ui.open(); }
    };
    ui.on("dropdown_open", () => {
      for (const other of controls.values()) if (other.ui !== ui) other.ui.close();
      ui.dropdown.showPopover();
      position(ui);
    });
    ui.on("dropdown_close", () => {
      if (ui.dropdown.matches(":popover-open")) ui.dropdown.hidePopover();
    });
    const syncValue = () => {
      const value = valueProperty.get!.call(select);
      if (ui.getValue() !== value) ui.setValue(value, true);
    };
    Object.defineProperty(select, "value", {
      configurable: true,
      get() { return valueProperty.get!.call(this); },
      set(value) { valueProperty.set!.call(this, value); syncValue(); },
    });
    select.addEventListener("change", syncValue);
    controls.set(select, { ui, signature: signature(select), allowEmpty });
    ui.wrapper.hidden = select.hidden;
  }
  let pending = false;
  function scan() {
    pending = false;
    for (const [select, entry] of controls) {
      if (!select.isConnected) {
        entry.ui.destroy();
        controls.delete(select);
        continue;
      }
      const ui = entry.ui;
      if (!entry.allowEmpty) {
        for (const option of Array.from(select.options)) if (option.value === "" && !option.selected) option.remove();
      }
      if (ui.wrapper.hidden !== select.hidden) {
        ui.wrapper.hidden = select.hidden;
        if (select.hidden) ui.close();
      }
      if (ui.isDisabled !== select.disabled) select.disabled ? ui.disable() : ui.enable();
      const next = signature(select);
      if (entry.signature !== next) {
        const value = select.value;
        const options = Array.from(select.options, (option) => ({ value: option.value, text: option.text, disabled: option.disabled }));
        for (const key of Object.keys(ui.options)) if (!options.some((option) => option.value === key)) ui.removeOption(key, true);
        for (const option of options) {
          if (ui.options[option.value]) ui.updateOption(option.value, { ...ui.options[option.value], ...option });
          else ui.addOption(option);
        }
        ui.setValue(value, true);
        ui.refreshOptions(false);
        entry.signature = signature(select);
      }
    }
    document.querySelectorAll<HTMLSelectElement>("select").forEach(enhance);
  }
  new MutationObserver(() => {
    if (!pending) { pending = true; queueMicrotask(scan); }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "disabled", "label", "value"] });
  const closeMenus = (event: Event) => {
    if (event.target instanceof Element && event.target.closest(".replay-select-menu")) return;
    for (const { ui } of controls.values()) if (ui.isOpen) ui.close();
  };
  window.addEventListener("resize", closeMenus);
  document.addEventListener("scroll", closeMenus, true);
  document.addEventListener("close", closeMenus, true);
  scan();
}

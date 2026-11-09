import { t as translate } from "../i18n/language";
import { element as $ } from "./dom";
import {
  defaults,
  presets,
  sanitizeSettings,
  settingsColor,
} from "./settings-model";

export function createChartSettings({
  prefs,
  apply,
  commit,
  pause,
  toast,
}: any) {
  const dialog = document.getElementById("settingsDialog");
  let baseline: any = null,
    active = "symbol",
    paletteKey: any = null;
  const ids = {
    fontSize: "prefFont",
    barSpacing: "prefSpacing",
    sma: "prefSma",
    ema: "prefEma",
    smaPeriod: "prefSmaPeriod",
    emaPeriod: "prefEmaPeriod",
    smaColor: "prefSmaColor",
    emaColor: "prefEmaColor",
  };
  const id = (k: any) => ids[k] || "pref" + k[0].toUpperCase() + k.slice(1);
  const check = (k: any, label: any) =>
    '<label class="tv-check"><input id="' +
    id(k) +
    '" type="checkbox" data-pref="' +
    k +
    '">' +
    label +
    "</label>";
  const colors = (...keys: any[]) =>
    '<div class="tv-color-pair">' +
    keys
      .map(
        (k) =>
          '<button type="button" id="' +
          id(k) +
          '" data-color="' +
          k +
          '" class="tv-swatch" aria-label="' +
          k +
          ' color"><span></span></button>',
      )
      .join("") +
    "</div>";
  const labelFor = (k: any) =>
    k.replace(/[A-Z]/g, (c) => " " + c.toLowerCase());
  const select = (k: any, choices: any) =>
    '<select id="' +
    id(k) +
    '" data-pref="' +
    k +
    '" aria-label="' +
    labelFor(k) +
    '">' +
    choices
      .map(([v, label]) => '<option value="' + v + '">' + label + "</option>")
      .join("") +
    "</select>";
  const number = (k: any, min: any, max: any, step = 1) =>
    '<input id="' +
    id(k) +
    '" data-pref="' +
    k +
    '" type="number" aria-label="' +
    labelFor(k) +
    '" min="' +
    min +
    '" max="' +
    max +
    '" step="' +
    step +
    '">';
  const row = (label: any, control: any) =>
    '<div class="tv-row"><span>' +
    label +
    '</span><div class="tv-row-controls">' +
    control +
    "</div></div>";
  const heading = (label: any) =>
    '<p class="tv-section-heading">' + label + "</p>";
  const display = [
    ["hidden", "Hidden"],
    ["value", "Value"],
    ["line", "Line"],
    ["both", "Value, line"],
  ];
  const visibility = [
    ["hover", "Visible on mouse over"],
    ["always", "Always visible"],
    ["hidden", "Hidden"],
  ];
  const sections = {
    symbol:
      heading("Candles") +
      check("previousCloseColors", "Color bars based on previous close") +
      row(check("body", "Body"), colors("up", "down")) +
      row(check("borders", "Borders"), colors("borderUp", "borderDown")) +
      row(check("wicks", "Wick"), colors("wickUp", "wickDown")) +
      heading("Data modification") +
      row(
        "Session",
        select("session", [
          ["all", "Extended trading hours"],
          ["rth", "Regular trading hours"],
        ]),
      ) +
      '<p class="tv-note">Regular session: 09:30–16:00 New York. Changing the session starts a new replay after applying.</p>' +
      row(
        "Precision",
        select("precision", [
          ["default", "Default"],
          ...["0", "1", "2", "3", "4"].map((v) => [v, v + " decimals"]),
        ]),
      ) +
      row(
        "Timezone",
        select("timezone", [
          ["America/New_York", "New York · ET"],
          ["Europe/Moscow", "Moscow · MSK"],
          ["UTC", "UTC"],
          ["Europe/London", "London"],
          ["Europe/Berlin", "Berlin"],
          ["Asia/Tokyo", "Tokyo"],
          ["Asia/Dubai", "Dubai"],
        ]),
      ),
    status:
      heading("Symbol") +
      row(
        check("title", "Title"),
        select("titleType", [
          ["description", "Description"],
          ["ticker", "Ticker"],
          ["both", "Ticker and description"],
        ]),
      ) +
      check("marketStatus", "Open market status") +
      check("chartValues", "Chart values") +
      check("barChanges", "Bar change values") +
      check("statusVolume", "Volume") +
      row(
        check("statusBackground", "Background"),
        '<input type="range" id="' +
          id("statusOpacity") +
          '" data-pref="statusOpacity" min="0" max="100" aria-label="Status line background opacity">',
      ),
    scales:
      heading("Price scale") +
      row("Scale modes (A and L)", select("scaleModes", visibility)) +
      row(
        check("lockRatio", "Lock price to bar ratio"),
        number("priceBarRatio", 0.000001, 100000, 0.000001),
      ) +
      row(
        "Scales placement",
        select("scalePlacement", [
          ["auto", "Auto"],
          ["right", "Right"],
          ["left", "Left"],
        ]),
      ) +
      row(
        "Price scale",
        select("scale", [
          ["normal", "Regular"],
          ["log", "Logarithmic"],
          ["percentage", "Percentage"],
          ["indexed", "Indexed to 100"],
        ]),
      ) +
      check("invert", "Invert scale") +
      heading("Price labels & lines") +
      check("alignLabels", "No overlapping labels") +
      check("plusButton", "Plus button") +
      check("countdown", "Countdown to bar close") +
      row(
        "Symbol",
        select("symbolLabels", display) + colors("symbolLineColor"),
      ) +
      row(
        "",
        select("symbolLabelValue", [
          ["scale", "Value according to scale"],
          ["price", "Price value"],
        ]),
      ) +
      row(
        "Previous day close",
        select("previousDayClose", display) + colors("previousDayColor"),
      ) +
      row(
        "High and low",
        select("highLow", display) + colors("highColor", "lowColor"),
      ) +
      heading("Time scale") +
      check("weekday", "Day of week on labels") +
      row(
        "Date format",
        select("dateFormat", [
          ["day-month-year", "Mon 29 Sep ’97"],
          ["iso", "1997-09-29"],
          ["day-month", "29 Sep"],
          ["month-day", "29 September"],
        ]),
      ) +
      row(
        "Time hours format",
        select("hoursFormat", [
          ["24", "24-hours"],
          ["12", "12-hours"],
        ]),
      ) +
      check(
        "saveLeftEdge",
        "Save chart left edge position when changing interval",
      ),
    canvas:
      heading("Chart basic styles") +
      row(
        "Background",
        select("backgroundType", [
          ["solid", "Solid"],
          ["gradient", "Gradient"],
        ]) + colors("background", "backgroundBottom"),
      ) +
      row(
        "Grid lines",
        select("gridMode", [
          ["none", "None"],
          ["horizontal", "Horizontal"],
          ["vertical", "Vertical"],
          ["both", "Horizontal and vertical"],
        ]) + colors("gridColor"),
      ) +
      row(
        check("sessionBreaks", "Session breaks"),
        colors("sessionBreakColor"),
      ) +
      row(check("crosshair", "Crosshair"), colors("crosshairColor")) +
      row(
        "Watermark",
        select("watermark", [
          ["hidden", "Hidden"],
          ["symbol", "Symbol"],
          ["description", "Description"],
        ]) + colors("watermarkColor"),
      ) +
      heading("Scales") +
      row(
        "Text",
        colors("text") +
          select(
            "fontSize",
            [10, 11, 12, 13, 14, 16, 18, 20, 22, 24].map((v) => [
              String(v),
              String(v),
            ]),
          ),
      ) +
      row("Lines", colors("scaleLines")) +
      heading("Buttons") +
      row("Navigation", select("navigation", visibility)) +
      row("Pane", select("paneButtons", visibility)) +
      heading("Margins") +
      row("Top", number("marginTop", 0, 45) + "<span>%</span>") +
      row("Bottom", number("marginBottom", 0, 45) + "<span>%</span>") +
      row("Right", number("marginRight", 0, 100) + "<span>bars</span>") +
      row("Bar spacing", number("barSpacing", 2, 40) + "<span>px</span>"),
    indicators:
      heading("Indicators") +
      row(
        check("sma", "SMA"),
        number("smaPeriod", 2, 500) + colors("smaColor"),
      ) +
      row(
        check("ema", "EMA"),
        number("emaPeriod", 2, 500) + colors("emaColor"),
      ) +
      check("volume", "Volume histogram") +
      '<p class="tv-note">Indicators use revealed candles only. Periods count bars of the selected interval.</p>',
    drawing:
      heading("New drawings") +
      row("Line color", colors("drawingColor")) +
      row(
        "Width",
        select(
          "drawingWidth",
          [1, 2, 3, 4].map((v) => [String(v), v + " px"]),
        ),
      ) +
      check("drawingDashed", "Dashed line") +
      row(
        "Zone fill opacity",
        '<input type="range" id="' +
          id("zoneOpacity") +
          '" data-pref="zoneOpacity" min="0" max="100" aria-label="Zone fill opacity">',
      ) +
      check("hideMarks", "Hide marks on bars") +
      '<p class="tv-note">Use Select to move an object. Delete removes the selected drawing. Esc exits drawing mode.</p>',
  };
  const tabs = [
    ["symbol", "♙", "Symbol"],
    ["status", "☷", "Status line"],
    ["scales", "↕", "Scales and lines"],
    ["canvas", "◇", "Canvas"],
    ["indicators", "ƒ", "Indicators"],
    ["drawing", "╱", "Drawings"],
  ];
  dialog.innerHTML =
    '<div class="tv-settings-header"><h2 id="settingsTitle">Settings</h2><button type="button" id="settingsClose" aria-label="Close settings">×</button></div><div class="tv-settings-body"><nav class="tv-settings-tabs" role="tablist" aria-label="Chart settings">' +
    tabs
      .map(
        ([key, icon, label]) =>
          '<button type="button" id="tab-' +
          key +
          '" data-settings-tab="' +
          key +
          '" role="tab" aria-controls="panel-' +
          key +
          '"><span aria-hidden="true">' +
          icon +
          "</span>" +
          label +
          "</button>",
      )
      .join("") +
    '</nav><div class="tv-settings-content">' +
    Object.entries<any>(sections)
      .map(
        ([key, html]) =>
          '<section id="panel-' +
          key +
          '" role="tabpanel" aria-labelledby="tab-' +
          key +
          '">' +
          html +
          "</section>",
      )
      .join("") +
    '</div></div><div class="tv-settings-footer"><label class="sr-only" for="chartTemplate">Chart template</label><select id="chartTemplate"><option value="">Template</option><option value="reference">Screenshot preset</option><option value="light">Light</option><option value="dark">Dark</option><option value="save">Save my template</option><option value="load">Load my template</option><option value="export">Export Replay Lab JSON</option><option value="import">Import Replay Lab JSON</option><option value="reset">Reset settings</option></select><div><button id="settingsApply" type="button">Apply to all</button><button id="settingsCancel" type="button">Cancel</button><button id="settingsOk" type="button">Ok</button></div></div><input id="chartTemplateFile" type="file" accept=".json,application/json" hidden><div id="chartPalette" class="tv-palette" hidden></div>';
  dialog.setAttribute("aria-labelledby", "settingsTitle");
  const palette = $("chartPalette");
  function fill() {
    for (const el of dialog.querySelectorAll<HTMLInputElement>("[data-pref]")) {
      const v = prefs[el.dataset.pref];
      if (el.type === "checkbox") el.checked = v;
      else if (el !== document.activeElement || el.type !== "number")
        el.value = v;
    }
    for (const button of dialog.querySelectorAll<HTMLElement>("[data-color]")) {
      const k = button.dataset.color;
      (button.firstElementChild as HTMLElement).style.background =
        settingsColor(prefs, k);
      button.title =
        k + " · " + prefs[k] + " · " + (prefs.colorOpacity[k] ?? 100) + "%";
    }
    $("prefLockRatio").disabled = prefs.scale !== "normal";
    $("prefLockRatio").title =
      prefs.scale !== "normal" ? "Available on the regular price scale" : "";
    $("prefPriceBarRatio").disabled = !prefs.lockRatio;
    $("prefBackgroundBottom").hidden = prefs.backgroundType !== "gradient";
  }
  function tab(name: any) {
    active = name;
    for (const button of dialog.querySelectorAll<HTMLElement>(
      "[data-settings-tab]",
    )) {
      const selected = button.dataset.settingsTab === name;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      $("panel-" + button.dataset.settingsTab).hidden = !selected;
    }
    palette.hidden = true;
  }
  function replace(p: any) {
    for (const k of Object.keys(prefs)) delete prefs[k];
    Object.assign(prefs, sanitizeSettings(p));
    fill();
    apply();
  }
  function close(cancel = true) {
    palette.hidden = true;
    if (cancel && baseline) replace(baseline);
    baseline = null;
    (dialog as HTMLDialogElement).close();
  }
  function save() {
    if (commit?.(baseline, prefs) === false) return false;
    try {
      localStorage.setItem("replay-lab-chart-v3", JSON.stringify(prefs));
    } catch {
      toast(translate("Не удалось сохранить настройки. Они действуют до перезагрузки."));
    }
    baseline = structuredClone(prefs);
    return true;
  }
  function open(name?: any) {
    pause();
    baseline = structuredClone(prefs);
    fill();
    tab(name || active);
    (dialog as HTMLDialogElement).showModal();
  }
  $("settingsOpen").onclick = () => open();
  $("settingsClose").onclick = () => close();
  $("settingsCancel").onclick = () => close();
  $("settingsOk").onclick = () => {
    if (save()) close(false);
  };
  $("settingsApply").onclick = () => {
    if (save()) toast(translate("Настройки применены к NQ и ES в этом браузере."));
  };
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    if (!palette.hidden) {
      palette.hidden = true;
      return;
    }
    close();
  });
  dialog.addEventListener("close", () => {
    if (baseline) {
      replace(baseline);
      baseline = null;
    }
    palette.hidden = true;
  });
  for (const b of dialog.querySelectorAll<HTMLElement>("[data-settings-tab]")) {
    b.onclick = () => tab(b.dataset.settingsTab);
    b.onkeydown = (e) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
        return;
      e.preventDefault();
      let index =
        tabs.findIndex((t) => t[0] === active) +
        (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1);
      index = (index + tabs.length) % tabs.length;
      tab(tabs[index][0]);
      $("tab-" + active).focus();
    };
  }
  for (const el of dialog.querySelectorAll<HTMLInputElement>("[data-pref]")) {
    el.oninput = () => {
      if (el.type === "number" && el.value === "") return;
      const k = el.dataset.pref,
        value =
          el.type === "checkbox"
            ? el.checked
            : typeof defaults[k] === "number"
              ? Number(el.value)
              : el.value;
      const next = sanitizeSettings({ ...prefs, [k]: value });
      Object.assign(prefs, next);
      fill();
      apply();
    };
    el.onblur = () => {
      if (el.type === "number") el.value = prefs[el.dataset.pref];
    };
  }
  const paletteColors = [
    "#ffffff",
    "#e0e0e0",
    "#cccccc",
    "#b2b2b2",
    "#999999",
    "#808080",
    "#666666",
    "#404040",
    "#202020",
    "#000000",
    "#f44336",
    "#ff9800",
    "#ffeb3b",
    "#4caf50",
    "#009688",
    "#00bcd4",
    "#2962ff",
    "#673ab7",
    "#9c27b0",
    "#e91e63",
  ];
  const base = [
    "#f44336",
    "#ff9800",
    "#ffeb3b",
    "#4caf50",
    "#009688",
    "#00bcd4",
    "#2962ff",
    "#673ab7",
    "#9c27b0",
    "#e91e63",
  ];
  for (const mix of [0.78, 0.6, 0.4, 0.18, -0.12, -0.3, -0.5])
    for (const c of base)
      paletteColors.push(
        "#" +
          [1, 3, 5]
            .map((i) => {
              const v = parseInt(c.slice(i, i + 2), 16);
              return Math.round(mix >= 0 ? v + (255 - v) * mix : v * (1 + mix))
                .toString(16)
                .padStart(2, "0");
            })
            .join(""),
      );
  const lineStyles = {
    crosshairColor: ["crosshairStyle", "crosshairWidth"],
    sessionBreakColor: ["sessionBreakStyle"],
    symbolLineColor: ["symbolLineStyle"],
    previousDayColor: ["previousDayStyle"],
  };
  function updateColor(hex: any, opacity?: any) {
    if (!/^#[a-f\d]{6}$/i.test(hex)) return;
    prefs[paletteKey] = hex;
    if (opacity !== undefined) prefs.colorOpacity[paletteKey] = Number(opacity);
    fill();
    apply();
  }
  function hexToHsv(hex: any) {
    const [r, g, b] = [1, 3, 5].map(
        (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
      ),
      v = Math.max(r, g, b),
      d = v - Math.min(r, g, b);
    const h =
      d === 0
        ? 0
        : v === r
          ? ((g - b) / d + 6) % 6
          : v === g
            ? (b - r) / d + 2
            : (r - g) / d + 4;
    return { h: h * 60, s: v === 0 ? 0 : d / v, v };
  }
  function hsvToHex({ h, s, v }: any) {
    const c = v * s,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
      m = v - c;
    const rgb =
      h < 60
        ? [c, x, 0]
        : h < 120
          ? [x, c, 0]
          : h < 180
            ? [0, c, x]
            : h < 240
              ? [0, x, c]
              : h < 300
                ? [x, 0, c]
                : [c, 0, x];
    return (
      "#" +
      rgb
        .map((n) =>
          Math.round((n + m) * 255)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
    );
  }
  function showPalette(button: any) {
    paletteKey = button.dataset.color;
    const [styleKey, widthKey] = lineStyles[paletteKey] || [];
    palette.innerHTML =
      '<div class="tv-palette-current"><span style="background:' +
      prefs[paletteKey] +
      '"></span><span style="background:#000000"></span></div><div class="tv-palette-grid">' +
      paletteColors
        .map(
          (c) =>
            '<button type="button" data-palette-color="' +
            c +
            '" aria-label="Color ' +
            c +
            '" style="background:' +
            c +
            '" class="' +
            (c === prefs[paletteKey] ? "selected" : "") +
            '"></button>',
        )
        .join("") +
      '</div><div class="tv-custom-color"><button id="paletteCustomAdd" type="button" aria-label="Edit custom color" aria-controls="paletteCustomEditor" aria-expanded="false">＋</button><input id="paletteHex" type="text" maxlength="7" value="' +
      prefs[paletteKey] +
      '" aria-label="Custom hex color" spellcheck="false"><button id="paletteCustomToggle" type="button" aria-label="Edit custom color" aria-controls="paletteCustomEditor" aria-expanded="false"><span></span></button></div><div id="paletteCustomEditor" class="tv-custom-editor" hidden><div id="paletteColorArea" class="tv-color-area" tabindex="0" role="slider" aria-label="Saturation and brightness" aria-valuemin="0" aria-valuemax="100"><span id="paletteColorCursor"></span></div><input id="paletteHue" type="range" min="0" max="359" value="0" aria-label="Hue"></div><label class="tv-opacity" for="paletteOpacity">Opacity <output id="paletteOpacityValue">' +
      (prefs.colorOpacity[paletteKey] ?? 100) +
      '%</output></label><input id="paletteOpacity" type="range" min="0" max="100" value="' +
      (prefs.colorOpacity[paletteKey] ?? 100) +
      '">' +
      (styleKey
        ? '<div class="tv-line-options"><select id="paletteLineStyle" aria-label="Line style"><option value="0">Solid</option><option value="1">Dotted</option><option value="2">Dashed</option><option value="3">Large dashed</option></select>' +
          (widthKey
            ? '<select id="paletteLineWidth" aria-label="Line width">' +
              [1, 2, 3, 4]
                .map((v) => '<option value="' + v + '">' + v + " px</option>")
                .join("") +
              "</select>"
            : "") +
          "</div>"
        : "");
    let hsv = hexToHsv(prefs[paletteKey]);
    const area = $("paletteColorArea");
    const position = () => {
      const rect = button.getBoundingClientRect(),
        w = window.innerWidth,
        h = window.innerHeight;
      palette.style.left =
        Math.max(8, Math.min(w - (palette.offsetWidth || 248) - 8, rect.left)) +
        "px";
      palette.style.top =
        Math.max(
          8,
          Math.min(h - (palette.offsetHeight || 430) - 8, rect.bottom + 6),
        ) + "px";
    };
    const sync: any = () => {
      $("paletteHex").value = prefs[paletteKey];
      $("paletteCustomToggle").firstElementChild.style.background =
        prefs[paletteKey];
      palette.querySelector(".tv-palette-current span").style.background =
        prefs[paletteKey];
      for (const b of palette.querySelectorAll("[data-palette-color]"))
        b.classList.toggle(
          "selected",
          b.dataset.paletteColor === prefs[paletteKey].toLowerCase(),
        );
      area.style.backgroundColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });
      $("paletteHue").value = Math.round(hsv.h);
      $("paletteColorCursor").style.left = hsv.s * 100 + "%";
      $("paletteColorCursor").style.top = (1 - hsv.v) * 100 + "%";
      area.setAttribute("aria-valuenow", String(Math.round(hsv.s * 100)));
      area.setAttribute(
        "aria-valuetext",
        "Saturation " +
          Math.round(hsv.s * 100) +
          "%, brightness " +
          Math.round(hsv.v * 100) +
          "%",
      );
    };
    const applyCustom = () => {
      updateColor(hsvToHex(hsv));
      sync();
    };
    for (const b of palette.querySelectorAll("[data-palette-color]"))
      b.onclick = () => {
        updateColor(b.dataset.paletteColor);
        hsv = hexToHsv(prefs[paletteKey]);
        sync();
      };
    $("paletteHex").onchange = () => {
      updateColor($("paletteHex").value.trim().toLowerCase());
      hsv = hexToHsv(prefs[paletteKey]);
      sync();
    };
    for (const toggle of [$("paletteCustomAdd"), $("paletteCustomToggle")])
      toggle.onclick = () => {
        const editor = $("paletteCustomEditor");
        editor.hidden = !editor.hidden;
        for (const b of [$("paletteCustomAdd"), $("paletteCustomToggle")])
          b.setAttribute("aria-expanded", String(!editor.hidden));
        position();
        if (!editor.hidden) area.focus();
      };
    $("paletteHue").oninput = () => {
      hsv.h = Number($("paletteHue").value);
      applyCustom();
    };
    area.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const move = (event: any) => {
        const rect = area.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        hsv.s = Math.max(
          0,
          Math.min(1, (event.clientX - rect.left) / rect.width),
        );
        hsv.v =
          1 -
          Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        applyCustom();
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
      };
      area.focus();
      move(e);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    };
    area.onkeydown = (e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
        return;
      e.preventDefault();
      const step = e.shiftKey ? 0.1 : 0.01;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight")
        hsv.s = Math.max(
          0,
          Math.min(1, hsv.s + (e.key === "ArrowRight" ? step : -step)),
        );
      else
        hsv.v = Math.max(
          0,
          Math.min(1, hsv.v + (e.key === "ArrowUp" ? step : -step)),
        );
      applyCustom();
    };
    palette.hidden = false;
    sync();
    position();
    $("paletteOpacity").oninput = () => {
      updateColor(prefs[paletteKey], $("paletteOpacity").value);
      $("paletteOpacityValue").textContent = $("paletteOpacity").value + "%";
    };
    if (styleKey) {
      $("paletteLineStyle").value = prefs[styleKey];
      $("paletteLineStyle").onchange = () => {
        prefs[styleKey] = Number($("paletteLineStyle").value);
        apply();
      };
    }
    if (widthKey) {
      $("paletteLineWidth").value = prefs[widthKey];
      $("paletteLineWidth").onchange = () => {
        prefs[widthKey] = Number($("paletteLineWidth").value);
        apply();
      };
    }
  }
  for (const b of dialog.querySelectorAll<HTMLElement>("[data-color]"))
    b.onclick = () => showPalette(b);
  dialog.addEventListener("pointerdown", (e) => {
    if (
      !palette.contains(e.target) &&
      !(e.target as HTMLElement).closest("[data-color]")
    )
      palette.hidden = true;
  });
  $("chartTemplate").onchange = () => {
    const action = $("chartTemplate").value;
    $("chartTemplate").value = "";
    if (presets[action]) {
      replace({
        ...prefs,
        ...presets[action],
        colorOpacity: structuredClone(defaults.colorOpacity),
      });
      return;
    }
    if (action === "reset") replace(defaults);
    if (action === "save")
      try {
        localStorage.setItem("replay-lab-template", JSON.stringify(prefs));
        toast(translate("Шаблон сохранён в этом браузере."));
      } catch {
        toast(translate("Не удалось сохранить шаблон."));
      }
    if (action === "load")
      try {
        const saved = JSON.parse(
          localStorage.getItem("replay-lab-template") || "null",
        );
        if (saved) replace(saved);
        else toast(translate("Сначала сохраните шаблон."));
      } catch {
        toast(translate("Не удалось прочитать шаблон."));
      }
    if (action === "export") {
      const url = URL.createObjectURL(
          new Blob(
            [
              JSON.stringify(
                { replayLabChartSettings: 1, preferences: prefs },
                null,
                2,
              ),
            ],
            { type: "application/json" },
          ),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = "replay-lab-chart-settings.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    if (action === "import") {
      $("chartTemplateFile").value = "";
      $("chartTemplateFile").click();
    }
  };
  $("chartTemplateFile").onchange = async () => {
    const file = $("chartTemplateFile").files[0];
    if (!file) return;
    try {
      if (file.size > 100000) throw Error(translate("Шаблон больше 100 КБ."));
      const saved = JSON.parse(await file.text());
      if (
        saved.replayLabChartSettings !== 1 ||
        !saved.preferences ||
        typeof saved.preferences !== "object"
      )
        throw Error(
          translate("Нужен шаблон Replay Lab JSON. Экспорт аккаунта TradingView не поддерживается."),
        );
      replace(saved.preferences);
      toast(translate("Шаблон загружен. Нажмите Ok для сохранения."));
    } catch (e) {
      toast(e.message);
    }
  };
  fill();
  tab(active);
  return { open };
}

export const presets = {
  reference: {
    background: "#999999",
    backgroundType: "solid",
    text: "#000000",
    up: "#ffffff",
    down: "#000000",
    borderUp: "#000000",
    borderDown: "#000000",
    wickUp: "#000000",
    wickDown: "#000000",
    gridMode: "none",
    volume: false,
    crosshair: true,
    preset: "reference",
  },
  light: {
    background: "#ffffff",
    backgroundType: "solid",
    text: "#596652",
    up: "#2c967c",
    down: "#db7471",
    borderUp: "#2c967c",
    borderDown: "#db7471",
    wickUp: "#2c967c",
    wickDown: "#db7471",
    gridMode: "both",
    volume: true,
    crosshair: true,
    preset: "light",
  },
  dark: {
    background: "#141820",
    backgroundType: "solid",
    text: "#a4acbb",
    up: "#31b99b",
    down: "#ef6d77",
    borderUp: "#31b99b",
    borderDown: "#ef6d77",
    wickUp: "#31b99b",
    wickDown: "#ef6d77",
    gridMode: "both",
    volume: true,
    crosshair: true,
    preset: "dark",
  },
};
export const defaults = {
  ...presets.reference,
  backgroundBottom: "#20252f",
  gridColor: "#747474",
  scaleLines: "#484848",
  crosshairColor: "#000000",
  crosshairWidth: 1,
  crosshairStyle: 2,
  body: true,
  borders: true,
  wicks: true,
  previousCloseColors: false,
  timezone: "America/New_York",
  session: "all",
  precision: "default",
  fontSize: 12,
  barSpacing: 8,
  scale: "normal",
  autoScale: true,
  invert: false,
  scalePlacement: "auto",
  scaleModes: "hover",
  lockRatio: false,
  priceBarRatio: 0.9530377,
  alignLabels: true,
  plusButton: true,
  countdown: false,
  symbolLabels: "both",
  symbolLabelValue: "scale",
  symbolLineColor: "#111111",
  symbolLineStyle: 0,
  previousDayClose: "hidden",
  previousDayColor: "#686868",
  previousDayStyle: 2,
  highLow: "hidden",
  highColor: "#269c88",
  lowColor: "#e55969",
  weekday: true,
  dateFormat: "day-month-year",
  hoursFormat: "24",
  saveLeftEdge: false,
  title: true,
  titleType: "description",
  marketStatus: true,
  chartValues: true,
  barChanges: true,
  statusVolume: false,
  statusBackground: true,
  statusOpacity: 50,
  sessionBreaks: false,
  sessionBreakColor: "#47729a",
  sessionBreakStyle: 2,
  watermark: "hidden",
  watermarkColor: "#313131",
  navigation: "hover",
  paneButtons: "hover",
  marginTop: 10,
  marginBottom: 8,
  marginRight: 10,
  hideMarks: false,
  sma: false,
  smaPeriod: 20,
  smaColor: "#396792",
  ema: false,
  emaPeriod: 50,
  emaColor: "#a16b2d",
  drawingColor: "#161616",
  drawingWidth: 1,
  drawingDashed: false,
  zoneOpacity: 14,
  colorOpacity: { watermarkColor: 15 } as Record<string, number>,
};
export const colorKeys = Object.keys(defaults).filter(
  (k) => typeof defaults[k] === "string" && /^#[a-f\d]{6}$/i.test(defaults[k]),
);
const enums = {
  backgroundType: ["solid", "gradient"],
  gridMode: ["none", "horizontal", "vertical", "both"],
  timezone: [
    "America/New_York",
    "Europe/Moscow",
    "UTC",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Dubai",
  ],
  session: ["all", "rth"],
  precision: ["default", "0", "1", "2", "3", "4"],
  scale: ["normal", "log", "percentage", "indexed"],
  scalePlacement: ["auto", "left", "right"],
  scaleModes: ["always", "hover", "hidden"],
  symbolLabels: ["hidden", "value", "line", "both"],
  symbolLabelValue: ["scale", "price"],
  previousDayClose: ["hidden", "value", "line", "both"],
  highLow: ["hidden", "value", "line", "both"],
  dateFormat: ["day-month-year", "iso", "day-month", "month-day"],
  hoursFormat: ["24", "12"],
  titleType: ["description", "ticker", "both"],
  watermark: ["hidden", "symbol", "description"],
  navigation: ["always", "hover", "hidden"],
  paneButtons: ["always", "hover", "hidden"],
};
const numbers = {
  fontSize: [10, 24],
  barSpacing: [2, 40],
  smaPeriod: [2, 500],
  emaPeriod: [2, 500],
  drawingWidth: [1, 4],
  zoneOpacity: [0, 100],
  statusOpacity: [0, 100],
  marginTop: [0, 45],
  marginBottom: [0, 45],
  marginRight: [0, 100],
  priceBarRatio: [0.000001, 100000],
  crosshairWidth: [1, 4],
  crosshairStyle: [0, 4],
  symbolLineStyle: [0, 4],
  previousDayStyle: [0, 4],
  sessionBreakStyle: [0, 4],
};
export function sanitizeSettings(input: any = {}) {
  // Ignore legacy hollow settings: standard candles use the selected Body colors.
  const p = structuredClone(defaults);
  for (const k of Object.keys(defaults)) {
    const v = input[k];
    if (v === undefined) continue;
    if (colorKeys.includes(k)) {
      if (/^#[a-f\d]{6}$/i.test(v)) p[k] = v;
    } else if (enums[k]) {
      if (enums[k].includes(String(v))) p[k] = String(v);
    } else if (numbers[k]) {
      if (Number.isFinite(Number(v)))
        p[k] = Math.max(numbers[k][0], Math.min(numbers[k][1], Number(v)));
    } else if (typeof defaults[k] === "boolean") {
      if (typeof v === "boolean") p[k] = v;
    } else if (
      k === "preset" &&
      ["reference", "light", "dark", "custom"].includes(v)
    )
      p[k] = v;
  }
  for (const k of [
    "smaPeriod",
    "emaPeriod",
    "fontSize",
    "drawingWidth",
    "crosshairWidth",
  ])
    p[k] = Math.round(p[k]);
  if (p.scale !== "normal") p.lockRatio = false;
  p.colorOpacity = { ...defaults.colorOpacity };
  for (const k of colorKeys)
    if (Number.isFinite(Number(input.colorOpacity?.[k])))
      p.colorOpacity[k] = Math.max(
        0,
        Math.min(100, Number(input.colorOpacity[k])),
      );
  return p;
}
export function loadSettings() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem("eazy-trading-chart-v3") || "null");
    if (!saved) {
      const old = JSON.parse(
        localStorage.getItem("eazy-trading-chart-v2") || "null",
      );
      if (old)
        saved = {
          ...old,
          gridMode: old.grid ? "both" : "none",
          borderUp: old.wickUp,
          borderDown: old.wickDown,
        };
    }
  } catch {}
  return sanitizeSettings(saved || {});
}
export function rgba(hex: any, opacity = 100) {
  return (
    "rgba(" +
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",") +
    "," +
    Math.max(0, Math.min(100, opacity)) / 100 +
    ")"
  );
}
export function settingsColor(p: any, key: any) {
  return rgba(p[key], p.colorOpacity?.[key] ?? 100);
}
const eastern = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function isRegularSession(time: any) {
  const parts = eastern.formatToParts(new Date(time * 1000));
  const get = (k: any) => parts.find((p) => p.type === k)?.value;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return (
    !["Sat", "Sun"].includes(get("weekday")) && minutes >= 570 && minutes < 960
  );
}
export function isExtendedSession(time: any) {
  const parts = eastern.formatToParts(new Date(time * 1000)),
    get = (k: any) => parts.find((p) => p.type === k)?.value,
    day = get("weekday"),
    m = Number(get("hour")) * 60 + Number(get("minute"));
  return (
    day !== "Sat" &&
    (day === "Sun"
      ? m >= 1080
      : day === "Fri"
        ? m < 1020
        : m < 1020 || m >= 1080)
  );
}
export function barTime(time: any, minutes: any, session = "all") {
  if (session !== "rth")
    return Math.floor(time / (minutes * 60)) * minutes * 60;
  const parts = eastern.formatToParts(new Date(time * 1000)),
    minuteOfDay =
      Number(parts.find((p) => p.type === "hour").value) * 60 +
      Number(parts.find((p) => p.type === "minute").value);
  return time - ((minuteOfDay - 570) % minutes) * 60;
}
export function chartDate(time: any, p: any, dateOnly = false) {
  const d = new Date(time * 1000),
    f = { timeZone: p.timezone };
  const date =
    p.dateFormat === "iso"
      ? (p.weekday
          ? new Intl.DateTimeFormat("en-US", { ...f, weekday: "short" }).format(
              d,
            ) + " "
          : "") +
        new Intl.DateTimeFormat("sv-SE", {
          ...f,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d)
      : new Intl.DateTimeFormat("en-GB", {
          ...f,
          day: "2-digit",
          month: p.dateFormat === "month-day" ? "long" : "short",
          ...(p.dateFormat === "day-month-year" ? { year: "2-digit" } : {}),
          ...(p.weekday ? { weekday: "short" } : {}),
        }).format(d);
  if (dateOnly) return date;
  return (
    date +
    " " +
    new Intl.DateTimeFormat("en-US", {
      ...f,
      hour: "2-digit",
      minute: "2-digit",
      hour12: p.hoursFormat === "12",
    }).format(d)
  );
}

import { t as translate } from "../i18n/language";
export type Tool = {
  id: string;
  name: string;
  points: number;
  kind?: string;
  labels?: string[];
};
export const DRAWING_GROUPS: {
  id: string;
  name: string;
  icon: string;
  tools: Tool[];
}[] = [
  {
    id: "cursor",
    name: translate("Курсор"),
    icon: "cursor",
    tools: [
      { id: "cursor", name: translate("Перекрестие"), points: 0, kind: "cursor" },
      { id: "dot", name: translate("Точка"), points: 0, kind: "cursor" },
      { id: "arrow-cursor", name: translate("Стрелка"), points: 0, kind: "cursor" },
      { id: "demo", name: translate("Демонстрация"), points: -1, kind: "laser" },
      { id: "select", name: translate("Выбрать / изменить"), points: 0, kind: "cursor" },
      { id: "eraser", name: translate("Ластик"), points: 0, kind: "eraser" },
    ],
  },
  {
    id: "lines",
    name: translate("Линии"),
    icon: "trend",
    tools: [
      { id: "trend", name: translate("Линия тренда"), points: 2 },
      { id: "trend-ray", name: translate("Луч"), points: 2 },
      { id: "info-line", name: translate("Линия данных"), points: 2 },
      { id: "extended", name: translate("Удлинённая линия"), points: 2 },
      { id: "angle", name: translate("Угол тренда"), points: 2 },
      { id: "level", name: translate("Горизонтальная линия"), points: 1 },
      { id: "ray", name: translate("Горизонтальный луч"), points: 1 },
      { id: "vertical", name: translate("Вертикальная линия"), points: 1 },
      { id: "cross", name: translate("Перекрещенные линии"), points: 1 },
    ],
  },
  {
    id: "fib",
    name: translate("Фибоначчи"),
    icon: "fib",
    tools: [
      { id: "fib", name: translate("Коррекция Фибоначчи"), points: 2 },
      {
        id: "fib-extension",
        name: translate("Расширение Фибоначчи по тренду"),
        points: 3,
      },
      { id: "fib-channel", name: translate("Каналы Фибоначчи"), points: 3 },
      { id: "fib-time", name: translate("Периоды времени Фибоначчи"), points: 2 },
      {
        id: "fib-speed",
        name: translate("Веерные линии сопротивления Фибоначчи"),
        points: 2,
      },
      { id: "fib-trend-time", name: translate("Периоды Фибоначчи по тренду"), points: 3 },
      { id: "fib-circles", name: translate("Окружности Фибоначчи"), points: 2 },
      { id: "fib-spiral", name: translate("Спираль Фибоначчи"), points: 2 },
      { id: "fib-arcs", name: translate("Дуги сопротивления Фибоначчи"), points: 2 },
      { id: "fib-wedge", name: translate("Клин Фибоначчи"), points: 3 },
      { id: "fib-fan", name: translate("Наклонный веер"), points: 3 },
    ],
  },
  {
    id: "patterns",
    name: translate("Паттерны и волны"),
    icon: "pattern",
    tools: [
      {
        id: "xabcd",
        name: translate("Паттерн XABCD"),
        points: 5,
        labels: ["X", "A", "B", "C", "D"],
      },
      {
        id: "cypher",
        name: translate("Паттерн Cypher"),
        points: 5,
        labels: ["X", "A", "B", "C", "D"],
      },
      {
        id: "head-shoulders",
        name: translate("Голова и плечи"),
        points: 7,
        labels: ["", translate("ЛП"), "", translate("Г"), "", translate("ПП"), ""],
      },
      {
        id: "abcd",
        name: translate("Паттерн ABCD"),
        points: 4,
        labels: ["A", "B", "C", "D"],
      },
      {
        id: "pattern-triangle",
        name: translate("Паттерн треугольник"),
        points: 5,
        labels: ["A", "B", "C", "D", "E"],
      },
      {
        id: "three-drives",
        name: translate("Паттерн трёх движений"),
        points: 6,
        labels: ["0", "1", "2", "3", "4", "5"],
      },
      {
        id: "elliott-impulse",
        name: translate("Импульсная волна Эллиотта (1·2·3·4·5)"),
        points: 6,
        labels: ["0", "1", "2", "3", "4", "5"],
      },
      {
        id: "elliott-correction",
        name: translate("Коррекционная волна Эллиотта (A·B·C)"),
        points: 4,
        labels: ["0", "A", "B", "C"],
      },
      {
        id: "elliott-triangle",
        name: translate("Треугольник Эллиотта (A·B·C·D·E)"),
        points: 6,
        labels: ["0", "A", "B", "C", "D", "E"],
      },
      {
        id: "elliott-double",
        name: translate("Двойная комбинация Эллиотта (W·X·Y)"),
        points: 7,
        labels: ["0", "a", "W", "b", "X", "c", "Y"],
      },
      {
        id: "elliott-triple",
        name: translate("Тройная комбинация Эллиотта (W·X·Y·X·Z)"),
        points: 11,
        labels: ["0", "a", "W", "b", "X", "c", "Y", "d", "X", "e", "Z"],
      },
    ],
  },
  {
    id: "analysis",
    name: translate("Позиции, объём и диапазоны"),
    icon: "position",
    tools: [
      { id: "long-position", name: translate("Длинная позиция"), points: 3 },
      { id: "short-position", name: translate("Короткая позиция"), points: 3 },
      { id: "forecast", name: translate("Прогноз позиции"), points: 3 },
      { id: "bars-pattern", name: translate("Шаблон баров"), points: 3 },
      { id: "projection", name: translate("Проекция цены"), points: 3 },
      { id: "sector", name: translate("Сектор"), points: 3 },
      { id: "vwap", name: translate("VWAP с привязкой"), points: 1 },
      {
        id: "volume-range",
        name: translate("Профиль объёма: диапазон · OHLCV"),
        points: 2,
      },
      {
        id: "volume-anchor",
        name: translate("Профиль объёма с привязкой · OHLCV"),
        points: 1,
      },
      { id: "price-range", name: translate("Диапазон цены"), points: 2 },
      { id: "time-range", name: translate("Диапазон времени"), points: 2 },
      { id: "date-price-range", name: translate("Диапазон цены и времени"), points: 2 },
    ],
  },
  {
    id: "shapes",
    name: translate("Кисти, стрелки и фигуры"),
    icon: "brush",
    tools: [
      { id: "brush", name: translate("Кисть"), points: -1 },
      { id: "marker", name: translate("Маркер"), points: -1 },
      { id: "pointer-arrow", name: translate("Стрелка-указатель"), points: 2 },
      { id: "arrow", name: translate("Стрелка"), points: 2 },
      { id: "arrow-up", name: translate("Стрелка вверх"), points: 1 },
      { id: "arrow-down", name: translate("Стрелка вниз"), points: 1 },
      { id: "zone", name: translate("Прямоугольник"), points: 2 },
      { id: "rotated-rect", name: translate("Вращающийся прямоугольник"), points: 3 },
      { id: "path", name: translate("Траектория"), points: 0 },
      { id: "circle", name: translate("Окружность"), points: 2 },
      { id: "ellipse", name: translate("Эллипс"), points: 2 },
      { id: "polyline", name: translate("Ломаная линия"), points: 0 },
      { id: "triangle", name: translate("Треугольник"), points: 3 },
      { id: "arc", name: translate("Дуга"), points: 3 },
      { id: "curve", name: translate("Кривая"), points: 3 },
      { id: "double-curve", name: translate("Двойная кривая"), points: 4 },
    ],
  },
  {
    id: "text",
    name: translate("Текст и заметки"),
    icon: "text",
    tools: [
      { id: "text", name: translate("Текст"), points: 1, kind: "text" },
      { id: "note", name: translate("Заметка"), points: 1, kind: "text" },
      { id: "price-note", name: translate("Заметка цены"), points: 1, kind: "text" },
      { id: "pin", name: translate("Метка"), points: 1, kind: "text" },
      { id: "table", name: translate("Таблица"), points: 1, kind: "text" },
      { id: "callout", name: translate("Сноска"), points: 2, kind: "text" },
      { id: "comment", name: translate("Комментарий"), points: 1, kind: "text" },
      { id: "price-tag", name: translate("Метка цены"), points: 1 },
      { id: "sign", name: translate("Знак"), points: 1, kind: "text" },
      { id: "flag", name: translate("Флаг"), points: 1, kind: "text" },
    ],
  },
];
export const DRAWING_TOOLS = DRAWING_GROUPS.flatMap((group) => group.tools);
export const drawingTool = (id: string) =>
  DRAWING_TOOLS.find((tool) => tool.id === id);
export const NAVIGATION_TOOLS = ["cursor", "dot", "arrow-cursor"];
export const isDrawingType = (id: unknown): id is string =>
  typeof id === "string" &&
  !!drawingTool(id) &&
  ![...NAVIGATION_TOOLS, "demo", "select", "eraser"].includes(id);
export function drawingIcon(id: string) {
  const group = DRAWING_GROUPS.find((group) =>
    group.tools.some((tool) => tool.id === id),
  );
  const kind =
    id === "cursor" || id === "select" ? "cursor" : group?.icon || id;
  const paths: Record<string, string> = {
    cursor: '<path d="M12 2v6m0 8v6M2 12h6m8 0h6"/>',
    trend:
      '<path d="m5 19 14-14"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>',
    fib: '<path d="M3 5h18M3 10h12M3 15h18M3 20h12"/><circle cx="3" cy="5" r="1"/>',
    pattern:
      '<path d="m3 18 5-13 8 14 5-14M3 18l18-13M8 5l8 14"/><circle cx="8" cy="5" r="1.5"/><circle cx="16" cy="19" r="1.5"/>',
    position: '<path d="M3 5h18M3 12h18M3 19h18M7 3v4m10 3v4M7 17v4"/>',
    brush: '<path d="M4 17c0-6 5-1 7-5l7-9 3 3-9 7c-4 2 1 7-7 8H2z"/>',
    text: '<path d="M4 5V3h16v2M12 3v18m-4 0h8"/>',
    star: '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
    magnet:
      '<path d="M5 3v9a7 7 0 0 0 14 0V3h-5v9a2 2 0 0 1-4 0V3zM5 7h5m4 0h5"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    undo: '<path d="M3 10h11a6 6 0 0 1 0 12M3 10l6-6M3 10l6 6"/>',
    "delete-selected": '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="m9 9 6 6m0-6-6 6"/>',
    trash: '<path d="M3 6h18M9 3h6M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  };
  Object.assign(paths, {
    dot: '<circle cx="12" cy="12" r="2"/>',
    "arrow-cursor": '<path d="m5 3 14 10-7 1-3 7z"/>',
    select: '<path d="m5 3 14 10-7 1-3 7z"/><path d="m15 16 4 5"/>',
    eraser: '<path d="m3 15 10-12 8 7-9 11H9zM8 9l9 8M13 21h9"/>',
    demo: '<circle cx="12" cy="12" r="8"/><path d="m10 8 6 4-6 4z"/>',
    level: '<path d="M2 12h20"/><circle cx="12" cy="12" r="2"/>',
    ray: '<path d="M5 12h17"/><circle cx="5" cy="12" r="2"/>',
    vertical: '<path d="M12 2v20"/><circle cx="12" cy="12" r="2"/>',
    cross: '<path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="2"/>',
    "trend-ray": '<path d="m4 20 18-18"/><circle cx="7" cy="17" r="2"/>',
    extended:
      '<path d="m2 22 20-20"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="8" r="2"/>',
    "info-line": '<path d="m3 20 17-17M3 9V3h6M15 21h6v-6"/>',
    angle: '<path d="M3 20h19M3 20 20 3M11 20a8 8 0 0 0-2-6"/>',
    zone: '<rect x="4" y="4" width="16" height="16" rx="1"/><circle cx="4" cy="4" r="2"/><circle cx="20" cy="20" r="2"/>',
    "rotated-rect": '<path d="m3 12 9-9 9 9-9 9z"/>',
    circle: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="10" ry="6"/>',
    triangle: '<path d="m12 3 10 18H2z"/>',
    arc: '<path d="M3 20Q3 3 20 3"/>',
    curve: '<path d="M2 20C4 0 20 24 22 3"/>',
    "double-curve": '<path d="M2 18C4-5 10 27 14 10S20 0 22 9"/>',
    path: '<path d="m2 19 7-14 7 12 6-8m-5 1 5-1-1 5"/>',
    polyline: '<path d="m2 19 7-14 7 12 6-8"/>',
    arrow: '<path d="m3 21 18-18M12 3h9v9"/>',
    "pointer-arrow": '<path d="m3 21 9-16 1 6 6 1z"/>',
    "arrow-up": '<path d="M9 21V10H4l8-8 8 8h-5v11z"/>',
    "arrow-down": '<path d="M9 3v11H4l8 8 8-8h-5V3z"/>',
    marker: '<path d="m5 14 9-11 7 6-10 10zM5 14l-3 7 9-2M3 23h18"/>',
    "fib-time": '<path d="M3 3v18M7 3v18M13 3v18M21 3v18"/>',
    "fib-circles":
      '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10"/>',
    "fib-arcs":
      '<path d="M2 21a19 19 0 0 1 19-19M7 21A14 14 0 0 1 21 7M13 21a8 8 0 0 1 8-8"/>',
    "fib-spiral":
      '<path d="M12 12c-4-4 7-8 7 0 0 11-18 10-18 0C1-3 24-3 23 13"/>',
    "fib-speed": '<path d="M3 21 9 2M3 21 16 2M3 21 22 3M3 21h19"/>',
    "fib-channel": '<path d="m2 13 20-10M2 18 22 8M2 23 22 13"/>',
    "fib-extension": '<path d="m3 20 6-15 6 9 6-12M9 5h13M15 14h7M3 20h19"/>',
    "long-position":
      '<path d="M3 5h18M3 14h18M3 20h18M7 3v19m9-11V7m-3 3 3-3 3 3"/>',
    "short-position":
      '<path d="M3 5h18M3 11h18M3 20h18M7 3v19m9-8v4m-3-3 3 3 3-3"/>',
    vwap: '<path d="M2 20c7-16 12 0 20-17M3 4v17"/><circle cx="3" cy="18" r="2"/>',
    "volume-range":
      '<path d="M3 3v18M21 3v18M3 6h7v3H3m0 2h14v3H3m0 2h9v3H3"/>',
    "volume-anchor":
      '<path d="M3 3v18M3 6h7v3H3m0 2h14v3H3m0 2h9v3H3"/><circle cx="3" cy="3" r="2"/>',
    "price-range":
      '<path d="M12 3v18M7 3h10M7 21h10m-8-6 3 6 3-6m-6-6 3-6 3 6"/>',
    "time-range":
      '<path d="M3 12h18M3 7v10M21 7v10m-6-8 6 3-6 3M9 9l-6 3 6 3"/>',
    "date-price-range":
      '<rect x="4" y="4" width="16" height="16"/><path d="M8 16 16 8m-5 0h5v5"/>',
    forecast: '<path d="m2 19 7-7 5 3 8-12m-6 0h6v6"/>',
    projection: '<path d="m2 20 6-12 6 8 8-14m-5 1 5-1v5M8 8h10"/>',
    "bars-pattern": '<path d="M4 9v12m-3-8h6M12 3v16m-3-9h6m5-7v12m-3-7h6"/>',
    sector: '<path d="M3 21V3a18 18 0 0 1 18 18z"/>',
    note: '<path d="M3 3h18v14H9l-6 5zM7 7h10M7 11h7"/>',
    "price-note": '<path d="M3 3h18v14H9l-6 5zM15 7h-5v3h5v3h-5m2-8v10"/>',
    pin: '<path d="M12 22s8-10 8-15A8 8 0 0 0 4 7c0 5 8 15 8 15z"/><circle cx="12" cy="8" r="3"/>',
    table:
      '<rect x="2" y="3" width="20" height="18"/><path d="M2 9h20M2 15h20M9 3v18"/>',
    callout: '<path d="M2 3h20v14H9l-7 5z"/>',
    comment: '<path d="M3 20V9a7 7 0 0 1 7-7h5a7 7 0 0 1 0 14H8z"/>',
    "price-tag": '<path d="M3 17V3h18v14H3l-2 5"/><path d="M7 7h10M7 11h7"/>',
    sign: '<circle cx="12" cy="10" r="8"/><path d="M12 18v5m0-19 2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z"/>',
    flag: '<path d="M4 23V2h17l-5 6 5 6H4"/>',
  });
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[id] || paths[kind] || paths.trend}</svg>`;
}

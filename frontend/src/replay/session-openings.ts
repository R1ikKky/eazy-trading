import type { Bar } from "./types";
import type { Replay } from "./engine";

export const SESSION_OPENINGS = [
  {
    id: "asia",
    name: "Азия",
    clock: "09:00 · Tokyo",
    zone: "Asia/Tokyo",
    hour: 9,
    minute: 0,
  },
  {
    id: "london",
    name: "Лондон",
    clock: "08:00 · London",
    zone: "Europe/London",
    hour: 8,
    minute: 0,
  },
  {
    id: "new-york",
    name: "Нью-Йорк",
    clock: "09:30 · New York",
    zone: "America/New_York",
    hour: 9,
    minute: 30,
  },
] as const;
export type SessionOpening = (typeof SESSION_OPENINGS)[number];
const clocks = new Map<string, Intl.DateTimeFormat>();

/** Only real, future opening candles qualify. Gaps and weekends are skipped. */
export function nextSessionOpening(
  bars: Bar[],
  index: number,
  session: SessionOpening,
): number {
  let clock = clocks.get(session.zone);
  if (!clock) {
    clock = new Intl.DateTimeFormat("en-US", {
      timeZone: session.zone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    clocks.set(session.zone, clock);
  }
  for (let i = index + 1; i < bars.length; i++) {
    // All three zones have whole-hour UTC offsets, including daylight saving.
    if (bars[i].time % 3600 !== session.minute * 60) continue;
    const parts = clock.formatToParts(new Date(bars[i].time * 1000));
    const value = (type: string) =>
      parts.find((part) => part.type === type)?.value;
    if (["Sat", "Sun"].includes(value("weekday") || "")) continue;
    if (
      Number(value("hour")) === session.hour &&
      Number(value("minute")) === session.minute
    )
      return i;
  }
  return -1;
}

/** Preserve fills, protection, fees, and contract rolls across every skipped bar. */
export function advanceReplayToOpening(replay: Replay, target: number) {
  if (
    !Number.isInteger(target) ||
    target <= replay.index ||
    target >= replay.bars.length
  )
    throw Error("Invalid replay destination");
  while (replay.index < target) replay.step();
}

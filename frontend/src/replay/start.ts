let startup: Promise<void> | undefined;
/** A single terminal per document; Strict Mode must not duplicate its listeners. */
export function startReplay(): Promise<void> {
  return (startup ??= (async () => {
    const { migrateLegacyStorage } = await import("./legacy-brand");
    migrateLegacyStorage();
    const { initializeLanguage } = await import("../i18n/language");
    initializeLanguage();
    const charts = await import("lightweight-charts");
    Object.assign(window, { LightweightCharts: charts });
    await import("./theme");
    await import("./app");
    const { installDropdowns } = await import("./dropdowns");
    installDropdowns();
    const { installReplayIsland } = await import("./replay-island");
    installReplayIsland();
  })());
}

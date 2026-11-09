/** Compatibility with data written before the eazy trading rename. */
const legacyStoragePrefix = "replay-lab-";
const storagePrefix = "eazy-trading-";
const migrationKey = storagePrefix + "storage-migrated-v1";
const legacyFormats = {
    drawing: "replayLabDrawing",
    chartSettings: "replayLabChartSettings",
    backup: "replayLabBackup",
};
const formats = {
    drawing: "eazyTradingDrawing",
    chartSettings: "eazyTradingChartSettings",
    backup: "eazyTradingBackup",
};
export function isCompatibleExport(value, kind) {
    return value?.[formats[kind]] === 1 || value?.[legacyFormats[kind]] === 1;
}
/** Copy without overwriting current preferences or deleting the original data. */
export function migrateLegacyStorage(storage) {
    try {
        storage ||= globalThis.localStorage;
        if (!storage || storage.getItem(migrationKey) === "1")
            return;
        const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key) => !!key);
        for (const key of keys) {
            if (!key.startsWith(legacyStoragePrefix))
                continue;
            const next = storagePrefix + key.slice(legacyStoragePrefix.length);
            if (storage.getItem(next) === null) {
                const value = storage.getItem(key);
                if (value !== null)
                    storage.setItem(next, value);
            }
        }
        storage.setItem(migrationKey, "1");
    }
    catch {
        /* Keep the original data available if browser storage is full or blocked. */
    }
}
/** Opening without a version avoids upgrading an old cache; abort if it does not exist. */
export function openLegacyHistoryDB() {
    if (!globalThis.indexedDB)
        return Promise.resolve(null);
    return new Promise((resolve) => {
        const request = indexedDB.open("replay-lab-history");
        request.onupgradeneeded = () => request.transaction?.abort();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
}

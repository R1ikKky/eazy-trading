export {};
declare global {
  interface Window {
    LightweightCharts: typeof import("lightweight-charts");
  }
  interface Document {
    modelContext?: {
      registerTool(
        tool: unknown,
        options: { signal: AbortSignal },
      ): void | Promise<void>;
    };
  }
}

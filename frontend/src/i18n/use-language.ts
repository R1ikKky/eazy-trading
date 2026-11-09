"use client";
import { useSyncExternalStore } from "react";
import { currentLanguage, subscribeLanguage } from "./language";
export function useLanguage() {
  return useSyncExternalStore(
    subscribeLanguage,
    currentLanguage,
    () => "en" as const,
  );
}

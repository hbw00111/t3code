import { ClientSettingsSchema, type ClientSettings } from "@t3tools/contracts";

import { getLocalStorageItem, setLocalStorageItem } from "./hooks/useLocalStorage";

export const CLIENT_SETTINGS_STORAGE_KEY = "t3code:client-settings:v1";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

export function readBrowserClientSettings(): ClientSettings | null {
  if (!hasWindow()) {
    return null;
  }

  try {
    return getLocalStorageItem(CLIENT_SETTINGS_STORAGE_KEY, ClientSettingsSchema);
  } catch (error) {
    console.error("Could not read persisted client settings.", error);
    return null;
  }
}

export function writeBrowserClientSettings(settings: ClientSettings): void {
  if (!hasWindow()) {
    return;
  }

  setLocalStorageItem(CLIENT_SETTINGS_STORAGE_KEY, settings, ClientSettingsSchema);
}

export function subscribeBrowserClientSettings(
  listener: (settings: ClientSettings | null) => void,
): () => void {
  if (!hasWindow() || window.desktopBridge !== undefined) {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key !== CLIENT_SETTINGS_STORAGE_KEY ||
      (event.storageArea !== null && event.storageArea !== window.localStorage)
    ) {
      return;
    }
    listener(readBrowserClientSettings());
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

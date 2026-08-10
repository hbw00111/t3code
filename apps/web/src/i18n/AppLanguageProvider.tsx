import type { ReactNode } from "react";
import { useLayoutEffect } from "react";
import { I18nextProvider } from "react-i18next";
import type { UiLanguage } from "@t3tools/contracts/settings";

import { useClientSettings, useClientSettingsHydrated } from "../hooks/useSettings";
import { i18n } from "./i18n";

export function applyDocumentLanguage(
  language: UiLanguage,
  root: Pick<HTMLElement, "lang"> = document.documentElement,
) {
  root.lang = language;
}

export async function applyAppLanguage(
  language: UiLanguage,
  root: Pick<HTMLElement, "lang"> = document.documentElement,
) {
  applyDocumentLanguage(language, root);
  if (i18n.resolvedLanguage !== language) {
    await i18n.changeLanguage(language);
  }
}

export function AppLanguageProvider({ children }: { readonly children: ReactNode }) {
  const language = useClientSettings((settings) => settings.uiLanguage);
  const settingsHydrated = useClientSettingsHydrated();

  useLayoutEffect(() => {
    void applyAppLanguage(language);
  }, [language]);

  if (!settingsHydrated) return null;

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

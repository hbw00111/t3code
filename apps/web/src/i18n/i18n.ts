import { createInstance, type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";

import { resources } from "./resources";

export const i18n: I18nInstance = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  initAsync: false,
  returnNull: false,
});

import { describe, expect, it } from "vite-plus/test";

import { applyAppLanguage, applyDocumentLanguage } from "./AppLanguageProvider";
import { i18n } from "./i18n";

describe("applyDocumentLanguage", () => {
  it("keeps the document language in sync with client settings", () => {
    const root = { lang: "en" };

    applyDocumentLanguage("zh-CN", root);

    expect(root.lang).toBe("zh-CN");
  });

  it("switches the translation engine together with the document", async () => {
    const root = { lang: "en" };

    await applyAppLanguage("zh-CN", root);

    expect(root.lang).toBe("zh-CN");
    expect(i18n.resolvedLanguage).toBe("zh-CN");
    expect(i18n.t("common.settings")).toBe("设置");

    await applyAppLanguage("en", root);
  });
});

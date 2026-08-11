import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const persistence = vi.hoisted(() => ({
  getClientSettings: vi.fn(),
  setClientSettings: vi.fn(),
}));

vi.mock("~/localApi", () => ({
  ensureLocalApi: () => ({ persistence }),
}));

import {
  __persistClientSettingsForTests,
  __resetClientSettingsPersistenceForTests,
  __setClientSettingsForTests,
  getClientSettings,
  mergeEnvironmentSettings,
  resolveEnvironmentIdentificationMode,
} from "./useSettings";

beforeEach(() => {
  __resetClientSettingsPersistenceForTests();
  persistence.getClientSettings.mockReset();
  persistence.setClientSettings.mockReset();
});

describe("resolveEnvironmentIdentificationMode", () => {
  it("keeps identification hidden until client settings hydrate", () => {
    expect(resolveEnvironmentIdentificationMode({ mode: "artwork", settingsHydrated: false })).toBe(
      "none",
    );
    expect(resolveEnvironmentIdentificationMode({ mode: "pill", settingsHydrated: true })).toBe(
      "pill",
    );
  });

  it("uses a pill instead of artwork with a palette theme", () => {
    expect(
      resolveEnvironmentIdentificationMode({
        mode: "artwork",
        settingsHydrated: true,
        paletteThemeActive: true,
      }),
    ).toBe("pill");
  });

  it("respects none with a palette theme", () => {
    expect(
      resolveEnvironmentIdentificationMode({
        mode: "none",
        settingsHydrated: true,
        paletteThemeActive: true,
      }),
    ).toBe("none");
  });

  it("keeps artwork when the palette theme opts into it", () => {
    expect(
      resolveEnvironmentIdentificationMode({
        mode: "artwork",
        settingsHydrated: true,
        paletteThemeActive: true,
        paletteThemeAllowsArtwork: true,
      }),
    ).toBe("artwork");
  });
});

describe("mergeEnvironmentSettings", () => {
  it("combines the selected environment's server settings with client preferences", () => {
    const serverSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [ProviderInstanceId.make("codex_remote")]: {
          driver: ProviderDriverKind.make("codex"),
          enabled: true,
        },
      },
    };
    const clientSettings = {
      ...DEFAULT_CLIENT_SETTINGS,
      favorites: [
        {
          provider: ProviderInstanceId.make("codex_remote"),
          model: "gpt-5.4",
        },
      ],
    };

    const settings = mergeEnvironmentSettings(serverSettings, clientSettings);

    expect(settings.providerInstances).toBe(serverSettings.providerInstances);
    expect(settings.favorites).toBe(clientSettings.favorites);
  });
});

describe("client settings persistence", () => {
  it("rolls an optimistic language switch back when persistence fails", async () => {
    const initialSettings = { ...DEFAULT_CLIENT_SETTINGS, uiLanguage: "en" as const };
    const chineseSettings = { ...initialSettings, uiLanguage: "zh-CN" as const };
    __setClientSettingsForTests(initialSettings);
    persistence.setClientSettings.mockRejectedValueOnce(new Error("disk full"));

    await __persistClientSettingsForTests(chineseSettings);

    expect(getClientSettings()).toBe(initialSettings);
  });

  it("keeps the newest successful write after an earlier queued write fails", async () => {
    const initialSettings = { ...DEFAULT_CLIENT_SETTINGS, uiLanguage: "en" as const };
    const failedSettings = { ...initialSettings, uiLanguage: "zh-CN" as const };
    const successfulSettings = { ...failedSettings, timestampFormat: "24-hour" as const };
    __setClientSettingsForTests(initialSettings);
    persistence.setClientSettings
      .mockRejectedValueOnce(new Error("first write failed"))
      .mockResolvedValueOnce(undefined);

    void __persistClientSettingsForTests(failedSettings);
    await __persistClientSettingsForTests(successfulSettings);

    expect(getClientSettings()).toBe(successfulSettings);
    expect(persistence.setClientSettings).toHaveBeenNthCalledWith(1, failedSettings);
    expect(persistence.setClientSettings).toHaveBeenNthCalledWith(2, successfulSettings);
  });
});

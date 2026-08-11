import type { TFunction } from "i18next";

import { i18n } from "../../i18n/i18n";

export type SettingsPath =
  | "/settings/general"
  | "/settings/appearance"
  | "/settings/keybindings"
  | "/settings/providers"
  | "/settings/source-control"
  | "/settings/connections"
  | "/settings/archived";

export interface SettingsSearchItem {
  readonly id: string;
  readonly title: string;
  readonly to: SettingsPath;
  readonly targetId?: string;
}

const SETTINGS_SECTION_LABEL_KEYS: Readonly<Record<SettingsPath, string>> = {
  "/settings/general": "settings.sections.general",
  "/settings/appearance": "settings.sections.appearance",
  "/settings/keybindings": "settings.sections.keybindings",
  "/settings/providers": "settings.sections.providers",
  "/settings/source-control": "settings.sections.sourceControl",
  "/settings/connections": "settings.sections.connections",
  "/settings/archived": "settings.sections.archive",
};

export function getSettingsSectionLabels(
  t: TFunction = i18n.t.bind(i18n),
): Readonly<Record<SettingsPath, string>> {
  return Object.fromEntries(
    Object.entries(SETTINGS_SECTION_LABEL_KEYS).map(([path, key]) => [path, t(key)]),
  ) as Readonly<Record<SettingsPath, string>>;
}

const SETTINGS_SEARCH_DEFINITIONS = [
  {
    id: "color-scheme",
    titleKey: "settings.items.colorScheme",
    to: "/settings/appearance",
    targetId: "appearance",
  },
  {
    id: "theme",
    titleKey: "settings.items.theme",
    to: "/settings/appearance",
    targetId: "appearance",
  },
  {
    id: "setting-glass-opacity",
    titleKey: "settings.items.glassOpacity",
    to: "/settings/appearance",
  },
  {
    id: "environment-identification",
    titleKey: "settings.items.environmentIdentification",
    to: "/settings/appearance",
    targetId: "appearance",
  },
  {
    id: "interface-font",
    titleKey: "settings.items.interfaceFont",
    to: "/settings/appearance",
  },
  {
    id: "prompt-font",
    titleKey: "settings.items.promptFont",
    to: "/settings/appearance",
  },
  {
    id: "code-font",
    titleKey: "settings.items.codeFont",
    to: "/settings/appearance",
  },
  {
    id: "terminal-font",
    titleKey: "settings.items.terminalFont",
    to: "/settings/appearance",
  },
  {
    id: "font-smoothing",
    titleKey: "settings.items.fontSmoothing",
    to: "/settings/appearance",
  },
  {
    id: "word-wrap",
    titleKey: "settings.items.wordWrap",
    to: "/settings/appearance",
  },
  {
    id: "project-grouping",
    titleKey: "settings.items.projectGrouping",
    to: "/settings/general",
  },
  {
    id: "auto-settle-inactive-threads",
    titleKey: "settings.items.autoSettleInactiveThreads",
    to: "/settings/general",
  },
  {
    id: "language",
    titleKey: "settings.items.language",
    to: "/settings/general",
  },
  {
    id: "time-format",
    titleKey: "settings.items.timeFormat",
    to: "/settings/general",
  },
  {
    id: "hide-whitespace-changes",
    titleKey: "settings.items.hideWhitespaceChanges",
    to: "/settings/general",
  },
  {
    id: "provider-update-checks",
    titleKey: "settings.items.providerUpdateChecks",
    to: "/settings/general",
  },
  {
    id: "new-threads",
    titleKey: "settings.items.newThreads",
    to: "/settings/general",
  },
  {
    id: "start-from-origin",
    titleKey: "settings.items.startFromOrigin",
    to: "/settings/general",
    targetId: "new-threads",
  },
  {
    id: "add-project-starts-in",
    titleKey: "settings.items.addProjectStartsIn",
    to: "/settings/general",
  },
  {
    id: "archive-confirmation",
    titleKey: "settings.items.archiveConfirmation",
    to: "/settings/general",
  },
  {
    id: "delete-confirmation",
    titleKey: "settings.items.deleteConfirmation",
    to: "/settings/general",
  },
  {
    id: "text-generation-model",
    titleKey: "settings.items.textGenerationModel",
    to: "/settings/general",
  },
  {
    id: "diagnostics",
    titleKey: "settings.items.diagnostics",
    to: "/settings/general",
  },
  {
    id: "legacy-plan-mode",
    titleKey: "settings.items.legacyPlanMode",
    to: "/settings/general",
  },
  {
    id: "legacy-token-streaming",
    titleKey: "settings.items.legacyTokenStreaming",
    to: "/settings/general",
  },
  {
    id: "legacy-sidebar",
    titleKey: "settings.items.legacySidebar",
    to: "/settings/general",
  },
  {
    id: "keybindings",
    titleKey: "settings.items.keybindings",
    to: "/settings/keybindings",
  },
  {
    id: "providers",
    titleKey: "settings.items.providers",
    to: "/settings/providers",
  },
  {
    id: "source-control",
    titleKey: "settings.items.sourceControl",
    to: "/settings/source-control",
  },
  {
    id: "remote-environments",
    titleKey: "settings.items.remoteEnvironments",
    to: "/settings/connections",
  },
  {
    id: "archive",
    titleKey: "settings.items.archivedThreads",
    to: "/settings/archived",
  },
] as const;

export type SettingsSearchItemId = (typeof SETTINGS_SEARCH_DEFINITIONS)[number]["id"];

export function getSettingsSearchItems(
  t: TFunction = i18n.t.bind(i18n),
): ReadonlyArray<SettingsSearchItem> {
  return SETTINGS_SEARCH_DEFINITIONS.map(({ titleKey, ...item }) => ({
    ...item,
    title: t(titleKey),
  }));
}

const englishT = i18n.getFixedT("en");
export const SETTINGS_SECTION_LABELS = getSettingsSectionLabels(englishT);
export const SETTINGS_SEARCH_ITEMS = getSettingsSearchItems(englishT);

const SEARCH_DEFINITIONS_BY_ID = Object.fromEntries(
  SETTINGS_SEARCH_DEFINITIONS.map((item) => [item.id, item]),
) as Readonly<Record<SettingsSearchItemId, (typeof SETTINGS_SEARCH_DEFINITIONS)[number]>>;

export function searchableSetting(
  id: SettingsSearchItemId,
  t: TFunction,
): {
  readonly id: string;
  readonly title: string;
} {
  const { id: anchorId, titleKey } = SEARCH_DEFINITIONS_BY_ID[id];
  return { id: anchorId, title: t(titleKey) };
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function searchSettings(
  query: string,
  items: ReadonlyArray<SettingsSearchItem> = getSettingsSearchItems(),
): ReadonlyArray<SettingsSearchItem> {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return [];

  return items.filter((item) => normalizeSearchText(item.title).includes(normalizedQuery));
}

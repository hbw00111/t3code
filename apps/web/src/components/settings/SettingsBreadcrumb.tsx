import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
} from "../WorkspaceBreadcrumb";
import { useTranslation } from "react-i18next";
import { getSettingsSectionLabels } from "./settingsSearch";

function settingsBreadcrumbLabel(
  pathname: string,
  labels: Readonly<Record<string, string>>,
): string | null {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  return labels[normalizedPathname] ?? null;
}

export function SettingsBreadcrumb({ pathname }: { pathname: string }) {
  const { t } = useTranslation();
  const sectionLabel = settingsBreadcrumbLabel(pathname, {
    ...getSettingsSectionLabels(t),
    "/settings/diagnostics": t("settings.sections.diagnostics"),
  });

  return (
    <WorkspaceBreadcrumb ariaLabel={t("settings.breadcrumb")}>
      {sectionLabel ? (
        <>
          <WorkspaceBreadcrumbItem>{t("common.settings")}</WorkspaceBreadcrumbItem>
          <WorkspaceBreadcrumbSeparator />
        </>
      ) : null}
      <WorkspaceBreadcrumbItem current className="truncate">
        {sectionLabel ?? t("common.settings")}
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}

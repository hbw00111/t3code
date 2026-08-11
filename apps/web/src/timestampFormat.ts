import { type TimestampFormat } from "@t3tools/contracts/settings";
import { i18n } from "./i18n/i18n";

function currentLanguage(): string {
  return i18n.resolvedLanguage ?? i18n.language ?? "en";
}

function formatTimeUnit(unit: "second" | "minute" | "hour" | "day", count: number): string {
  return i18n.t(`time.units.${unit}`, { count });
}

export function getTimestampFormatOptions(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormatOptions {
  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  };

  if (timestampFormat === "locale") {
    return baseOptions;
  }

  return {
    ...baseOptions,
    hour12: timestampFormat === "12-hour",
  };
}

const timestampFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTimestampFormatter(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormat {
  const language = currentLanguage();
  const cacheKey = `${language}:${timestampFormat}:${includeSeconds ? "seconds" : "minutes"}`;
  const cachedFormatter = timestampFormatterCache.get(cacheKey);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat(
    language,
    getTimestampFormatOptions(timestampFormat, includeSeconds),
  );
  timestampFormatterCache.set(cacheKey, formatter);
  return formatter;
}

export function parseTimestampDate(isoDate: string): Date | null {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  return getTimestampFormatter(timestampFormat, true).format(date);
}

const monthNameFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getMonthNameFormatter(): Intl.DateTimeFormat {
  const language = currentLanguage();
  const cachedFormatter = monthNameFormatterCache.get(language);
  if (cachedFormatter) return cachedFormatter;
  const formatter = new Intl.DateTimeFormat(language, { month: "long" });
  monthNameFormatterCache.set(language, formatter);
  return formatter;
}

function ordinalSuffix(day: number): string {
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 * Long-form tooltip label, e.g. `12:04, 4th June`.
 * Renders the wall-clock time without seconds followed by the ordinal day and month name.
 */
export function formatChatTimestampTooltip(
  isoDate: string,
  timestampFormat: TimestampFormat,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = formatShortTimestamp(isoDate, timestampFormat);
  const day = date.getDate();
  const month = getMonthNameFormatter().format(date);
  const year = date.getFullYear();
  return i18n.t("time.chatTimestampTooltip", {
    time,
    day: currentLanguage() === "en" ? `${day}${ordinalSuffix(day)}` : String(day),
    month,
    year,
  });
}

export function formatShortTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  return getTimestampFormatter(timestampFormat, false).format(date);
}

/**
 * Format a relative time string from an ISO date.
 * Returns `{ value: "20s", suffix: "ago" }` or `{ value: "just now", suffix: null }`
 * so callers can style the numeric portion independently.
 */
type RelativeTimeParts = { value: string; suffix: string | null };
export type RelativeTimeState =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "relative"; value: string; suffix: string | null };

export function formatRelativeTime(isoDate: string): RelativeTimeParts | null {
  const date = parseTimestampDate(isoDate);
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return { value: i18n.t("time.justNow"), suffix: null };
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return { value: i18n.t("time.justNow"), suffix: null };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return { value: formatTimeUnit("minute", minutes), suffix: i18n.t("time.ago") };
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return { value: formatTimeUnit("hour", hours), suffix: i18n.t("time.ago") };
  }
  const days = Math.floor(hours / 24);
  return { value: formatTimeUnit("day", days), suffix: i18n.t("time.ago") };
}

export function formatRelativeTimeLabel(isoDate: string) {
  const relative = formatRelativeTime(isoDate);
  if (!relative) return "";
  return relative.suffix ? i18n.t("time.agoLabel", { value: relative.value }) : relative.value;
}

export function getRelativeTimeState(isoDate: string | null): RelativeTimeState {
  if (!isoDate) return { status: "missing" };
  const relative = formatRelativeTime(isoDate);
  if (!relative) return { status: "invalid" };
  return { status: "relative", ...relative };
}

/**
 * Relative elapsed duration since an ISO instant, without an "ago" suffix.
 * Useful for labels like "Connected for 3m".
 */
export function formatElapsedDurationLabel(isoDate: string, nowMs: number = Date.now()): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const diffMs = nowMs - date.getTime();
  if (diffMs <= 0) return i18n.t("time.justNow");

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return i18n.t("time.justNow");
  if (seconds < 60) return formatTimeUnit("second", seconds);

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return formatTimeUnit("minute", minutes);

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatTimeUnit("hour", hours);

  const days = Math.floor(hours / 24);
  return formatTimeUnit("day", days);
}

/**
 * Relative time until an ISO instant (e.g. expiry). Mirrors {@link formatRelativeTime} but for future times.
 */
export function formatRelativeTimeUntil(isoDate: string): RelativeTimeParts | null {
  const date = parseTimestampDate(isoDate);
  if (!date) return null;
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return { value: i18n.t("time.expired"), suffix: null };
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return { value: i18n.t("time.soon"), suffix: null };
  if (seconds < 60) {
    return { value: formatTimeUnit("second", seconds), suffix: i18n.t("time.left") };
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return { value: formatTimeUnit("minute", minutes), suffix: i18n.t("time.left") };
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return { value: formatTimeUnit("hour", hours), suffix: i18n.t("time.left") };
  }
  const days = Math.floor(hours / 24);
  return { value: formatTimeUnit("day", days), suffix: i18n.t("time.left") };
}

export function formatRelativeTimeUntilLabel(isoDate: string): string {
  const relative = formatRelativeTimeUntil(isoDate);
  if (!relative) return "";
  return relative.suffix ? i18n.t("time.leftLabel", { value: relative.value }) : relative.value;
}

/**
 * Countdown for a future instant (e.g. link expiry): "Expires in 4m 12s", with second precision under one hour.
 * Pass `nowMs` when a parent tick drives re-renders so the diff matches that snapshot.
 */
export function formatExpiresInLabel(isoDate: string, nowMs: number = Date.now()): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const diffMs = date.getTime() - nowMs;
  if (diffMs <= 0) return i18n.t("time.expired");

  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 5) return i18n.t("time.expiresInMoment");
  if (totalSeconds < 60) {
    return i18n.t("time.expiresIn", { value: formatTimeUnit("second", totalSeconds) });
  }

  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const value = [formatTimeUnit("minute", minutes)];
    if (seconds > 0) value.push(formatTimeUnit("second", seconds));
    return i18n.t("time.expiresIn", { value: value.join(" ") });
  }

  if (totalSeconds < 86_400) {
    const hours = Math.floor(totalSeconds / 3600);
    const rem = totalSeconds % 3600;
    const minutes = Math.floor(rem / 60);
    const seconds = rem % 60;
    const parts = [formatTimeUnit("hour", hours)];
    if (minutes > 0) parts.push(formatTimeUnit("minute", minutes));
    if (seconds > 0) parts.push(formatTimeUnit("second", seconds));
    return i18n.t("time.expiresIn", { value: parts.join(" ") });
  }

  const days = Math.floor(totalSeconds / 86_400);
  const remAfterDays = totalSeconds % 86_400;
  if (remAfterDays === 0) {
    return i18n.t("time.expiresIn", { value: formatTimeUnit("day", days) });
  }
  const hours = Math.floor(remAfterDays / 3600);
  const rem = remAfterDays % 3600;
  const minutes = Math.floor(rem / 60);
  const seconds = rem % 60;
  const tail: string[] = [];
  if (hours > 0) tail.push(formatTimeUnit("hour", hours));
  if (minutes > 0) tail.push(formatTimeUnit("minute", minutes));
  if (seconds > 0) tail.push(formatTimeUnit("second", seconds));
  const value = [formatTimeUnit("day", days), ...tail].join(" ");
  return i18n.t("time.expiresIn", { value });
}

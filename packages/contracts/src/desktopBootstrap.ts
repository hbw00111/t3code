import * as Schema from "effect/Schema";

import { PortSchema, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const DESKTOP_SERVICE_BUNDLED_RUNTIME_ENV = "T3_DESKTOP_SERVICE_BUNDLED_RUNTIME";

const BackendBootstrapFields = {
  noBrowser: Schema.Boolean,
  // Omitted when the desktop launches the backend inside WSL, since the
  // Windows-side baseDir maps to /mnt/c/... and the Linux side should use its
  // own home directory instead.
  t3Home: Schema.optional(Schema.String),
  host: Schema.String,
  desktopBootstrapToken: Schema.String,
  tailscaleServeEnabled: Schema.Boolean,
  tailscaleServePort: PortSchema,
  otlpTracesUrl: Schema.optional(Schema.String),
  otlpMetricsUrl: Schema.optional(Schema.String),
  desktopTelemetryFd: Schema.optionalKey(PositiveInt),
  desktopTelemetryControlFd: Schema.optionalKey(PositiveInt),
  resourceMonitorPath: Schema.optionalKey(TrimmedNonEmptyString),
} as const;

export const DesktopBackendBootstrap = Schema.Struct({
  ...BackendBootstrapFields,
  mode: Schema.Literal("desktop"),
  port: PortSchema,
});

export const ServiceBackendBootstrap = Schema.Struct({
  ...BackendBootstrapFields,
  mode: Schema.Literal("web"),
  port: Schema.optionalKey(PortSchema),
  serviceManaged: Schema.Literal(true),
});

export type DesktopBackendBootstrap = typeof DesktopBackendBootstrap.Type;
export type ServiceBackendBootstrap = typeof ServiceBackendBootstrap.Type;

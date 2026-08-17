import type { SelfHostedTunnelSettings } from "@t3tools/contracts";

import { normalizeHttpBaseUrl } from "./advertisedEndpoint.ts";

export interface ValidatedSelfHostedTunnelSettings extends SelfHostedTunnelSettings {
  readonly enabled: true;
  readonly publicBaseUrl: string;
}

export function validateSelfHostedTunnelSettings(
  settings: SelfHostedTunnelSettings,
): ValidatedSelfHostedTunnelSettings {
  if (!settings.enabled) {
    throw new Error("The self-hosted tunnel is disabled.");
  }
  if (!/^[^\s-][^\s]*$/u.test(settings.sshHost)) {
    throw new Error("SSH host is required and must not contain whitespace.");
  }
  if (settings.sshUser.length > 0 && !/^[A-Za-z0-9._-]+$/u.test(settings.sshUser)) {
    throw new Error("SSH user contains unsupported characters.");
  }
  if (!/^[^\s]+$/u.test(settings.remoteBindHost)) {
    throw new Error("Remote bind host is required and must not contain whitespace.");
  }
  const publicBaseUrl = normalizeHttpBaseUrl(settings.publicBaseUrl);
  return { ...settings, enabled: true, publicBaseUrl };
}

import type {
  AdvertisedEndpoint,
  DesktopBridge,
  DesktopWslState,
  SelfHostedTunnelSettings,
  SelfHostedTunnelStatus,
} from "@t3tools/contracts";
import { createAdvertisedEndpoint } from "@t3tools/shared/advertisedEndpoint";
import { validateSelfHostedTunnelSettings } from "@t3tools/shared/selfHostedTunnel";

type WslEnableBridge = Pick<DesktopBridge, "setWslBackendEnabled" | "setWslDistro" | "setWslOnly">;

/**
 * A QR code encoding a loopback URL makes the scanning device dial itself, so
 * loopback endpoints stay copyable from the endpoint menu but are never
 * offered as QR targets.
 */
export function isQrShareableEndpoint(endpoint: AdvertisedEndpoint): boolean {
  return endpoint.status !== "unavailable" && endpoint.reachability !== "loopback";
}

export type QrEndpointOption = {
  /** Unique per endpoint instance (AdvertisedEndpoint.id); safe as a React key. */
  readonly id: string;
  /**
   * Stable per endpoint *type* (endpointDefaultPreferenceKey). Multiple
   * endpoints can share one, so it is only used to match the saved default.
   */
  readonly preferenceKey: string;
  /** False for endpoints that stay copyable but must never render as a QR. */
  readonly qrShareable: boolean;
};

/**
 * Resolves which endpoint the share panel shows: the user's explicit pick,
 * else the saved default endpoint, else the first QR-shareable option (so the
 * panel never opens on a loopback QR), else the first option. A stale
 * selectedId (endpoint disappeared) falls back rather than blanking the panel.
 */
export function selectQrEndpointOption<T extends QrEndpointOption>(
  options: ReadonlyArray<T>,
  selectedId: string | null,
  defaultPreferenceKey: string | null,
): T | null {
  return (
    (selectedId !== null ? options.find((option) => option.id === selectedId) : undefined) ??
    (defaultPreferenceKey !== null
      ? options.find((option) => option.preferenceKey === defaultPreferenceKey)
      : undefined) ??
    options.find((option) => option.qrShareable) ??
    options[0] ??
    null
  );
}

export async function applyWslEnableSelection(input: {
  readonly bridge: WslEnableBridge;
  readonly mode: "both" | "wsl-only";
  readonly nextDistro: string | null;
  readonly persistedDistro: string | null;
}): Promise<DesktopWslState> {
  const { bridge, mode, nextDistro, persistedDistro } = input;

  // Stage every preference before enabling. The desktop only relaunches for
  // mode/distro changes while WSL is active, so the final enable observes the
  // complete selection and is the only call that may relaunch.
  await bridge.setWslOnly(mode === "wsl-only");
  if (persistedDistro !== nextDistro) {
    await bridge.setWslDistro(nextDistro);
  }
  return await bridge.setWslBackendEnabled(true);
}

export interface SelfHostedTunnelFormValues {
  readonly sshHost: string;
  readonly sshUser: string;
  readonly sshPort: string;
  readonly identityFile: string;
  readonly remoteBindHost: string;
  readonly remotePort: string;
  readonly publicBaseUrl: string;
}

function parsePort(value: string, label: string, optional: boolean): number | null {
  const trimmed = value.trim();
  if (optional && trimmed.length === 0) return null;
  if (!/^\d+$/u.test(trimmed)) throw new Error(`${label} must be a number from 1 to 65535.`);
  const port = Number(trimmed);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be a number from 1 to 65535.`);
  }
  return port;
}

export function selfHostedTunnelFormValues(
  settings: SelfHostedTunnelSettings,
): SelfHostedTunnelFormValues {
  return {
    sshHost: settings.sshHost,
    sshUser: settings.sshUser,
    sshPort: settings.sshPort === null ? "" : String(settings.sshPort),
    identityFile: settings.identityFile,
    remoteBindHost: settings.remoteBindHost,
    remotePort: String(settings.remotePort),
    publicBaseUrl: settings.publicBaseUrl,
  };
}

export function parseSelfHostedTunnelForm(
  form: SelfHostedTunnelFormValues,
): SelfHostedTunnelSettings {
  const remotePort = parsePort(form.remotePort, "Remote port", false);
  if (remotePort === null) throw new Error("Remote port is required.");
  return validateSelfHostedTunnelSettings({
    enabled: true,
    sshHost: form.sshHost.trim(),
    sshUser: form.sshUser.trim(),
    sshPort: parsePort(form.sshPort, "SSH port", true),
    identityFile: form.identityFile.trim(),
    remoteBindHost: form.remoteBindHost.trim() || "127.0.0.1",
    remotePort,
    publicBaseUrl: form.publicBaseUrl.trim(),
  });
}

export function createSelfHostedTunnelAdvertisedEndpoint(
  settings: SelfHostedTunnelSettings,
  status: SelfHostedTunnelStatus | undefined,
): AdvertisedEndpoint | null {
  if (status?.state !== "connected") return null;
  try {
    const validated = validateSelfHostedTunnelSettings(settings);
    return createAdvertisedEndpoint({
      id: `self-hosted-ssh:${validated.publicBaseUrl}`,
      label: "Self-hosted tunnel",
      provider: {
        id: "self-hosted-ssh",
        label: "Self-hosted SSH",
        kind: "tunnel",
        isAddon: false,
      },
      httpBaseUrl: validated.publicBaseUrl,
      reachability: "public",
      hostedHttpsCompatibility:
        new URL(validated.publicBaseUrl).protocol === "https:"
          ? "compatible"
          : "mixed-content-blocked",
      source: "server",
      status: "available",
      description: "Self-hosted SSH reverse tunnel",
    });
  } catch {
    return null;
  }
}

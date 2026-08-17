import type { SelfHostedTunnelSettings, SelfHostedTunnelStatus } from "@t3tools/contracts";
import { useId, useState } from "react";

import { useUpdatePrimarySettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { ConnectionStatusDot } from "../ConnectionStatusDot";
import {
  parseSelfHostedTunnelForm,
  selfHostedTunnelFormValues,
  type SelfHostedTunnelFormValues,
} from "./ConnectionsSettings.logic";
import { SettingsRow } from "./settingsLayout";

function statusPresentation(
  settings: SelfHostedTunnelSettings,
  status: SelfHostedTunnelStatus | undefined,
) {
  switch (status?.state) {
    case "connecting":
      return {
        label: `Connecting · attempt ${status.attempt}`,
        dotClassName: "bg-warning",
        pingClassName: "bg-warning/60 duration-2000",
      };
    case "connected":
      return {
        label: settings.publicBaseUrl,
        dotClassName: "bg-success",
        pingClassName: null,
      };
    case "retrying":
      return {
        label: `Retrying in ${Math.ceil(status.retryDelayMs / 1_000)}s · ${status.message}`,
        dotClassName: "bg-warning",
        pingClassName: "bg-warning/60 duration-2000",
      };
    case "failed":
      return {
        label: status.message,
        dotClassName: "bg-destructive",
        pingClassName: null,
      };
    default:
      return {
        label: settings.enabled ? "Waiting for backend status" : "Off",
        dotClassName: "bg-muted-foreground/40",
        pingClassName: null,
      };
  }
}

export function SelfHostedTunnelSettingsRow({
  settings,
  status,
}: {
  readonly settings: SelfHostedTunnelSettings;
  readonly status: SelfHostedTunnelStatus | undefined;
}) {
  const formId = useId();
  const updateSettings = useUpdatePrimarySettings();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<SelfHostedTunnelFormValues>(() =>
    selfHostedTunnelFormValues(settings),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const presentation = statusPresentation(settings, status);

  const openEditor = () => {
    setForm(selfHostedTunnelFormValues(settings));
    setFormError(null);
    setDialogOpen(true);
  };
  const updateForm = (key: keyof SelfHostedTunnelFormValues, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError(null);
  };
  const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const next = parseSelfHostedTunnelForm(form);
      updateSettings({ selfHostedTunnel: next });
      setDialogOpen(false);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Tunnel settings are invalid.");
    }
  };
  const toggle = (enabled: boolean) => {
    if (!enabled) {
      updateSettings({ selfHostedTunnel: { enabled: false } });
      return;
    }
    try {
      parseSelfHostedTunnelForm(selfHostedTunnelFormValues({ ...settings, enabled: true }));
      updateSettings({ selfHostedTunnel: { enabled: true } });
    } catch {
      openEditor();
    }
  };

  return (
    <>
      <SettingsRow
        title="Self-hosted tunnel"
        description="Route remote connections through your SSH server."
        status={
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <ConnectionStatusDot
              tooltipText={presentation.label}
              dotClassName={presentation.dotClassName}
              pingClassName={presentation.pingClassName}
            />
            <span className="min-w-0 truncate" title={presentation.label}>
              {presentation.label}
            </span>
          </span>
        }
        control={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={openEditor}>
              Configure
            </Button>
            <Switch
              checked={settings.enabled}
              onCheckedChange={toggle}
              aria-label="Enable self-hosted tunnel"
            />
          </div>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogPopup className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Self-hosted tunnel</DialogTitle>
            <DialogDescription>SSH reverse tunnel settings for this backend.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <form id={formId} className="space-y-4" onSubmit={save}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-host`}>SSH host</Label>
                  <Input
                    id={`${formId}-host`}
                    autoFocus
                    autoComplete="off"
                    placeholder="relay.example.com"
                    value={form.sshHost}
                    onChange={(event) => updateForm("sshHost", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-user`}>SSH user</Label>
                  <Input
                    id={`${formId}-user`}
                    autoComplete="off"
                    placeholder="t3"
                    value={form.sshUser}
                    onChange={(event) => updateForm("sshUser", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-ssh-port`}>SSH port</Label>
                  <Input
                    id={`${formId}-ssh-port`}
                    inputMode="numeric"
                    placeholder="22"
                    value={form.sshPort}
                    onChange={(event) => updateForm("sshPort", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-identity`}>Identity file</Label>
                  <Input
                    id={`${formId}-identity`}
                    autoComplete="off"
                    placeholder="~/.ssh/t3-relay"
                    value={form.identityFile}
                    onChange={(event) => updateForm("identityFile", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-bind-host`}>Remote bind address</Label>
                  <Input
                    id={`${formId}-bind-host`}
                    autoComplete="off"
                    placeholder="127.0.0.1"
                    value={form.remoteBindHost}
                    onChange={(event) => updateForm("remoteBindHost", event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${formId}-remote-port`}>Remote port</Label>
                  <Input
                    id={`${formId}-remote-port`}
                    inputMode="numeric"
                    placeholder="43883"
                    value={form.remotePort}
                    onChange={(event) => updateForm("remotePort", event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-public-url`}>Public URL</Label>
                <Input
                  id={`${formId}-public-url`}
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://t3.example.com"
                  value={form.publicBaseUrl}
                  onChange={(event) => updateForm("publicBaseUrl", event.target.value)}
                />
              </div>
              {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
            </form>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" form={formId}>
              Save and connect
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

"use client";

import React, { useId, useMemo, useState } from "react";
import { AlertTriangle, MoreHorizontal } from "lucide-react";

import type { DashboardDevice } from "../../lib/devices";
import { shortDeviceId } from "../../lib/device-summary";

type RevokeResponse =
  | {
      ok: true;
      device: {
        id: string;
        revoked: true;
        revokedAt: string;
      };
    }
  | {
      ok: false;
      error?: string;
      message?: string;
    };

export type DeviceActionsProps = {
  device: DashboardDevice;
  onRevoked: (device: { id: string; revokedAt: string }) => void;
  isCurrentDevice?: boolean;
  initialMenuOpen?: boolean;
  initialDialogOpen?: boolean;
};

export function dashboardDeviceRevokeEndpoint(deviceId: string) {
  return `/api/dashboard/devices/${encodeURIComponent(deviceId)}/revoke`;
}

export function DeviceActions({
  device,
  onRevoked,
  isCurrentDevice = false,
  initialMenuOpen = false,
  initialDialogOpen = false,
}: DeviceActionsProps) {
  const menuId = useId();
  const dialogId = useId();
  const [menuOpen, setMenuOpen] = useState(initialMenuOpen);
  const [dialogOpen, setDialogOpen] = useState(initialDialogOpen);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const immutableSuffix = useMemo(() => shortDeviceId(device.id), [device.id]);
  const canRevoke = device.status === "active";

  async function confirmRevoke() {
    if (pending || !canRevoke) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        dashboardDeviceRevokeEndpoint(device.id),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          cache: "no-store",
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | RevokeResponse
        | null;

      if (!response.ok || !payload) {
        throw new Error(
          `Device revoke failed with status ${response.status}`,
        );
      }

      if (!payload.ok) {
        throw new Error(
          payload.message ?? `Device revoke failed with status ${response.status}`,
        );
      }

      setDialogOpen(false);
      setMenuOpen(false);
      onRevoked({
        id: payload.device.id,
        revokedAt: payload.device.revokedAt,
      });
    } catch (revokeError) {
      setError(
        revokeError instanceof Error
          ? revokeError.message
          : "Could not revoke this device.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="gf-device-actions">
      <button
        type="button"
        className="gf-device-action-trigger"
        aria-label="Device actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MoreHorizontal aria-hidden="true" size={18} />
      </button>

      {menuOpen ? (
        <div id={menuId} className="gf-device-action-menu" role="menu">
          {canRevoke ? (
            <button
              type="button"
              className="gf-device-action-menu-item gf-device-action-menu-danger"
              role="menuitem"
              onClick={() => {
                setError(null);
                setDialogOpen(true);
              }}
            >
              Revoke device
            </button>
          ) : (
            <button
              type="button"
              className="gf-device-action-menu-item"
              role="menuitem"
              aria-disabled="true"
              disabled
            >
              Revoked
            </button>
          )}
        </div>
      ) : null}

      {dialogOpen ? (
        <div
          className="gf-device-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setDialogOpen(false);
              setMenuOpen(false);
            }
          }}
        >
          <section
            aria-labelledby={`${dialogId}-title`}
            aria-describedby={`${dialogId}-description`}
            aria-modal="true"
            className="gf-device-dialog"
            role="dialog"
          >
            <div className="gf-device-dialog-icon" aria-hidden="true">
              <AlertTriangle size={22} />
            </div>

            <div>
              <h3 id={`${dialogId}-title`}>Revoke this device?</h3>
              <p id={`${dialogId}-description`}>
                {device.name} #{immutableSuffix} will no longer be able to
                access this GitFuse workspace. Local repositories and Git
                commits on that machine will not be deleted.
              </p>
              {isCurrentDevice ? (
                <p className="gf-device-dialog-warning">
                  This device may lose GitFuse access immediately.
                </p>
              ) : null}
            </div>

            <dl className="gf-device-dialog-details">
              <div>
                <dt>Status</dt>
                <dd>{device.status}</dd>
              </div>
              <div>
                <dt>Device ID</dt>
                <dd>#{immutableSuffix}</dd>
              </div>
            </dl>

            {error ? <p className="gf-device-action-error">{error}</p> : null}

            <div className="gf-device-dialog-actions">
              <button
                type="button"
                className="gf-device-dialog-cancel"
                disabled={pending}
                onClick={() => {
                  setDialogOpen(false);
                  setMenuOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gf-device-dialog-revoke"
                disabled={pending}
                onClick={confirmRevoke}
              >
                {pending ? "Revoking..." : "Revoke device"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

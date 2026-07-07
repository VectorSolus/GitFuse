"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, MoreHorizontal } from "lucide-react";

import type { DashboardDevice } from "../../lib/devices";
import {
  getDeviceDisplayStatus,
  shortDeviceId,
} from "../../lib/device-summary";

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
  now?: Date;
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
  now,
}: DeviceActionsProps) {
  const menuId = useId();
  const dialogId = useId();
  const actionsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuItemRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(initialMenuOpen);
  const [dialogOpen, setDialogOpen] = useState(initialDialogOpen);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const immutableSuffix = useMemo(() => shortDeviceId(device.id), [device.id]);
  const displayStatus = getDeviceDisplayStatus(device, now);
  const canRevoke = displayStatus !== "revoked";
  const visibleMenuOpen = menuOpen && !dialogOpen;

  function focusTrigger() {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function closeDialog({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
    setDialogOpen(false);
    setMenuOpen(false);
    if (restoreFocus) {
      focusTrigger();
    }
  }

  useEffect(() => {
    if (!visibleMenuOpen) return;

    menuItemRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        actionsRef.current?.contains(event.target)
      ) {
        return;
      }

      setMenuOpen(false);
      focusTrigger();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.preventDefault();
      setMenuOpen(false);
      focusTrigger();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visibleMenuOpen]);

  useEffect(() => {
    if (!dialogOpen) return;

    setMenuOpen(false);
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();

    function getFocusableDialogElements() {
      return Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.tabIndex >= 0);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        closeDialog();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableDialogElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!dialogRef.current?.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [dialogOpen, pending]);

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

      if (!payload) {
        throw new Error(
          `Device revoke failed with status ${response.status}`,
        );
      }

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok
            ? payload.message ?? "Could not revoke this device."
            : `Device revoke failed with status ${response.status}`,
        );
      }

      setDialogOpen(false);
      setMenuOpen(false);
      focusTrigger();
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

  const dialog = dialogOpen ? (
    <div
      className="gf-device-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          closeDialog();
        }
      }}
    >
      <section
        ref={dialogRef}
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
            <dd>{displayStatus}</dd>
          </div>
          <div>
            <dt>Device ID</dt>
            <dd>#{immutableSuffix}</dd>
          </div>
        </dl>

        {error ? <p className="gf-device-action-error">{error}</p> : null}

        <div className="gf-device-dialog-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="gf-device-dialog-cancel"
            disabled={pending}
            onClick={() => {
              closeDialog();
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
  ) : null;

  return (
    <div className="gf-device-actions" ref={actionsRef}>
      <button
        ref={triggerRef}
        type="button"
        className="gf-device-action-trigger"
        aria-label={`Device actions for ${device.name}`}
        aria-haspopup="menu"
        aria-expanded={visibleMenuOpen}
        aria-controls={visibleMenuOpen ? menuId : undefined}
        onClick={() => {
          if (dialogOpen) return;

          setMenuOpen((open) => !open);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" || dialogOpen) return;

          event.preventDefault();
          setMenuOpen(true);
        }}
      >
        <MoreHorizontal aria-hidden="true" size={18} />
      </button>

      {visibleMenuOpen ? (
        <div id={menuId} className="gf-device-action-menu" role="menu">
          {canRevoke ? (
            <button
              ref={menuItemRef}
              type="button"
              className="gf-device-action-menu-item gf-device-action-menu-danger"
              role="menuitem"
              onClick={() => {
                setError(null);
                setMenuOpen(false);
                setDialogOpen(true);
              }}
            >
              Revoke device
            </button>
          ) : (
            <button
              ref={menuItemRef}
              type="button"
              className="gf-device-action-menu-item"
              role="menuitem"
              aria-disabled="true"
              disabled
            >
              Already revoked
            </button>
          )}
        </div>
      ) : null}

      {dialog
        ? typeof document === "undefined"
          ? dialog
          : createPortal(dialog, document.body)
        : null}
    </div>
  );
}

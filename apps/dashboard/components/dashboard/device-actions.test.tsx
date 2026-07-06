import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  dashboardDeviceRevokeEndpoint,
  DeviceActions,
} from "./device-actions";
import type { DashboardDevice } from "../../lib/devices";

const actionNow = new Date("2026-07-06T07:25:05.788Z");

const duplicateHostnameDevices: DashboardDevice[] = [
  {
    id: "00000000-0000-4000-8000-000000000401",
    name: "Piyushs-MacBook-Pro.local",
    lastActiveAt: "2026-06-29T07:25:05.788Z",
    createdAt: "2026-06-29T07:19:27.000Z",
    revokedAt: null,
    status: "active",
  },
  {
    id: "00000000-0000-4000-8000-000000000402",
    name: "Piyushs-MacBook-Pro.local",
    lastActiveAt: "2026-06-20T07:25:10.246Z",
    createdAt: "2026-06-29T07:20:09.000Z",
    revokedAt: null,
    status: "active",
  },
  {
    id: "00000000-0000-4000-8000-000000000403",
    name: "Piyushs-MacBook-Pro.local",
    lastActiveAt: "2026-06-29T07:25:12.246Z",
    createdAt: "2026-06-29T07:20:11.000Z",
    revokedAt: "2026-06-29T08:00:00.000Z",
    status: "revoked",
  },
];

function renderActions(
  device: DashboardDevice,
  options: { menu?: boolean; dialog?: boolean } = {},
) {
  return renderToStaticMarkup(
    <DeviceActions
      device={device}
      initialDialogOpen={options.dialog}
      initialMenuOpen={options.menu}
      now={actionNow}
      onRevoked={() => undefined}
    />,
  );
}

describe("DeviceActions", () => {
  it("renders distinct action triggers for duplicate-hostname device ids", () => {
    const markup = duplicateHostnameDevices
      .map((device) => renderActions(device))
      .join("");

    expect(
      markup.match(/aria-label="Device actions for Piyushs-MacBook-Pro.local"/g),
    ).toHaveLength(3);
    expect(new Set(duplicateHostnameDevices.map((device) => device.id)).size).toBe(
      3,
    );
  });

  it("exposes a destructive revoke menu item for active devices", () => {
    const markup = renderActions(duplicateHostnameDevices[0], { menu: true });

    expect(markup).toContain('role="menu"');
    expect(markup).toContain("Revoke device");
    expect(markup).toContain("gf-device-action-menu-danger");
  });

  it("keeps revoke enabled for inactive trusted devices", () => {
    const markup = renderActions(duplicateHostnameDevices[1], { menu: true });

    expect(markup).toContain("Revoke device");
    expect(markup).toContain("gf-device-action-menu-danger");
    expect(markup).not.toContain("Already revoked");
  });

  it("does not expose an enabled revoke mutation for revoked devices", () => {
    const markup = renderActions(duplicateHostnameDevices[2], { menu: true });

    expect(markup).toContain("Already revoked");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("gf-device-action-menu-danger");
  });

  it("renders the menu as a floating action menu", () => {
    const markup = renderActions(duplicateHostnameDevices[0], { menu: true });

    expect(markup).toContain('class="gf-device-actions"');
    expect(markup).toContain('class="gf-device-action-menu" role="menu"');
  });

  it("opens confirmation copy without full sensitive identifiers", () => {
    const markup = renderActions(duplicateHostnameDevices[0], { dialog: true });

    expect(markup).toContain("Revoke this device?");
    expect(markup).toContain("Piyushs-MacBook-Pro.local");
    expect(markup).toContain("#00000000");
    expect(markup).not.toContain(duplicateHostnameDevices[0].id);
    expect(markup).not.toContain("token");
  });

  it("builds revoke requests with the complete immutable UUID", () => {
    expect(dashboardDeviceRevokeEndpoint(duplicateHostnameDevices[1].id)).toBe(
      "/api/dashboard/devices/00000000-0000-4000-8000-000000000402/revoke",
    );
  });
});

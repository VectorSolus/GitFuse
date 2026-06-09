import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "../../../../lib/auth";
import { type DashboardDevice, listDashboardDevices, revokeDashboardDevice } from "../../../../lib/devices";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}

function DeviceTable({ devices, account }: { devices: DashboardDevice[]; account: { email?: string | null; username?: string | null } }) {
  if (devices.length === 0) {
    return (
      <section className="repo-empty" aria-label="No devices">
        <h2>No devices registered</h2>
        <p>Run gitfuse auth from a machine to register the first device for this account.</p>
      </section>
    );
  }

  async function revokeDevice(formData: FormData) {
    "use server";
    const deviceId = String(formData.get("deviceId") ?? "");
    await revokeDashboardDevice(account, deviceId);
    revalidatePath("/dashboard/devices");
  }

  return (
    <div className="repo-table-wrap">
      <table className="repo-table device-table">
        <thead>
          <tr>
            <th>Device</th>
            <th>Status</th>
            <th>Last active</th>
            <th>Created</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.id}>
              <td>
                <strong>{device.name}</strong>
                <code>{device.id}</code>
              </td>
              <td>
                <span className={`repo-state device-state-${device.status}`}>{device.status}</span>
                {device.revokedAt ? <small>Revoked {formatDate(device.revokedAt)}</small> : null}
              </td>
              <td>{formatDate(device.lastActiveAt)}</td>
              <td>{formatDate(device.createdAt)}</td>
              <td>
                {device.status === "active" ? (
                  <form action={revokeDevice}>
                    <input type="hidden" name="deviceId" value={device.id} />
                    <button className="danger-button" type="submit">
                      Revoke
                    </button>
                  </form>
                ) : (
                  <span className="muted-action">Revoked</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function DevicesPage() {
  const testEmail = process.env.NODE_ENV !== "production" ? process.env.GITFUSE_TEST_DASHBOARD_EMAIL : undefined;
  const session = testEmail ? null : await auth();
  if (!testEmail && !session?.user) redirect("/login");

  const account = {
    email: testEmail ?? session?.user?.email,
    username: session?.user?.name
  };
  const devices = await listDashboardDevices(account, { fixturePath: process.env.GITFUSE_DASHBOARD_DEVICES_FIXTURE });
  const activeCount = devices.filter((device) => device.status === "active").length;
  const revokedCount = devices.length - activeCount;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Registered machines</p>
          <h1>Devices</h1>
        </div>
        <p>{activeCount} active</p>
      </header>

      <section className="repo-summary" aria-label="Device summary">
        <div>
          <span>Total devices</span>
          <strong>{devices.length}</strong>
        </div>
        <div>
          <span>Active</span>
          <strong>{activeCount}</strong>
        </div>
        <div>
          <span>Revoked</span>
          <strong>{revokedCount}</strong>
        </div>
        <div>
          <span>Latest activity</span>
          <strong>{formatDate(devices.find((device) => device.lastActiveAt)?.lastActiveAt ?? null)}</strong>
        </div>
      </section>

      <DeviceTable devices={devices} account={account} />
    </main>
  );
}

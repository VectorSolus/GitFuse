type DashboardDataErrorProps = {
  message?: string | null;
};

export function DashboardDataError({ message }: DashboardDataErrorProps) {
  return (
    <section className="gf-dashboard-data-error" role="alert">
      <p className="gf-dash-eyebrow">Dashboard data unavailable</p>
      <h2>Could not load persisted workspace data.</h2>
      <span>
        {message ??
          "Refresh the page after the database or relay connection is available."}
      </span>
    </section>
  );
}

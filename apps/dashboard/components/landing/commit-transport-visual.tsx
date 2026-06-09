const commits = [
  { label: "a81c2f", x: 18, y: 70 },
  { label: "bd0e94", x: 36, y: 50 },
  { label: "c91f77", x: 54, y: 32 },
  { label: "d42a10", x: 74, y: 52 }
];

export function CommitTransportVisual() {
  return (
    <div className="transport-visual" aria-label="Encrypted commit sync visualization">
      <div className="device device-left">
        <span>laptop</span>
        <strong>3 commits ready</strong>
      </div>
      <div className="device device-right">
        <span>desktop</span>
        <strong>pull when ready</strong>
      </div>
      <div className="relay-core">
        <span>age encrypted relay</span>
      </div>
      <div className="commit-path">
        {commits.map((commit) => (
          <div
            className="commit-node"
            key={commit.label}
            style={{ left: `${commit.x}%`, top: `${commit.y}%` }}
          >
            {commit.label}
          </div>
        ))}
      </div>
    </div>
  );
}

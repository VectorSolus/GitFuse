import { CommitTransportVisual } from "../components/landing/commit-transport-visual";

const capabilities = [
  "Move committed work between machines without pushing to GitHub first.",
  "Choose exactly which commits travel, which stay local, and which are dropped from relay history.",
  "Keep bundle contents encrypted end to end while preserving original commit SHAs."
];

const comparisons = [
  ["git bundle", "Correct primitive, fully manual"],
  ["VS Code Cloud Changes", "Editor locked, uncommitted files only"],
  ["Syncthing", "Not git-aware, unsafe around active .git directories"]
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Primary navigation">
        <a className="brand" href="/">
          gitfuse
        </a>
        <a className="nav-login" href="/login">
          Sign in
        </a>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">CLI-first encrypted commit sync</p>
          <h1>gitfuse</h1>
          <p className="hero-lede">
            Sync local git commits across your devices through a private encrypted relay, without pushing unfinished
            work to GitHub before it is ready.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="/login">
              Open dashboard
            </a>
            <a className="secondary-action" href="#how-it-works">
              See workflow
            </a>
          </div>
        </div>
        <CommitTransportVisual />
      </section>

      <section className="landing-band" id="how-it-works">
        <div className="band-inner">
          <div>
            <p className="eyebrow">committed objects only</p>
            <h2>Your working tree stays yours.</h2>
          </div>
          <div className="capability-list">
            {capabilities.map((capability) => (
              <p key={capability}>{capability}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="comparison-section">
        <div className="comparison-heading">
          <p className="eyebrow">why this exists</p>
          <h2>Built for the gap between commit and push.</h2>
        </div>
        <div className="comparison-grid">
          {comparisons.map(([name, limitation]) => (
            <article className="comparison-item" key={name}>
              <h3>{name}</h3>
              <p>{limitation}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

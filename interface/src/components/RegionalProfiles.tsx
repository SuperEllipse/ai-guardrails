import { useEffect, useState } from "react";
import { demoApi, type ProfileView } from "../api/demo";

export function RegionalProfiles() {
  const [view, setView] = useState<ProfileView | null>(null);
  const [region, setRegion] = useState("global");
  const [error, setError] = useState("");

  useEffect(() => {
    demoApi.profiles().then(setView).catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="banner banner-critical">{error}</p>;
  if (!view) return <p className="hint">Loading the regional profiles…</p>;

  const profile = view.profiles.find((item) => item.id === region) || view.profiles[0];

  return (
    <div className="stack">
      <div className="version-grid">
        {view.versions.map((item) => (
          <article key={item.id} className="card version-card">
            <h3>{item.name}</h3>
            <p>{item.comment}</p>
          </article>
        ))}
      </div>

      <div className="segmented" role="group" aria-label="Region">
        {view.profiles.map((item) => (
          <button key={item.id} type="button" aria-pressed={profile?.id === item.id} onClick={() => setRegion(item.id)}>
            {item.name}
          </button>
        ))}
      </div>

      {profile && (
        <div className="stack">
          {profile.entities.map((entity) => (
            <article key={entity.id} className="card pattern-card">
              <header className="endpoint-head">
                <h3>{entity.label}</h3>
                <span className="pill">{entity.id}</span>
              </header>
              <p>{entity.comment}</p>
              <dl className="pattern-meta">
                <div>
                  <dt>Pattern</dt>
                  <dd><code>{entity.pattern}</code></dd>
                </div>
                <div>
                  <dt>Nearby words</dt>
                  <dd>{entity.context.length ? entity.context.join(", ") : "None. Versions 2 and 3 still match the pattern."}</dd>
                </div>
                <div>
                  <dt>Checksum</dt>
                  <dd>{entity.checksum ? "Version 3 requires a valid checksum." : "None. Version 3 matches version 2."}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { demoApi, type IdMatch, type ProfileView } from "../api/demo";
import { useDemo } from "../state/DemoContext";

const GLOBAL = "global";

const REASON_TEXT: Record<IdMatch["reason"], string> = {
  shape: "Matches the shape.",
  matched_with_word: "Matches the shape and a nearby word names it.",
  no_nearby_word: "Matches the shape, but no nearby word names it, so it is ignored.",
  checksum_failed: "Matches the shape, but the checksum failed, so it is treated as a lookalike.",
};

export function RegionalProfiles() {
  const { config, idVersion, setIdVersion } = useDemo();
  const [view, setView] = useState<ProfileView | null>(null);
  const [region, setRegion] = useState(GLOBAL);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ blocked: boolean; matches: IdMatch[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    demoApi.profiles().then(setView).catch((err: Error) => setError(err.message));
  }, []);

  const profile = view?.profiles.find((item) => item.id === region);
  const regionName = (id: string) => (id === GLOBAL ? "Every region" : config.regions.find((item) => item.id === id)?.label || view?.profiles.find((item) => item.id === id)?.name || id);

  const check = async () => {
    setBusy(true);
    setError("");
    try {
      const all = region === GLOBAL;
      setResult(await demoApi.tryProfile(text, all ? "US" : region, idVersion, all));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {error && <p className="banner banner-critical">{error}</p>}
      <section className="card">
        <h3>How strictly IDs are detected</h3>
        <p className="hint">Each version adds a condition. The choice here is the default on the live screen, in the Customer data card.</p>
        <div className="option-cards" role="radiogroup" aria-label="ID detection">
          {(view?.versions || []).map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={idVersion === item.id}
              className={`option-card${idVersion === item.id ? " is-selected" : ""}`}
              onClick={() => setIdVersion(item.id)}
            >
              <strong>{item.name}</strong>
              <span>{item.comment}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>ID types by region</h3>
          <span className="hint">"Every region" rules always apply</span>
        </div>
        <div className="pill-row">
          {(view?.profiles || []).map((item) => (
            <button key={item.id} type="button" className={`pill-btn${region === item.id ? " is-selected" : ""}`} onClick={() => setRegion(item.id)}>
              {regionName(item.id)}
            </button>
          ))}
        </div>
        {profile && (
          <table className="table">
            <thead>
              <tr>
                <th>ID type</th>
                <th>Looks like</th>
                <th>Nearby words (version 2+)</th>
                <th>Checksum (version 3)</th>
              </tr>
            </thead>
            <tbody>
              {profile.entities.map((entity) => (
                <tr key={entity.id} title={entity.comment}>
                  <td>{entity.label}</td>
                  <td><code>{entity.pattern}</code></td>
                  <td>{entity.context.join(", ") || "None"}</td>
                  <td>{entity.checksum ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>Try a sentence</h3>
        <p className="hint">See what the selected version does with a customer message, for the region selected above. The guard server's pattern check runs it; no model is asked. Names, places, and crypto wallets are checked after it by NeMo's PII extension, which this tester does not run.</p>
        <div className="inline-row">
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a customer message" onKeyDown={(e) => e.key === "Enter" && text.trim() && void check()} />
          <button type="button" className="btn btn-primary" onClick={check} disabled={busy || !text.trim()}>
            {busy ? "Checking…" : "Check"}
          </button>
        </div>
        {result && (
          <div className="try-result">
            <p>
              <span className={`tag ${result.blocked ? "tag-critical" : "tag-good"}`}>{result.blocked ? "Blocked" : "Allowed"}</span>{" "}
              <strong>{result.blocked ? "The message would be stopped." : "The message is allowed."}</strong>
            </p>
            {result.matches.length === 0 && <p className="hint">Nothing in the message looks like an ID for this region.</p>}
            {result.matches.map((match, index) => (
              <p key={`${match.entity}-${index}`}>
                <span className={`tag ${match.matched ? "tag-critical" : "tag-neutral"}`}>{match.matched ? "Found" : "Ignored"}</span>{" "}
                <strong>
                  {match.label} ({match.value})
                </strong>
                . {REASON_TEXT[match.reason]} <span className="micro">{regionName(match.profile)} profile</span>
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

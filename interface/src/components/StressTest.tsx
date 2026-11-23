import { useEffect, useState } from "react";
import { demoApi, type AttackPrompt, type RedCase, type RedEvent, type RedPrompt, type RedRun } from "../api/demo";
import { ID_VERSION_LABELS, seconds, STAGE_LABELS } from "../copy";
import { navigate, useDemo } from "../state/DemoContext";

type PromptStatus = "waiting" | "running" | "done";

interface ShownPrompt extends RedPrompt {
  status: PromptStatus;
  actual?: string;
}

function expectedFor(attack: AttackPrompt, version: string, allRegions: boolean): string {
  if (version === "v3" && attack.expected_v3) return attack.expected_v3;
  if (allRegions && attack.expected_all_regions) return attack.expected_all_regions;
  return attack.expected || "allow";
}

function previewPrompts(attacks: AttackPrompt[], picked: string[], region: string, version: string, allRegions: boolean, customDeployed: boolean): ShownPrompt[] {
  return attacks
    .filter((attack) => {
      if (!picked.includes(attack.policy)) return false;
      if (attack.policy === "redress_liability" && !customDeployed) return false;
      if (attack.regions && attack.regions.length > 0 && !allRegions && !attack.regions.includes(region)) return false;
      return true;
    })
    .map((attack) => ({
      id: attack.id,
      policy: attack.policy,
      stage: attack.stage || "",
      text: attack.text || "",
      user: attack.user || "",
      expected: expectedFor(attack, version, allRegions),
      status: "waiting" as const,
    }));
}

function actualTag(actual?: string) {
  if (!actual) return null;
  if (actual === "error") return <span className="tag tag-critical">Error</span>;
  return actual === "block" ? <span className="tag tag-critical">Stopped</span> : <span className="tag tag-good">Allowed</span>;
}

export function StressTest() {
  const { config, idVersion, region: liveRegion } = useDemo();
  const [picked, setPicked] = useState<string[]>(config.policies.map((item) => item.id));
  const [region, setRegion] = useState(liveRegion);
  const [version, setVersion] = useState(idVersion);
  const [allRegions, setAllRegions] = useState(false);
  const [attacks, setAttacks] = useState<AttackPrompt[]>([]);
  const [prompts, setPrompts] = useState<ShownPrompt[]>([]);
  const [cases, setCases] = useState<RedCase[]>([]);
  const [runId, setRunId] = useState("");
  const [finished, setFinished] = useState(false);
  const [runs, setRuns] = useState<RedRun[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const labels = Object.fromEntries(config.policies.map((item) => [item.id, item.label]));
  labels.redress_liability = labels.redress_liability || config.custom_rule.name;

  useEffect(() => {
    demoApi.runs().then(setRuns).catch((err: Error) => setError(err.message));
    demoApi
      .attacks()
      .then((payload) => setAttacks(payload.attacks))
      .catch((err: Error) => setError(err.message));
  }, []);

  const allIds = config.policies.map((item) => item.id);
  const allOn = allIds.length > 0 && allIds.every((id) => picked.includes(id));
  const shown = busy || prompts.length > 0 ? prompts : previewPrompts(attacks, picked, region, version, allRegions, config.custom_rule.deployed);

  const applyEvent = (event: RedEvent) => {
    if (event.type === "start") {
      setRunId(event.run_id);
      setPrompts(event.prompts.map((prompt) => ({ ...prompt, status: "waiting" })));
      return;
    }
    if (event.type === "working") {
      setPrompts((current) => current.map((prompt) => (prompt.id === event.id ? { ...prompt, status: "running" } : prompt)));
      return;
    }
    if (event.type === "result") {
      setCases((current) => [...current, event.case]);
      setPrompts((current) =>
        current.map((prompt) => (prompt.id === event.case.case_id ? { ...prompt, status: "done", actual: event.case.actual } : prompt)),
      );
      return;
    }
    setFinished(true);
    setRunId(event.run_id);
  };

  const run = async () => {
    setBusy(true);
    setFinished(false);
    setError("");
    setCases([]);
    setRunId("");
    setPrompts(previewPrompts(attacks, picked, region, version, allRegions, config.custom_rule.deployed));
    try {
      await demoApi.streamRedteam(picked, region, version, allRegions, applyEvent);
      setRuns(await demoApi.runs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run failed.");
    } finally {
      setBusy(false);
    }
  };

  const openRun = async (id: string) => {
    setError("");
    try {
      const next = await demoApi.run(id);
      setRunId(next.run.run_id);
      setFinished(true);
      setCases(next.cases);
      setPrompts(
        next.cases.map((row) => ({ id: row.case_id, policy: row.policy, stage: row.stage, text: row.query, user: "", expected: row.expected, status: "done", actual: row.actual })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that run.");
    }
  };

  const total = prompts.length;
  const caught = cases.filter((row) => row.actual === "block").length;
  const attacksTotal = cases.length;
  const misses = cases.filter((row) => row.expected === "block" && row.actual === "allow");
  const overblocks = cases.filter((row) => row.expected === "allow" && row.actual === "block");
  const errors = cases.filter((row) => row.actual === "error");
  const byPolicy = cases.reduce<Record<string, { total: number; block: number; miss: number; over: number; error: number }>>((acc, row) => {
    const bucket = (acc[row.policy] ||= { total: 0, block: 0, miss: 0, over: 0, error: 0 });
    bucket.total += 1;
    if (row.actual === "block") bucket.block += 1;
    if (row.actual === "error") bucket.error += 1;
    if (row.expected === "block" && row.actual === "allow") bucket.miss += 1;
    if (row.expected === "allow" && row.actual === "block") bucket.over += 1;
    return acc;
  }, {});

  return (
    <div className="stack">
      <section className="card">
        <h2 className="card-heading">Stress test</h2>
        <p className="hint">Fire a batch of adversarial prompts at every policy and see what slipped through and what was blocked by mistake. Every prompt goes to the guard server.</p>
      </section>

      {cases.length > 0 && (
        <div className="three-up">
          <section className="card figure">
            <strong>{caught} / {attacksTotal}</strong>
            <span>Prompts stopped</span>
          </section>
          <section className="card figure">
            <strong className="tone-critical">{misses.length}</strong>
            <span>Should have been stopped</span>
          </section>
          <section className="card figure">
            <strong className="tone-warning">{overblocks.length}</strong>
            <span>Stopped by mistake</span>
          </section>
        </div>
      )}

      {errors.length > 0 && (
        <p className="banner banner-critical">
          {errors.length} prompt{errors.length === 1 ? "" : "s"} did not get a verdict. {errors[0].detail}{" "}
          <button type="button" className="btn-link" onClick={() => navigate("setup")}>
            Open Setup
          </button>
        </p>
      )}
      {error && <p className="banner banner-critical">{error}</p>}

      <section className="card">
        <div className="inline-row wrap">
          <label className="check">
            <input type="checkbox" checked={allOn} onChange={(e) => setPicked(e.target.checked ? allIds : [])} disabled={busy} />
            All policies
          </label>
          {config.policies.map((item) => (
            <label key={item.id} className="check">
              <input
                type="checkbox"
                checked={picked.includes(item.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, item.id] : picked.filter((id) => id !== item.id))}
                disabled={busy}
              />
              {item.label}
            </label>
          ))}
        </div>
        <div className="inline-row wrap">
          <label className="inline-field">
            <span>Customer region</span>
            <select className="select" value={region} onChange={(e) => setRegion(e.target.value)} disabled={busy}>
              {config.regions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="inline-field">
            <span>ID detection</span>
            <select className="select" value={version} onChange={(e) => setVersion(e.target.value)} disabled={busy}>
              {Object.entries(ID_VERSION_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={allRegions} onChange={(e) => setAllRegions(e.target.checked)} disabled={busy} />
            Check all regions
          </label>
          <button className="btn btn-primary" type="button" onClick={run} disabled={busy || picked.length === 0}>
            {busy ? `Running ${cases.length} of ${total}…` : "Run stress test"}
          </button>
          {finished && runId && (
            <a className="btn" href={demoApi.runCsvUrl(runId)} download={`stress-test-${runId}.csv`}>
              Download spreadsheet
            </a>
          )}
        </div>
      </section>

      {Object.keys(byPolicy).length > 0 && (
        <section className="card">
          <h3>By policy</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Policy</th>
                <th>Prompts</th>
                <th>Stopped</th>
                <th>Should have been stopped</th>
                <th>Stopped by mistake</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byPolicy).map(([policy, row]) => (
                <tr key={policy}>
                  <td>{labels[policy] || policy}</td>
                  <td>{row.total}</td>
                  <td>{row.block}</td>
                  <td className={row.miss ? "tone-critical" : ""}>{row.miss}</td>
                  <td className={row.over ? "tone-warning" : ""}>{row.over}</td>
                  <td className={row.error ? "tone-critical" : ""}>{row.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="two-up">
        <section className="card">
          <h3>Prompts</h3>
          <p className="hint">{shown.length} prompts for the policies you picked.</p>
          <ul className="row-list">
            {shown.length === 0 && <li className="hint">No prompts for this selection.</li>}
            {shown.map((prompt) => (
              <li key={prompt.id} className={prompt.status === "running" ? "is-current" : ""}>
                <div className="row-list-head">
                  <strong>{labels[prompt.policy] || prompt.policy}</strong>
                  <span className="tag tag-outline">{STAGE_LABELS[prompt.stage] || prompt.stage}</span>
                  <span className="micro">Expected {prompt.expected === "block" ? "stopped" : "allowed"}</span>
                  {prompt.status === "running" && <span className="spinner spinner-sm" aria-label="Running" />}
                  {actualTag(prompt.actual)}
                </div>
                {prompt.user && <p className="micro">Customer: {prompt.user}</p>}
                <p>{prompt.text}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>Results</h3>
          <p className="hint">{cases.length === 0 ? (busy ? "Checking the first prompt…" : "Results show up here as each prompt finishes.") : `${cases.length} of ${total || cases.length} done.`}</p>
          <ul className="row-list">
            {cases.map((row) => (
              <li key={row.case_id}>
                <div className="row-list-head">
                  <strong>{labels[row.policy] || row.policy}</strong>
                  {actualTag(row.actual)}
                  {row.expected === "block" && row.actual === "allow" && <span className="tag tag-critical">Should have been stopped</span>}
                  {row.expected === "allow" && row.actual === "block" && <span className="tag tag-warning">Stopped by mistake</span>}
                </div>
                <p>{row.query}</p>
                {row.detail && <p className={row.actual === "error" ? "error-text micro" : "micro"}>{row.detail}</p>}
                <p className="micro">
                  {[row.judge, row.elapsed_ms !== null && row.elapsed_ms !== undefined && row.elapsed_ms !== "" ? seconds(Number(row.elapsed_ms)) : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <h3>Past runs</h3>
        {runs.length === 0 && <p className="hint">No runs yet. A run is stored here after it finishes.</p>}
        <ul className="plain-list">
          {runs.map((item) => (
            <li key={item.run_id}>
              <button type="button" className="btn-link" onClick={() => openRun(item.run_id)}>
                {new Date(item.created).toLocaleString()} · {item.region} · {ID_VERSION_LABELS[item.profile_version] || item.profile_version} · {item.model} · stopped {item.blocked} of {item.total}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

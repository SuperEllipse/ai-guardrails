import { useEffect, useState } from "react";
import { demoApi, type AttackPrompt, type DemoConfig, type RedCase, type RedEvent, type RedPrompt, type RedSummary } from "../api/demo";
import { BarChart } from "./BarChart";

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

function previewPrompts(
  attacks: AttackPrompt[],
  picked: string[],
  region: string,
  version: string,
  allRegions: boolean,
  customDeployed: boolean,
): ShownPrompt[] {
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

export function RedTeam({ config }: { config: DemoConfig }) {
  const [picked, setPicked] = useState<string[]>(config.policies.map((item) => item.id));
  const [region, setRegion] = useState("US");
  const [version, setVersion] = useState("v1");
  const [allRegions, setAllRegions] = useState(false);
  const [attacks, setAttacks] = useState<AttackPrompt[]>([]);
  const [prompts, setPrompts] = useState<ShownPrompt[]>([]);
  const [cases, setCases] = useState<RedCase[]>([]);
  const [runId, setRunId] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0, blocked: 0, misses: 0, overblocks: 0 });
  const [finished, setFinished] = useState(false);
  const [runs, setRuns] = useState<RedSummary["run"][]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    demoApi.runs().then(setRuns).catch(() => setRuns([]));
    demoApi.attacks().then((payload) => setAttacks(payload.attacks)).catch(() => setAttacks([]));
  }, []);

  useEffect(() => {
    const ids = config.policies.map((item) => item.id);
    setPicked((current) => {
      const kept = current.filter((id) => ids.includes(id));
      const added = ids.filter((id) => id === "redress_liability" && !kept.includes(id));
      return [...kept, ...added];
    });
  }, [config]);

  const allIds = config.policies.map((item) => item.id);
  const allOn = allIds.length > 0 && allIds.every((id) => picked.includes(id));
  const shown = busy || prompts.length > 0
    ? prompts
    : previewPrompts(attacks, picked, region, version, allRegions, config.custom_rule.deployed);

  const toggleAll = (on: boolean) => setPicked(on ? allIds : []);
  const toggle = (id: string, on: boolean) =>
    setPicked(on ? [...picked, id] : picked.filter((item) => item !== id));

  const applyEvent = (event: RedEvent) => {
    if (event.type === "start") {
      setRunId(event.run_id);
      setProgress({ done: 0, total: event.total, blocked: 0, misses: 0, overblocks: 0 });
      setPrompts(event.prompts.map((prompt) => ({ ...prompt, status: "waiting" })));
      return;
    }
    if (event.type === "working") {
      setPrompts((current) => current.map((prompt) => (
        prompt.id === event.id ? { ...prompt, status: "running" } : prompt
      )));
      return;
    }
    if (event.type === "result") {
      setCases((current) => [...current, event.case]);
      setProgress({
        done: event.done,
        total: event.total,
        blocked: event.blocked,
        misses: event.misses,
        overblocks: event.overblocks,
      });
      setPrompts((current) => current.map((prompt) => (
        prompt.id === event.case.case_id ? { ...prompt, status: "done", actual: event.case.actual } : prompt
      )));
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
    setBusy(false);
    try {
      const next = await demoApi.run(id);
      setRunId(next.run.run_id);
      setFinished(true);
      setCases(next.cases);
      setProgress({
        done: next.run.total,
        total: next.run.total,
        blocked: next.run.blocked,
        misses: next.run.misses,
        overblocks: next.run.overblocks,
      });
      setPrompts(next.cases.map((row) => ({
        id: row.case_id,
        policy: row.policy,
        stage: row.stage,
        text: row.query,
        user: "",
        expected: row.expected,
        status: "done",
        actual: row.actual,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that run.");
    }
  };

  const download = () => {
    if (!runId || !finished) return;
    const header = ["case_id", "policy", "stage", "expected", "actual", "entity", "query", "detail"];
    const lines = [
      header.join(","),
      ...cases.map((row) =>
        header.map((key) => `"${String(row[key as keyof typeof row] ?? "").replace(/"/g, '""')}"`).join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `redteam-${runId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const policyBars = Object.entries(
    cases.reduce<Record<string, number>>((counts, row) => {
      if (row.actual === "block") counts[row.policy] = (counts[row.policy] || 0) + 1;
      return counts;
    }, {}),
  ).map(([label, value]) => ({ label, value }));
  const misses = cases.filter((row) => row.expected === "block" && row.actual === "allow");
  const overblocks = cases.filter((row) => row.expected === "allow" && row.actual === "block");

  return (
    <section className="view">
      <div className="page-head">
        <h2>Red teaming</h2>
        <p>Pick the rules to test, or all of them. The prompts stay on the left. Each result appears on the right as soon as that check finishes.</p>
      </div>

      <div className="card">
        <label className="choice">
          <input type="checkbox" checked={allOn} onChange={(e) => toggleAll(e.target.checked)} />
          All rules
        </label>
        {config.policies.map((item) => (
          <label key={item.id} className="choice">
            <input type="checkbox" checked={picked.includes(item.id)} onChange={(e) => toggle(item.id, e.target.checked)} />
            {item.label}
          </label>
        ))}
        <div className="row-actions">
          <label className="field">
            <span>Region</span>
            <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
              {config.regions.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>ID profile version</span>
            <select className="input" value={version} onChange={(e) => setVersion(e.target.value)}>
              <option value="v1">Version 1, pattern</option>
              <option value="v2">Version 2, nearby word</option>
              <option value="v3">Version 3, checksum</option>
            </select>
          </label>
          <label className="choice">
            <input type="checkbox" checked={allRegions} onChange={(e) => setAllRegions(e.target.checked)} />
            All regions
          </label>
        </div>
        <button className="btn" type="button" onClick={run} disabled={busy || picked.length === 0}>
          {busy ? "Running…" : "Run checks"}
        </button>
      </div>

      {error && <p className="banner banner-critical">{error}</p>}

      <div className="compare">
        <div className="card">
          <h3>Prompts</h3>
          <p className="hint">{shown.length} prompts for the rules you picked.</p>
          <div className="live-list">
            {shown.length === 0 && <p>No prompts for this selection.</p>}
            {shown.map((prompt) => (
              <article key={prompt.id} className={`prompt-row ${prompt.status === "running" ? "is-current" : ""}`}>
                <strong>{prompt.policy}</strong>
                <span className="hint">{prompt.stage} · expected {prompt.expected}{prompt.actual ? ` · ${prompt.actual}` : ""}</span>
                {prompt.user && <p className="hint">Customer: {prompt.user}</p>}
                <p>{prompt.text}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Results</h3>
          <p className="hint">
            {progress.total === 0 && "Results show up here as each prompt finishes."}
            {progress.total > 0 && `${progress.done} of ${progress.total}. Stopped ${progress.blocked}. Missed ${progress.misses}. Stopped by mistake ${progress.overblocks}.`}
          </p>
          <div className="live-list">
            {cases.length === 0 && <p>{busy ? "Checking the first prompt…" : "Nothing yet."}</p>}
            {cases.map((row) => (
              <article key={row.case_id} className="prompt-row">
                <strong>{row.policy}</strong>
                <span className="hint">{row.stage} · expected {row.expected} · {row.actual}</span>
                <p>{row.query}</p>
                {row.detail && <p className="hint">{row.detail}</p>}
              </article>
            ))}
          </div>
          {finished && cases.length > 0 && (
            <button className="btn" type="button" onClick={download}>Download spreadsheet</button>
          )}
          {busy && <p className="hint">The spreadsheet is ready when the run finishes.</p>}
        </div>
      </div>

      {policyBars.length > 0 && <BarChart title="Stopped attacks by rule" data={policyBars} unit="stops" />}

      {(misses.length > 0 || overblocks.length > 0) && (
        <div className="compare">
          <div className="card">
            <h3>Should have been stopped</h3>
            {misses.length === 0 && <p>None.</p>}
            <ul>{misses.map((row) => <li key={row.case_id}>{row.query}</li>)}</ul>
          </div>
          <div className="card">
            <h3>Stopped by mistake</h3>
            {overblocks.length === 0 && <p>None.</p>}
            <ul>{overblocks.map((row) => <li key={row.case_id}>{row.query}</li>)}</ul>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Past runs</h3>
        {runs.length === 0 && <p className="hint">No runs yet. A run is stored here after it finishes. Sample numbers are not invented.</p>}
        <ul>
          {runs.map((runRow) => (
            <li key={runRow.run_id}>
              <button type="button" className="btn-link" onClick={() => openRun(runRow.run_id)}>
                {runRow.created} · {runRow.region} · {runRow.profile_version} · {runRow.model} · stopped {runRow.blocked} of {runRow.total}
              </button>
            </li>
          ))}
        </ul>
      </div>

    </section>
  );
}

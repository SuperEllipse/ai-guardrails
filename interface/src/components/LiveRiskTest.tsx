import { useCallback, useEffect, useRef, useState } from "react";
import { demoApi, type UseCaseResult } from "../api/demo";
import { checkLabel, decidingCheck, decisiveJudge, ID_VERSION_LABELS, judgedBy, judgeName, plural, verdictFor } from "../copy";
import { navigate, useDemo } from "../state/DemoContext";
import { usePlayback } from "../state/usePlayback";
import { Pipeline } from "./Pipeline";
import { ResultCompare } from "./ResultCompare";
import { RiskAreaCard } from "./RiskAreaCard";

const PAUSE_SECONDS = 3;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function LiveRiskTest() {
  const demo = useDemo();
  const { config, results, setResult, region, idVersion, refreshLogCount } = demo;
  const [selected, setSelected] = useState("");
  const [running, setRunning] = useState("");
  const [batch, setBatch] = useState(false);
  const [nextIn, setNextIn] = useState(0);
  const [requestError, setRequestError] = useState("");
  const [runId, setRunId] = useState(0);
  const [runQuery, setRunQuery] = useState("");
  const [runResult, setRunResult] = useState<UseCaseResult | null>(null);
  const [failed, setFailed] = useState(false);
  const stopBatch = useRef(false);
  const { playback, waitDone } = usePlayback(runId, runQuery, runResult, failed);

  const examples = config.examples;
  const happy = examples.find((item) => item.area_id === config.everyday.id);
  const rule = config.custom_rule;
  const playing = runId > 0 && !playback.done;
  const busy = Boolean(running) || playing;

  useEffect(() => {
    if (runId && selected && !results[selected] && !busy) {
      setRunId(0);
      setRunResult(null);
    }
  }, [results]);

  const runOne = useCallback(
    async (exampleId: string): Promise<UseCaseResult | null> => {
      const example = examples.find((item) => item.id === exampleId);
      if (!example) return null;
      setSelected(exampleId);
      setRunning(exampleId);
      setRequestError("");
      setRunResult(null);
      setFailed(false);
      setRunQuery(example.queries?.[region] || example.query);
      setRunId((id) => id + 1);
      let result: UseCaseResult | null = null;
      try {
        result = await demoApi.usecase(exampleId, region, idVersion);
        setResult(result);
        setRunResult(result);
      } catch (err) {
        setRequestError(err instanceof Error ? err.message : "The request failed.");
        setFailed(true);
      } finally {
        setRunning("");
        refreshLogCount();
      }
      await waitDone();
      return result;
    },
    [examples, region, idVersion, setResult, refreshLogCount, waitDone],
  );

  const startedPending = useRef("");
  useEffect(() => {
    const pending = demo.takePendingRun();
    if (pending && startedPending.current !== pending) {
      startedPending.current = pending;
      void runOne(pending).then(() => {
        startedPending.current = "";
      });
    }
  }, [demo.pendingRun]);

  const runAll = async () => {
    setBatch(true);
    stopBatch.current = false;
    for (let index = 0; index < examples.length; index++) {
      if (stopBatch.current) break;
      await runOne(examples[index].id);
      if (index === examples.length - 1) break;
      for (let left = PAUSE_SECONDS; left > 0 && !stopBatch.current; left--) {
        setNextIn(left);
        await sleep(1000);
      }
      setNextIn(0);
    }
    setNextIn(0);
    setBatch(false);
  };

  const hidden = playing ? selected : "";
  const done = examples.filter((item) => results[item.id] && item.id !== hidden);
  const blocked = done.filter((item) => results[item.id].actual === "block").length;
  const allowed = done.filter((item) => results[item.id].actual === "allow").length;
  const gaps = done.filter((item) => results[item.id].outcome === "gap").length;
  const errors = done.filter((item) => results[item.id].outcome === "error").length;
  const shownResult = runId > 0 && playback.done ? runResult : null;
  const verdict = shownResult ? verdictFor(shownResult) : null;
  const decisive = shownResult ? decisiveJudge(shownResult) : undefined;
  const selectedTitle = examples.find((item) => item.id === selected)?.title;

  return (
    <div className="stack">
      <section className="card toolbar-row">
        <label className="inline-field">
          <span>Customer region</span>
          <select className="select" value={region} onChange={(e) => demo.setRegion(e.target.value)} disabled={busy || batch}>
            {config.regions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <p className="score" aria-live="polite">
          <strong>{done.length}</strong> of {examples.length} run <span className="tone-critical">{blocked} blocked</span>{" "}
          <span className="tone-good">{allowed} allowed</span> <span className="tone-warning">{plural(gaps, "gap", "gaps")}</span>
          {errors > 0 && <span className="tone-critical"> {plural(errors, "error", "errors")}</span>}
          {nextIn > 0 && <span className="hint"> · Next test in {nextIn} s</span>}
        </p>
        <div className="toolbar-actions">
          {happy && (
            <button type="button" className="btn" onClick={() => void runOne(happy.id)} disabled={busy || batch}>
              Try a normal question
            </button>
          )}
          {batch ? (
            <button type="button" className="btn" onClick={() => (stopBatch.current = true)}>
              Stop after this test
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={runAll} disabled={busy}>
              Run all tests
            </button>
          )}
        </div>
      </section>

      <div className="live-grid">
        <div className="live-left">
          <div className="column-head">
            <h3>Risk areas</h3>
            <span className="hint">Pick a test</span>
          </div>
          {config.areas.map((area) => (
            <RiskAreaCard
              key={area.id}
              area={area}
              examples={examples.filter((item) => item.area_id === area.id)}
              results={results}
              selected={selected}
              running={running || hidden}
              disabled={busy || batch}
              onRun={(id) => void runOne(id)}
            >
              {area.id === "promises" && (
                <div className="card-foot">
                  <span className="hint">
                    Custom policy: {rule.name}{" "}
                    <span className={`tag ${rule.deployed ? "tag-good" : "tag-neutral"}`}>{rule.deployed ? "Live" : "Not deployed"}</span>
                  </span>
                  <button type="button" className="btn-link link-strong" onClick={() => navigate("policies")}>
                    {rule.deployed ? "Edit" : "Set up"}
                  </button>
                </div>
              )}
              {area.id === "data" && (
                <div className="card-foot">
                  <label className="inline-field">
                    <span>ID detection</span>
                    <select className="select" value={idVersion} onChange={(e) => demo.setIdVersion(e.target.value)} disabled={busy || batch}>
                      {Object.entries(ID_VERSION_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </RiskAreaCard>
          ))}
        </div>

        <div className="live-right">
          <section className="card">
            <div className="card-head">
              <h3>How the request was checked</h3>
              <span className="hint">Judge: {judgeName(config.connection.safety_mode)}</span>
            </div>
            <Pipeline result={runResult} playback={playback} />
            {requestError && (
              <div className="verdict verdict-critical" role="status">
                <span>{requestError}</span>
                <button type="button" className="btn-link link-strong" onClick={() => navigate("setup")}>
                  Open Setup
                </button>
              </div>
            )}
            {!requestError && playing && (
              <div className="verdict verdict-neutral">
                <span>
                  {runResult
                    ? "Playing back the result step by step. The times shown were measured on the server."
                    : "Waiting for the guard server and the models. The steps play back when the real result is in."}
                </span>
              </div>
            )}
            {!requestError && runId === 0 && (
              <div className="verdict verdict-neutral">
                <span>Pick a test on the left. Each step lights up as the request moves through it.</span>
              </div>
            )}
            {shownResult && verdict && (
              <div className={`verdict verdict-${verdict.tone}`} role="status">
                <span>
                  <strong>{verdict.text}</strong>
                  {shownResult.outcome === "error" && <> · {shownResult.error}</>}
                </span>
                {shownResult.outcome === "error" ? (
                  <button type="button" className="btn-link link-strong" onClick={() => navigate("setup")}>
                    Open Setup
                  </button>
                ) : (
                  <span className="verdict-area">{shownResult.area}</span>
                )}
              </div>
            )}
            {decisive && <p className="micro judged">{judgedBy(decisive)}</p>}
            {shownResult && !decisive && shownResult.outcome !== "error" && (
              <p className="micro judged">
                {shownResult.payment
                  ? "Decided by the demo ledger rule, no model"
                  : `Decided by: ${checkLabel(decidingCheck(shownResult))}`}
              </p>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h3>What the customer gets</h3>
              {runId > 0 && selectedTitle && <span className="hint">{selectedTitle}</span>}
            </div>
            {runId === 0 || failed ? (
              <div className="empty">
                {failed
                  ? "No reply. The request did not finish, so nothing was delivered."
                  : "The customer's message and both replies appear here: without guardrails on the left, with guardrails on the right."}
              </div>
            ) : (
              <ResultCompare query={runQuery} result={runResult} playback={playback} onRunAgain={() => void runOne(selected)} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

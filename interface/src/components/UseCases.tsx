import { useEffect, useState } from "react";
import { demoApi, type DemoConfig, type GuardLogEntry, type UseCaseResult } from "../api/demo";

const JUDGE_LABELS: Record<string, string> = {
  self_check: "LLM as Self Judge",
  llama_guard: "Llama Guard",
  nim: "NVIDIA NIM",
};

const SOURCE_LABELS: Record<string, string> = {
  compliance: "Compliance test",
  custom_rule: "Custom rule",
};

type StationState = "idle" | "running" | "clear" | "blocked" | "skipped" | "error";

type Frame = {
  guard: StationState;
  agents: StationState;
  judge: StationState;
  caption: string;
};

type Turn = {
  key: string;
  title: string;
  query: string;
  phase: "waiting" | "done" | "failed";
  result: UseCaseResult | null;
  error: string;
};

const IDLE: Frame = {
  guard: "idle",
  agents: "idle",
  judge: "idle",
  caption: "Choose an example. The path lights up as the check runs.",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFrames(result: UseCaseResult): Frame[] {
  const frames: Frame[] = [];
  let guard: StationState = "idle";
  let agents: StationState = "idle";
  let judge: StationState = "idle";
  const snap = (caption: string) => frames.push({ guard, agents, judge, caption });
  const input = result.input || {};
  const output = result.output || {};

  guard = "running";
  snap("The guard server is reading the customer message.");
  if (input.model_call) {
    judge = "running";
    snap("The judge is reading the written rules.");
    judge = input.blocked ? "blocked" : "clear";
  }
  if (input.error) {
    guard = "error";
    agents = "skipped";
    snap(input.error);
    return frames;
  }
  if (input.blocked) {
    guard = "blocked";
    agents = "skipped";
    snap(input.message || "The input check stopped this message.");
    return frames;
  }

  guard = "clear";
  agents = "running";
  snap("The system agents are writing a draft.");
  agents = "clear";
  snap("The draft is ready.");

  if (result.payment) {
    guard = "running";
    snap("The guard server is checking the payment.");
    if (result.payment.error) {
      guard = "error";
      snap(result.payment.error);
      return frames;
    }
    guard = result.payment.allowed ? "clear" : "blocked";
    snap(result.payment.reason || (result.payment.allowed ? "The payment is allowed." : "The payment check stopped the transfer."));
    if (!result.payment.allowed) return frames;
  }

  guard = "running";
  snap("The guard server is checking the draft.");
  if (output.model_call) {
    judge = "running";
    snap("The judge is reading the draft.");
    judge = output.blocked ? "blocked" : "clear";
  }
  if (output.error) {
    guard = "error";
    snap(output.error);
    return frames;
  }
  guard = output.blocked ? "blocked" : "clear";
  snap(
    output.blocked
      ? output.message || "The output check caught the draft."
      : "The draft is allowed.",
  );
  return frames;
}

export function UseCases({ config }: { config: DemoConfig }) {
  const [region, setRegion] = useState("US");
  const [version, setVersion] = useState("v1");
  const [allRegions, setAllRegions] = useState(false);
  const [active, setActive] = useState("");
  const [frame, setFrame] = useState<Frame>(IDLE);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [logs, setLogs] = useState<GuardLogEntry[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);

  const judgeName = JUDGE_LABELS[config.connection.safety_mode] || "Judge";
  const started = frame !== IDLE;
  const latest = [...turns].reverse().find((turn) => turn.result);

  useEffect(() => {
    demoApi.logs().then(setLogs).catch(() => setLogs([]));
  }, []);

  const run = async (exampleId: string) => {
    const example = config.examples.find((item) => item.id === exampleId);
    if (!example || busy) return;
    const key = `${exampleId}-${Date.now()}`;
    setActive(exampleId);
    setBusy(true);
    setFrame({
      guard: "running",
      agents: "idle",
      judge: "idle",
      caption: "The guard server is reading the customer message.",
    });
    setTurns((current) => [
      ...current,
      { key, title: example.title, query: example.query, phase: "waiting", result: null, error: "" },
    ]);
    try {
      const result = await demoApi.usecase(exampleId, region, version, allRegions);
      for (const step of buildFrames(result)) {
        setFrame(step);
        await sleep(850);
      }
      setTurns((current) =>
        current.map((turn) => (turn.key === key ? { ...turn, phase: "done", result } : turn)),
      );
      const nextLogs = await demoApi.logs();
      setLogs(nextLogs);
      setSelectedId(nextLogs[0]?.id || "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "The example failed.";
      setFrame({ guard: "error", agents: "idle", judge: "idle", caption: message });
      setTurns((current) =>
        current.map((turn) => (turn.key === key ? { ...turn, phase: "failed", error: message } : turn)),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="view compliance">
      <div className="page-head">
        <h2>Compliance / Risks Guardrail Test</h2>
        <p>The customer message moves through the guard server, the agents, and the judge. The chat shows the reply, then the two outcomes side by side.</p>
      </div>

      <div className="workspace">
        <div className="stack">
          <div className="card toolbar-card">
            <label className="field">
              <span>Region</span>
              <select className="input" value={region} onChange={(event) => setRegion(event.target.value)} disabled={busy}>
                {config.regions.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>ID profile version</span>
              <select className="input" value={version} onChange={(event) => setVersion(event.target.value)} disabled={busy}>
                <option value="v1">Version 1, pattern</option>
                <option value="v2">Version 2, nearby word</option>
                <option value="v3">Version 3, checksum</option>
              </select>
            </label>
            <label className="choice">
              <input type="checkbox" checked={allRegions} disabled={busy} onChange={(event) => setAllRegions(event.target.checked)} />
              All regions
            </label>
            <p className="hint">Custom refund rule: {config.custom_rule.deployed ? "on the guard server" : "not deployed yet"}.</p>
          </div>

          <div className="scenario-bar" role="listbox" aria-label="Examples">
            {config.examples.map((item) => (
              <button
                key={item.id}
                type="button"
                className={active === item.id ? "is-active" : ""}
                onClick={() => run(item.id)}
                disabled={busy}
              >
                <span>{item.area}</span>
                {item.title}
              </button>
            ))}
          </div>

          <div className="card simulation" aria-live="polite">
            <div className="stations">
              <Station name="System agents" detail="Writes the draft" state={frame.agents} started={started} />
              <Station name="Guard server" detail="Applies the policies" state={frame.guard} started={started} />
              <Station name={judgeName} detail="Reads the rules and answers yes or no" state={frame.judge} started={started} />
            </div>
            <p className="simulation-caption">{frame.caption}</p>
          </div>

          <div className="card thread" aria-label="Conversation">
            {turns.length === 0 && <p className="hint">The example you choose appears here as a customer message. The assistant answers after the path above finishes.</p>}
            {turns.map((turn) => (
              <div key={turn.key} className="exchange">
                <div className="bubble bubble-user">
                  <span className="who">Customer</span>
                  <p>{turn.query}</p>
                </div>
                <div className="bubble bubble-assistant">
                  <span className="who">Assistant</span>
                  {turn.phase === "waiting" && <p className="typing">Checking the message…</p>}
                  {turn.phase === "failed" && <p>{turn.error}</p>}
                  {turn.phase === "done" && turn.result && <p>{turn.result.guarded_response}</p>}
                </div>
              </div>
            ))}
          </div>

          {latest?.result && (
            <div className="card">
              <h3>Comparison · {latest.title}</h3>
              <p className="hint">{latest.result.area}. {noteFor(latest.result)}</p>
              <div className="compare">
                <div className="compare-col">
                  <h4>Without guardrails</h4>
                  <p>{latest.result.unguarded_response}</p>
                </div>
                <div className="compare-col">
                  <h4>With guardrails</h4>
                  <p>{latest.result.guarded_response}</p>
                </div>
              </div>
              {latest.result.payment?.ledger_before && (
                <table className="ledger">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Before</td>
                      <td>{latest.result.payment.ledger_before.balance}</td>
                    </tr>
                    <tr>
                      <td>Without guardrails</td>
                      <td>{latest.result.payment.ledger_unguarded?.balance}</td>
                    </tr>
                    <tr>
                      <td>With guardrails</td>
                      <td>{latest.result.payment.ledger_guarded?.balance}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <GuardLog logs={logs} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
    </section>
  );
}

function noteFor(result: UseCaseResult) {
  if (result.path === "input_blocked") return "Stopped on the way in. The agents did not write a guarded answer.";
  if (result.path === "output_caught") return "The draft was caught on the way out.";
  if (result.path === "payment_blocked") return "The payment was stopped. The guarded ledger did not change.";
  if (result.path === "payment_allowed") return "The payment was allowed.";
  if (result.path === "refund_pending") return "The custom rule is not on the guard server yet, so this draft is allowed.";
  if (result.path === "error") return "The guard server did not answer.";
  return "The draft was allowed.";
}

function Station({ name, detail, state, started }: { name: string; detail: string; state: StationState; started: boolean }) {
  const label =
    state === "running" ? "Working" :
    state === "clear" ? "Clear" :
    state === "blocked" ? "Stopped" :
    state === "skipped" ? "Not used" :
    state === "error" ? "No answer" :
    started ? "Not called" :
    "Waiting";
  return (
    <article className={`station is-${state}`}>
      <header>
        <h3>{name}</h3>
        <span>{label}</span>
      </header>
      <p>{detail}</p>
    </article>
  );
}

function GuardLog({
  logs,
  selectedId,
  onSelect,
}: {
  logs: GuardLogEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = logs.find((item) => item.id === selectedId) || null;
  return (
    <aside className="card log-panel">
      {selected ? (
        <div className="stack">
          <button className="btn-link" type="button" onClick={() => onSelect("")}>Back to the log</button>
          <h3>Guardrail log</h3>
          <dl className="log-detail">
            <div>
              <dt>ID</dt>
              <dd>{selected.id}</dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>{selected.created}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{SOURCE_LABELS[selected.source] || selected.source}</dd>
            </div>
            <div>
              <dt>Input prompt</dt>
              <dd>{selected.input_prompt}</dd>
            </div>
            <div>
              <dt>Output response</dt>
              <dd>{selected.output_response}</dd>
            </div>
            <div>
              <dt>Violation</dt>
              <dd>{selected.violation === "yes" ? "Yes" : "No"}</dd>
            </div>
            {selected.violation === "yes" && (
              <div>
                <dt>Reason</dt>
                <dd>{selected.reason}</dd>
              </div>
            )}
          </dl>
        </div>
      ) : (
        <div className="stack">
          <h3>Guardrail log</h3>
          <p className="hint">Each compliance test and each custom-rule sentence is saved here.</p>
          {logs.length === 0 && <p className="hint">No checks have been recorded yet.</p>}
          <ul className="log-list">
            {logs.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onSelect(item.id)}>
                  <span className={item.violation === "yes" ? "pill pill-stop" : "pill"}>
                    {item.violation === "yes" ? "Violation" : "Clear"}
                  </span>
                  <strong>{item.id}</strong>
                  <span>{SOURCE_LABELS[item.source] || item.source} · {item.created}</span>
                  <em>{item.input_prompt}</em>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

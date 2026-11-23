import type { CheckInfo, UseCaseResult } from "../api/demo";
import { checkLabel, seconds } from "../copy";
import type { Playback } from "../state/usePlayback";

type StepState = "pending" | "checking" | "passed" | "stopped" | "risky" | "skipped" | "error";

interface Step {
  id: string;
  name: string;
  sub: string;
  guard: boolean;
  state: StepState;
  ms?: number;
  note?: string;
}

const BASE: Omit<Step, "state">[] = [
  { id: "customer", name: "Customer", sub: "Sends a message", guard: false },
  { id: "input", name: "Input check", sub: "Reads the question", guard: true },
  { id: "agents", name: "AI assistant", sub: "Drafts a reply", guard: false },
  { id: "payment", name: "Payment check", sub: "Approves transfers", guard: true },
  { id: "output", name: "Output check", sub: "Reads the draft", guard: true },
  { id: "reply", name: "Reply", sub: "What the customer sees", guard: false },
];

const STATE_TEXT: Record<StepState, string> = {
  pending: "",
  checking: "Checking",
  passed: "Passed",
  stopped: "Stopped",
  risky: "Risky reply sent",
  skipped: "Skipped",
  error: "Error",
};

function checkState(info: CheckInfo | undefined): StepState {
  if (!info) return "skipped";
  if (info.error) return "error";
  return info.blocked ? "stopped" : "passed";
}

function checkNote(info: CheckInfo | undefined): string {
  if (!info || info.error) return "";
  return info.model_call ? "" : checkLabel(info);
}

/** The six steps in execution order, from what the backend returned. */
export function buildSteps(result: UseCaseResult): Step[] {
  const stoppedAtInput = result.path === "input_blocked" || result.error_step === "input";
  const outputRan = Boolean(result.output && Object.keys(result.output).length > 0);
  const payment = result.payment;
  const states: Record<string, StepState> = {
    customer: "passed",
    input: checkState(result.input),
    agents: stoppedAtInput ? "skipped" : result.error_step === "agents" ? "error" : "passed",
    payment: !payment || stoppedAtInput ? "skipped" : payment.error ? "error" : payment.allowed ? "passed" : "stopped",
    output: outputRan ? checkState(result.output) : "skipped",
    reply: "skipped",
  };
  if (result.outcome === "gap") states.reply = "risky";
  else if (result.path === "output_caught" || result.path === "happy" || result.path === "payment_allowed") states.reply = "passed";
  const notes: Record<string, string> = {
    input: checkNote(result.input),
    output: outputRan ? checkNote(result.output) : "",
    agents: stoppedAtInput
      ? ""
      : result.draft_source === "scripted"
        ? "Scripted test draft"
        : result.draft_source === "test_prompt"
          ? "Answer model with a test prompt"
          : "",
    payment: payment && !stoppedAtInput ? "Demo ledger rule, no model" : "",
  };
  const ms: Record<string, number | undefined> = {
    input: result.timings_ms.input,
    agents: result.draft_source === "scripted" ? undefined : result.timings_ms.agents,
    payment: result.timings_ms.payment,
    output: result.timings_ms.output,
  };
  return BASE.map((step) => ({ ...step, state: states[step.id], note: notes[step.id], ms: ms[step.id] }));
}

export function Pipeline({ result, playback }: { result: UseCaseResult | null; playback: Playback }) {
  const final = result ? buildSteps(result) : BASE.map((step) => ({ ...step, state: "pending" as StepState }));
  const shown: Step[] = final.map((step, index) => {
    const hidden = { ms: undefined, note: "" };
    if (index < playback.revealed) return result ? step : { ...step, ...hidden, state: "passed" };
    if (index === playback.checking) {
      return { ...step, ...hidden, state: result && step.state === "skipped" ? "skipped" : "checking" };
    }
    return { ...step, ...hidden, state: "pending" };
  });

  const arrowState = (index: number): string => {
    const from = final[index];
    const to = final[index + 1];
    const dead =
      Boolean(result) &&
      (to.state === "skipped" || from.state === "stopped" || from.state === "error" || from.state === "skipped");
    if (index + 1 < playback.revealed) return dead ? "dead" : "done";
    if (index + 1 === playback.checking) return dead ? "dead" : "active";
    return "idle";
  };

  return (
    <div className="pipeline">
      <div className="lanes" aria-hidden="true">
        <span className="lane">Customer</span>
        <span className="lane lane-guard">Guard server</span>
        <span className="lane">AI</span>
        <span className="lane lane-guard lane-wide">Guard server</span>
        <span className="lane">Customer</span>
      </div>
      <ol className="steps-row">
        {shown.map((step, index) => (
          <li key={step.id} className={`pstep pstep-${step.state}`}>
            <div className="pstep-track">
              <span className={`pnode ${step.guard ? "pnode-guard" : ""}`} aria-hidden="true">
                {step.state === "stopped" || step.state === "error" ? "✕" : step.state === "risky" ? "!" : index + 1}
              </span>
              {index < shown.length - 1 && <span className={`parrow parrow-${arrowState(index)}`} aria-hidden="true" />}
            </div>
            <strong className="pstep-name">{step.name}</strong>
            <span className="pstep-sub">{step.sub}</span>
            <span className="pstep-state">
              {STATE_TEXT[step.state]}
              {step.ms !== undefined && step.state !== "pending" && step.state !== "checking" && step.state !== "skipped" && (
                <span className="pstep-ms"> · {seconds(step.ms)}</span>
              )}
            </span>
            {step.note && step.state !== "pending" && step.state !== "skipped" && <span className="pstep-note">{step.note}</span>}
          </li>
        ))}
      </ol>
      <div className="legend">
        <span><span className="legend-circle" aria-hidden="true" /> Step, in order</span>
        <span><span className="legend-square" aria-hidden="true" /> Guard server check</span>
        <span>Arrows turn green as the request moves on</span>
      </div>
    </div>
  );
}

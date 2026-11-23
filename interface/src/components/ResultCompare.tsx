import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LiveAnswer, UseCaseResult } from "../api/demo";
import { checkLabel, decisiveJudge, judgedBy, money, seconds } from "../copy";
import { navigate, useDemo } from "../state/DemoContext";
import { type Playback, typed } from "../state/usePlayback";

interface ClampedProps {
  text: string;
  lines: 2 | 6;
  count?: number;
  className?: string;
}

function ClampedText({ text, lines, count, className }: ClampedProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const typing = count !== undefined && count < text.length;
  const shown = count === undefined ? text : typed(text, count);

  useEffect(() => setOpen(false), [text]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [shown, open]);

  return (
    <>
      <p ref={ref} className={[className, open ? "" : `clamp-${lines}`].filter(Boolean).join(" ")}>
        {shown}
        {typing && <span className="caret" aria-hidden="true" />}
      </p>
      {!typing && (overflows || open) && (
        <button type="button" className="btn-link" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Show full answer"}
        </button>
      )}
    </>
  );
}

function LiveAnswerBox({ live }: { live: LiveAnswer }) {
  let chip = { text: "Output check: Allowed", tone: "good" };
  if (live.error) chip = { text: "Error", tone: "critical" };
  else if (live.shown_only) chip = { text: "Shown only", tone: "neutral" };
  else if (live.output?.blocked) chip = { text: "Output check: Blocked", tone: "critical" };
  return (
    <div className="live-box">
      <div className="live-box-head">
        <span>Live AI answer, not scripted</span>
        <span className={`tag tag-${chip.tone}`}>{chip.text}</span>
      </div>
      {live.error ? (
        <p className="error-text">{live.error}</p>
      ) : (
        <ClampedText text={live.text} lines={2} className="live-text" />
      )}
      <p className="micro">
        {[live.timings_ms.agents !== undefined && `Answer model ${seconds(live.timings_ms.agents)}`, live.timings_ms.output !== undefined && `output check ${seconds(live.timings_ms.output)}`]
          .filter(Boolean)
          .join(" · ")}
        {live.output?.judge && ` · ${judgedBy(live.output.judge)}`}
      </p>
    </div>
  );
}

function Balance({ before, after }: { before?: number; after?: number }) {
  if (before === undefined || after === undefined) return null;
  return (
    <p className="balance">
      Balance: <strong>{money(before)}</strong> {before === after ? ", unchanged" : <>to <strong>{money(after)}</strong></>}
      <span className="tag tag-neutral">Demo ledger</span>
    </p>
  );
}

function reasonFor(result: UseCaseResult): string {
  if (result.outcome === "error") return result.error;
  if (result.path === "input_blocked") {
    const names = (result.input.entities || []).map((item) => item.label).join(", ");
    if (names) return `The input check found personal data (${names}). ${checkLabel(result.input)}.`;
    if (result.input.detector === "nemo_pii") {
      return `The input check found personal details, such as a name, place, or crypto wallet. ${checkLabel(result.input)}.`;
    }
    return `The input check stopped the question${result.input.rule_name ? ` under the ${result.input.rule_name} policy` : ""}. No answer was written.`;
  }
  if (result.path === "payment_blocked") return `The payment check stopped the transfer. ${result.payment?.reason || ""}`.trim();
  if (result.path === "output_caught") {
    if (result.output.detector === "nemo_pii") {
      return `The output check stopped the draft because it contains personal details, such as a name or crypto wallet. ${checkLabel(result.output)}.`;
    }
    const how = result.output.rewrite ? "replaced the draft with the safe reply" : "stopped the draft";
    return `The output check ${how}${result.output.rule_name ? ` under the ${result.output.rule_name} policy` : ""}.`;
  }
  if (result.outcome === "gap") return "No check stopped this reply, so the risky draft reached the customer.";
  if (result.path === "payment_allowed") return `The payment check allowed the transfer. ${result.payment?.reason || ""}`.trim();
  return "No check stopped this request.";
}

function Typed({ text, count, className }: { text: string; count: number; className?: string }) {
  const typing = count < text.length;
  return (
    <p className={className}>
      {typed(text, count)}
      {typing && <span className="caret" aria-hidden="true" />}
    </p>
  );
}

interface CompareProps {
  query: string;
  result: UseCaseResult | null;
  playback: Playback;
  onRunAgain: () => void;
}

export function ResultCompare({ query, result, playback, onRunAgain }: CompareProps) {
  const { openAudit } = useDemo();
  const customerBubble = (
    <div className="bubble bubble-customer">
      <span className="who">Customer</span>
      <Typed text={query} count={playback.customer} />
    </div>
  );
  const waiting = playback.customer >= query.length && !result && !playback.done && (
    <p className="bubble bubble-waiting">Waiting for the real reply…</p>
  );

  if (!result) {
    return (
      <div className="compare-wrap">
        <div className="compare-grid">
          <section className="side side-without">
            <h4>Without guardrails</h4>
            {customerBubble}
            {waiting}
          </section>
          <section className="side side-with">
            <h4>With guardrails</h4>
            {customerBubble}
            {waiting}
          </section>
        </div>
      </div>
    );
  }

  const payment = result.payment;
  const scripted = result.draft_source === "scripted";
  const testPrompt = result.draft_source === "test_prompt";
  const decisive = decisiveJudge(result);
  const flagged = (result.input?.entities || []).map((item) => item.label).join(", ");
  const guardedFailed = result.outcome === "error";
  const draftText = result.unguarded_error || result.unguarded_response;
  const draftDone = playback.draft >= draftText.length;
  const done = playback.done;

  return (
    <div className="compare-wrap">
      <div className="compare-grid">
        <section className="side side-without">
          <h4>Without guardrails</h4>
          {customerBubble}
          {playback.draft > 0 ? (
            <div className="bubble bubble-assistant">
              <span className="who">
                {scripted || testPrompt ? (
                  <>
                    Assistant <span className="tag tag-neutral">{scripted ? "Scripted test draft" : "Draft from a test prompt"}</span>
                  </>
                ) : (
                  "Assistant, live AI answer"
                )}
              </span>
              {result.unguarded_error ? (
                <Typed text={draftText} count={playback.draft} className="error-text" />
              ) : (
                <ClampedText text={draftText} count={playback.draft} lines={6} />
              )}
              {testPrompt && draftDone && result.draft_prompt && (
                <details className="test-prompt">
                  <summary>Test instructions given to the answer model</summary>
                  <p className="micro">{result.draft_prompt}</p>
                </details>
              )}
            </div>
          ) : (
            !done && <p className="bubble bubble-waiting">The assistant is writing…</p>
          )}
          {(scripted || testPrompt) && result.live_answer && draftDone && playback.revealed >= 3 && <LiveAnswerBox live={result.live_answer} />}
          {payment && playback.revealed >= 4 && (
            <Balance before={payment.ledger_before?.balance} after={payment.ledger_unguarded?.balance} />
          )}
        </section>

        <section className="side side-with">
          <h4>With guardrails</h4>
          {customerBubble}
          {guardedFailed && done && (
            <div className="bubble bubble-error">
              <span className="who">No reply</span>
              <p className="error-text">{result.error}</p>
              <button type="button" className="btn-link" onClick={() => navigate("setup")}>
                Open Setup
              </button>
            </div>
          )}
          {!guardedFailed && playback.reply > 0 && (
            <div className="bubble bubble-assistant">
              <span className="who">Assistant</span>
              <ClampedText text={result.guarded_response} count={playback.reply} lines={6} />
            </div>
          )}
          {!done && playback.reply === 0 && <p className="bubble bubble-waiting">Checking before anything reaches the customer…</p>}
          {payment && !payment.error && done && (
            <Balance before={payment.ledger_before?.balance} after={payment.ledger_guarded?.balance} />
          )}
        </section>
      </div>

      {!done ? null : <ResultFooter result={result} decisive={decisive} flagged={flagged} onRunAgain={onRunAgain} openAudit={openAudit} />}
    </div>
  );
}

interface FooterProps {
  result: UseCaseResult;
  decisive: ReturnType<typeof decisiveJudge>;
  flagged: string;
  onRunAgain: () => void;
  openAudit: (logId: string) => void;
}

function ResultFooter({ result, decisive, flagged, onRunAgain, openAudit }: FooterProps) {
  return (
    <>
      {result.outcome === "gap" && (
        <div className="gap-cta">
          {result.custom ? (
            <>
              <p>
                <strong>No policy covers this yet.</strong> Write a custom policy, test it, and deploy it to the guard server.
              </p>
              <button type="button" className="btn btn-gap" onClick={() => navigate("policies")}>
                Close this gap
              </button>
            </>
          ) : (
            <p>
              <strong>Not covered by a policy yet.</strong> The real checks allowed a reply this test expected to be stopped.
            </p>
          )}
        </div>
      )}
      {result.outcome === "overblock" && (
        <div className="gap-cta">
          <p>
            <strong>Stopped by mistake.</strong> This test expected the request to be allowed.{" "}
            {flagged
              ? `The pattern check read part of it as ${flagged}.`
              : result.input?.detector === "nemo_pii" || result.output?.detector === "nemo_pii"
                ? "NeMo's PII extension read part of it as a name, place, or crypto wallet."
                : decisive
                ? "The judge is a model, so its verdict can vary between runs."
                : ""}
          </p>
          <button type="button" className="btn" onClick={onRunAgain}>
            Run again
          </button>
        </div>
      )}

      <div className="compare-foot">
        <div>
          <p>{reasonFor(result)}</p>
          {decisive && <p className="micro">{judgedBy(decisive)}{decisive.answered_by ? ` · judge ${seconds(decisive.latency_ms)}` : ""}</p>}
          {result.timings_ms.total !== undefined && <p className="micro">Whole request {seconds(result.timings_ms.total)}, measured on the server.</p>}
        </div>
        {result.log_id && (
          <button type="button" className="btn-link link-strong" onClick={() => openAudit(result.log_id)}>
            Open audit record {result.log_id}
          </button>
        )}
      </div>
    </>
  );
}

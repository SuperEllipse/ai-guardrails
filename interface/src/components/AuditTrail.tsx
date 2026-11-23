import { useEffect, useMemo, useRef, useState } from "react";
import { demoApi, type GuardLogEntry } from "../api/demo";
import { judgedBy, localTime, seconds, STAGE_LABELS } from "../copy";
import { useDemo } from "../state/DemoContext";

type Filter = "all" | "blocked" | "allowed" | "policy" | "error";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All records" },
  { id: "blocked", label: "Blocked" },
  { id: "allowed", label: "Allowed" },
  { id: "policy", label: "Policy tests" },
  { id: "error", label: "Errors" },
];

function isPolicyTest(row: GuardLogEntry): boolean {
  return row.source === "custom_rule" || row.stage === "policy_test";
}

function testName(row: GuardLogEntry): string {
  if (row.title) return row.title;
  return isPolicyTest(row) ? "Policy test" : "Earlier record";
}

function Verdict({ row }: { row: GuardLogEntry }) {
  if (row.violation === "error") return <span className="tag tag-critical">Error</span>;
  if (isPolicyTest(row)) return row.violation === "yes" ? <span className="tag tag-critical">Stopped</span> : <span className="tag tag-good">Allowed</span>;
  return row.violation === "yes" ? <span className="tag tag-critical">Blocked</span> : <span className="tag tag-good">Allowed</span>;
}

const OUTCOME_TEXT: Record<string, string> = {
  as_expected: "As expected",
  gap: "Gap found",
  overblock: "Stopped by mistake",
  not_expected: "Not expected",
  error: "Error",
};

const LIVE_VERDICT_TEXT: Record<string, string> = {
  allow: "Output check: Allowed",
  block: "Output check: Blocked",
  shown_only: "Shown only",
  error: "Error",
};

export function AuditTrail() {
  const { auditTarget, config } = useDemo();
  const [rows, setRows] = useState<GuardLogEntry[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(auditTarget);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const selectedRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    demoApi
      .logs()
      .then((data) => {
        setRows(data);
        setSelected((current) => current || data[0]?.id || "");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (auditTarget) setSelected(auditTarget);
  }, [auditTarget]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selected, rows]);

  const shown = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === "blocked") return !isPolicyTest(row) && row.violation === "yes";
        if (filter === "allowed") return !isPolicyTest(row) && row.violation === "no";
        if (filter === "policy") return isPolicyTest(row);
        if (filter === "error") return row.violation === "error";
        return true;
      }),
    [rows, filter],
  );
  const detail = rows.find((row) => row.id === selected);
  const regionLabel = (id: string | null) => config.regions.find((item) => item.id === id)?.label || id || "";

  return (
    <div className="stack">
      <section className="card row-card">
        <p>
          <strong>Audit trail</strong> <span className="hint">Every guard decision and every policy test, ready for a compliance reviewer.</span>
        </p>
        <label className="inline-field">
          <span>Show</span>
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            {FILTERS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
      </section>

      {error && <p className="banner banner-critical">{error}</p>}

      <section className="card table-card">
        {loading && <p className="hint">Loading records…</p>}
        {!loading && shown.length === 0 && <p className="empty">No records yet. Run a test on the live screen or test a custom policy.</p>}
        {shown.length > 0 && (
          <div className="table-scroll">
            <table className="table table-select">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Test</th>
                  <th>Risk area</th>
                  <th>Check</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr
                    key={row.id}
                    ref={row.id === selected ? selectedRef : undefined}
                    className={row.id === selected ? "is-selected" : ""}
                    onClick={() => setSelected(row.id)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(row.id)}
                    aria-selected={row.id === selected}
                  >
                    <td>{localTime(row.created)}</td>
                    <td>{testName(row)}</td>
                    <td>{row.area || ""}</td>
                    <td>{isPolicyTest(row) ? "Policy test" : STAGE_LABELS[row.stage || ""] || ""}</td>
                    <td><Verdict row={row} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail && (
        <section className="card">
          <dl className="detail-list">
            <dt>Record</dt>
            <dd className="mono">{detail.id}</dd>
            <dt>Time</dt>
            <dd>{detail.created}</dd>
            {detail.area && (<><dt>Risk area</dt><dd>{detail.area}</dd></>)}
            {detail.region && (<><dt>Region</dt><dd>{regionLabel(detail.region)}</dd></>)}
            <dt>Input</dt>
            <dd>{detail.input_prompt}</dd>
            {detail.draft && (
              <>
                <dt>{detail.draft_source === "scripted" ? "Scripted test draft" : "Live AI draft"}</dt>
                <dd>{detail.draft}</dd>
              </>
            )}
            <dt>Reply sent</dt>
            <dd>{detail.output_response || (detail.violation === "error" ? "No reply was delivered." : "")}</dd>
            {detail.outcome && (<><dt>Against the expected result</dt><dd>{OUTCOME_TEXT[detail.outcome] || detail.outcome}</dd></>)}
            {detail.reason && (<><dt>Reason</dt><dd className={detail.violation === "error" ? "error-text" : ""}>{detail.reason}</dd></>)}
            {detail.judge && (<><dt>Judge</dt><dd>{judgedBy(detail.judge)}</dd></>)}
            {detail.timings && (
              <>
                <dt>Measured</dt>
                <dd>
                  {Object.entries(detail.timings)
                    .map(([step, ms]) => `${step} ${seconds(ms)}`)
                    .join(" · ")}
                </dd>
              </>
            )}
            {detail.live_answer && (
              <>
                <dt>Live AI answer, not scripted</dt>
                <dd>
                  {detail.live_verdict && <span className={`tag ${detail.live_verdict === "block" || detail.live_verdict === "error" ? "tag-critical" : detail.live_verdict === "allow" ? "tag-good" : "tag-neutral"}`}>{LIVE_VERDICT_TEXT[detail.live_verdict] || detail.live_verdict}</span>}{" "}
                  {detail.live_answer}
                </dd>
              </>
            )}
            {detail.error && detail.error !== detail.reason && (<><dt>Error</dt><dd className="error-text">{detail.error}</dd></>)}
          </dl>
        </section>
      )}
    </div>
  );
}

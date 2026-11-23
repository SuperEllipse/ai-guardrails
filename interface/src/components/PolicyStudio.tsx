import { useState } from "react";
import { demoApi, type CustomRule, type ReloadResult, type TestRow } from "../api/demo";
import { judgedBy, seconds } from "../copy";
import { navigate, useDemo } from "../state/DemoContext";

type ItemState = "pending" | "doing" | "done" | "failed";

const DEPLOY_ITEMS = ["Save the policy file", "Copy it to the guard server", "Reload the guard server", "Policy is live"];
const GAP_EXAMPLE = "refund";

function Dot({ state }: { state: ItemState }) {
  return <span className={`item-dot item-${state}`} aria-hidden="true" />;
}

export function PolicyStudio() {
  const { config, refreshConfig, results, requestRun } = useDemo();
  const [rule, setRule] = useState<CustomRule>(config.custom_rule);
  const [dirty, setDirty] = useState(false);
  const [tests, setTests] = useState<TestRow[] | null>(null);
  const [testPassed, setTestPassed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [deploy, setDeploy] = useState<ItemState[]>(() => DEPLOY_ITEMS.map(() => "pending"));
  const [reload, setReload] = useState<ReloadResult | null>(null);

  const saved = config.custom_rule;
  const gapExample = config.examples.find((item) => item.id === GAP_EXAMPLE);
  const gapResult = results[GAP_EXAMPLE];
  const status = saved.deployed ? (saved.deployed_current && !dirty ? "Live" : "Changes not deployed") : "Not deployed";

  const edit = (next: CustomRule) => {
    setRule(next);
    setDirty(true);
    setTests(null);
    setTestPassed(false);
  };

  const testRule = async () => {
    setBusy("test");
    setError("");
    try {
      await demoApi.saveRule({
        policy: rule.policy,
        message_default: rule.message_default,
        message_au: rule.message_au,
        message_sg: rule.message_sg,
        should_block: rule.should_block.filter((line) => line.trim()),
        should_pass: rule.should_pass.filter((line) => line.trim()),
      });
      const next = await refreshConfig();
      setRule(next.custom_rule);
      setDirty(false);
      const result = await demoApi.testRule();
      setTests(result.results);
      setTestPassed(result.passed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The test could not run.");
    } finally {
      setBusy("");
    }
  };

  const deployRule = async () => {
    setBusy("deploy");
    setError("");
    setReload(null);
    setDeploy(["done", "doing", "doing", "pending"]);
    try {
      const result = await demoApi.deployRule();
      setReload(result.reload);
      setDeploy(result.reload.reloaded ? ["done", "done", "done", "done"] : ["done", "done", "failed", "pending"]);
      await refreshConfig();
    } catch (err) {
      setDeploy(["done", "failed", "pending", "pending"]);
      setError(err instanceof Error ? err.message : "Deploy failed.");
    } finally {
      setBusy("");
    }
  };

  const undeploy = async () => {
    setBusy("undeploy");
    setError("");
    try {
      const result = await demoApi.undeployRule();
      setReload(result.reload);
      setDeploy(DEPLOY_ITEMS.map(() => "pending"));
      await refreshConfig();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the policy.");
    } finally {
      setBusy("");
    }
  };

  const live = saved.deployed && saved.deployed_current && !dirty;
  const gapClosed = live && gapResult?.path === "output_caught";
  const progress = [
    Boolean(rule.policy.trim()),
    Boolean(rule.message_default.trim()),
    testPassed,
    live,
    gapClosed,
  ];
  const currentStep = progress.findIndex((done) => !done);
  const stepTitles = ["Write the rule", "Set the safe reply", "Test with examples", "Deploy to guard server", "Run the gap test again"];
  const deployStates: ItemState[] = live && deploy.every((item) => item === "pending") ? DEPLOY_ITEMS.map(() => "done") : deploy;

  return (
    <div className="stack">
      <section className="card">
        <h2 className="card-heading">Custom policy studio</h2>
        <p className="hint">
          Write a rule in plain English, choose what the customer hears instead, prove it with example sentences, then
          deploy it to the guard server. No code release.
        </p>
        <div className="inline-row">
          <label className="inline-field">
            <span>Policy</span>
            <select className="select">
              <option>{saved.name}</option>
              <option disabled>New policy (coming soon)</option>
            </select>
          </label>
          <span className={`tag ${status === "Live" ? "tag-good" : status === "Not deployed" ? "tag-neutral" : "tag-warning"}`}>{status}</span>
        </div>
      </section>

      <ol className="progress-steps">
        {stepTitles.map((title, index) => (
          <li key={title} className={progress[index] ? "is-done" : index === currentStep ? "is-current" : ""}>
            <span className="step-dot">{progress[index] ? "✓" : index + 1}</span>
            {title}
          </li>
        ))}
      </ol>

      {error && (
        <p className="banner banner-critical">
          {error}{" "}
          <button type="button" className="btn-link" onClick={() => navigate("setup")}>
            Open Setup
          </button>
        </p>
      )}

      <div className="studio-grid">
        <div className="stack">
          <section className="card">
            <h3 className="numbered"><span className="step-dot">1</span>Write the rule</h3>
            <label className="field">
              <span>Policy name</span>
              <input className="input" value={rule.name} readOnly />
            </label>
            <label className="field">
              <span>Rule, in plain English. The judge reads this and answers yes or no.</span>
              <textarea className="textarea" rows={4} value={rule.policy} onChange={(e) => edit({ ...rule, policy: e.target.value })} />
            </label>
            <div className="field">
              <span>Check at</span>
              <div className="inline-row">
                <label className="check">
                  <input type="checkbox" checked disabled /> Output check (the AI's draft)
                </label>
                <label className="check">
                  <input type="checkbox" disabled /> Input check (the customer's message)
                </label>
              </div>
            </div>
          </section>

          <section className="card">
            <h3 className="numbered"><span className="step-dot">2</span>Set the safe reply</h3>
            <p className="hint">When the rule fires, the risky sentence is replaced with this reply. Regions with their own wording get their own sentence.</p>
            <div className="three-up">
              <label className="field">
                <span>Default</span>
                <textarea className="textarea" rows={4} value={rule.message_default} onChange={(e) => edit({ ...rule, message_default: e.target.value })} />
              </label>
              <label className="field">
                <span>Australia</span>
                <textarea className="textarea" rows={4} value={rule.message_au} onChange={(e) => edit({ ...rule, message_au: e.target.value })} />
              </label>
              <label className="field">
                <span>Singapore</span>
                <textarea className="textarea" rows={4} value={rule.message_sg} onChange={(e) => edit({ ...rule, message_sg: e.target.value })} />
              </label>
            </div>
          </section>

          <section className="card">
            <h3 className="numbered"><span className="step-dot">3</span>Test with example sentences</h3>
            <p className="hint">
              List sentences the AI might write. Each one is sent to the configured judge. Deploy unlocks only when every
              sentence behaves as expected.
            </p>
            <div className="two-up">
              <label className="field">
                <span>Should be stopped, one per line</span>
                <textarea className="textarea" rows={4} value={rule.should_block.join("\n")} onChange={(e) => edit({ ...rule, should_block: e.target.value.split("\n") })} />
              </label>
              <label className="field">
                <span>Should be allowed, one per line</span>
                <textarea className="textarea" rows={4} value={rule.should_pass.join("\n")} onChange={(e) => edit({ ...rule, should_pass: e.target.value.split("\n") })} />
              </label>
            </div>
            <div className="inline-row">
              <button type="button" className="btn btn-primary" onClick={testRule} disabled={busy !== ""}>
                {busy === "test" ? "Testing…" : "Test rule"}
              </button>
              <span className="hint">{tests ? (testPassed ? "Passed." : "Failed.") : dirty ? "Edited. Test again before deploying." : "Not tested yet."}</span>
            </div>
            {tests && (
              <>
                <p className={`banner ${testPassed ? "banner-good" : "banner-critical"}`}>
                  {testPassed
                    ? "Every sentence behaved as expected. Deploy is now available. Each result was saved to the audit trail."
                    : "At least one sentence did not behave as expected, or the judge did not answer. Deploy stays locked."}
                </p>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Sentence</th>
                      <th>Expected</th>
                      <th>Result</th>
                      <th>Judged by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tests.map((row) => (
                      <tr key={`${row.expected}-${row.sentence}`}>
                        <td>{row.sentence}</td>
                        <td>{row.expected === "block" ? "Stop" : "Allow"}</td>
                        <td>
                          {row.actual === "error" ? (
                            <span className="tag tag-critical" title={row.message}>Error</span>
                          ) : (
                            <span className={`tag ${row.ok ? "tag-good" : "tag-critical"}`}>
                              {row.actual === "block" ? "Stop" : "Allow"}, {row.ok ? "as expected" : "not expected"}
                            </span>
                          )}
                          {row.actual === "error" && <p className="error-text micro">{row.message}</p>}
                        </td>
                        <td className="micro">
                          {judgedBy(row.judge)} · {seconds(row.elapsed_ms)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <section className="card">
            <h3 className="numbered"><span className="step-dot">4</span>Deploy to the guard server</h3>
            <p className="hint">Copies the policy onto the guard server and reloads it. From then on, every output check applies this rule.</p>
            <ul className="item-list">
              {DEPLOY_ITEMS.map((label, index) => (
                <li key={label}>
                  <Dot state={deployStates[index]} />
                  {label}
                </li>
              ))}
            </ul>
            {reload && !reload.reloaded && <p className="banner banner-critical">{reload.detail || "The guard server did not reload."}</p>}
            <div className="inline-row">
              <button type="button" className="btn btn-primary" onClick={deployRule} disabled={!testPassed || dirty || busy !== ""}>
                {busy === "deploy" ? "Deploying…" : "Deploy"}
              </button>
              <button type="button" className="btn" onClick={undeploy} disabled={!saved.deployed || busy !== ""}>
                {busy === "undeploy" ? "Removing…" : "Remove from server"}
              </button>
              <span className="hint">{saved.deployed ? (live ? "Live on the guard server." : "The server has an older version.") : "Not on the guard server."}</span>
            </div>
          </section>

          <section className="card">
            <h3 className="numbered"><span className="step-dot">5</span>Run the gap test again</h3>
            <p className="hint">Send the same customer message through the live pipeline and confirm the gap is closed.</p>
            <div className="inline-row">
              <button type="button" className="btn btn-primary" onClick={() => requestRun(GAP_EXAMPLE)} disabled={busy !== ""}>
                Run the gap test again
              </button>
              <span className="hint">
                {gapResult
                  ? gapResult.path === "output_caught"
                    ? "Last run: blocked at the output check."
                    : gapResult.outcome === "error"
                      ? "Last run: error."
                      : "Last run: the reply got through."
                  : "Not run yet."}
              </span>
            </div>
          </section>
        </div>

        <aside className="stack studio-side">
          {gapExample && (
            <section className="card">
              <h3>The gap this policy closes</h3>
              <div className="bubble bubble-customer">
                <span className="who">Customer</span>
                <p>{gapExample.query}</p>
              </div>
              <div className="bubble bubble-assistant">
                <span className="who">
                  AI draft <span className="tag tag-neutral">Scripted test draft</span>
                </span>
                <p>{gapExample.draft}</p>
              </div>
              <p className="hint">{gapExample.note}</p>
            </section>
          )}
          <section className="card">
            <h3>Before and after</h3>
            <p className="ba">
              <span className="tag tag-warning">Before</span> The draft reaches the customer unchanged.
            </p>
            <p className="ba">
              <span className="tag tag-critical">After</span> The output check replaces the sentence with the safe reply for the customer's region.
            </p>
          </section>
          <details className="card">
            <summary>
              <strong>Built-in policies ({config.policies.filter((item) => item.id !== saved.id).length})</strong>
            </summary>
            <ul className="plain-list">
              {config.policies
                .filter((item) => item.id !== saved.id)
                .map((item) => (
                  <li key={item.id}>{item.label}</li>
                ))}
            </ul>
          </details>
        </aside>
      </div>
    </div>
  );
}

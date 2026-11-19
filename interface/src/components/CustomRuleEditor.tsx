import { useState } from "react";
import { demoApi, type CustomRule, type DemoConfig, type TestRow } from "../api/demo";

export function CustomRuleEditor({
  rule,
  setRule,
  onChange,
}: {
  rule: CustomRule;
  setRule: (next: CustomRule) => void;
  onChange: (next: DemoConfig) => void;
}) {
  const [tests, setTests] = useState<TestRow[] | null>(null);
  const [testPassed, setTestPassed] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const edit = (next: CustomRule) => {
    setRule(next);
    setTestPassed(false);
    setTests(null);
  };

  const save = async (next: CustomRule) => {
    setRule(next);
    await demoApi.saveRule({
      policy: next.policy,
      message_default: next.message_default,
      message_au: next.message_au,
      message_sg: next.message_sg,
      should_block: next.should_block,
      should_pass: next.should_pass,
    });
  };

  const testRule = async () => {
    setBusy("test");
    setError("");
    setMessage("");
    try {
      await save(rule);
      const result = await demoApi.testRule();
      setTests(result.results);
      setTestPassed(result.passed);
      setMessage(
        result.passed
          ? "Every example sentence did what the file says. Each sentence was saved in the guardrail log."
          : "At least one sentence did not match. The sentences were still saved in the guardrail log.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The test could not run.");
    } finally {
      setBusy("");
    }
  };

  const deployRule = async () => {
    setBusy("deploy");
    setError("");
    setMessage("");
    try {
      const result = await demoApi.deployRule();
      onChange(await demoApi.config());
      setMessage(
        result.reload.reloaded
          ? "Deployed. Run the refund example again on Compliance / Risks Guardrail Test."
          : result.reload.detail || "The file was copied, but the guard server did not reload.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="stack">
      {error && <p className="banner banner-critical">{error}</p>}
      {message && <p className="banner">{message}</p>}
      <article className="card">
        <header className="endpoint-head">
          <h3>Refund promise</h3>
          <span className="pill">{rule.deployed ? "On the guard server" : "Not deployed"}</span>
        </header>
        <p className="hint">
          Test runs in this app and does not call the guard server. Deploy copies the file onto the server and reloads it. Before deploy, the refund draft is allowed. After deploy, the output check replaces it with the regional sentence.
        </p>
        <label className="field">
          <span>Rule</span>
          <textarea className="input" rows={5} value={rule.policy} onChange={(event) => edit({ ...rule, policy: event.target.value })} />
        </label>
        <label className="field">
          <span>Default sentence</span>
          <textarea className="input" rows={2} value={rule.message_default} onChange={(event) => edit({ ...rule, message_default: event.target.value })} />
        </label>
        <div className="split-fields">
          <label className="field">
            <span>Australia sentence</span>
            <textarea className="input" rows={3} value={rule.message_au} onChange={(event) => edit({ ...rule, message_au: event.target.value })} />
          </label>
          <label className="field">
            <span>Singapore sentence</span>
            <textarea className="input" rows={3} value={rule.message_sg} onChange={(event) => edit({ ...rule, message_sg: event.target.value })} />
          </label>
        </div>
        <div className="split-fields">
          <label className="field">
            <span>Sentences that should be stopped, one per line</span>
            <textarea className="input" rows={5} value={rule.should_block.join("\n")} onChange={(event) => edit({ ...rule, should_block: event.target.value.split("\n") })} />
          </label>
          <label className="field">
            <span>Sentences that should be allowed, one per line</span>
            <textarea className="input" rows={5} value={rule.should_pass.join("\n")} onChange={(event) => edit({ ...rule, should_pass: event.target.value.split("\n") })} />
          </label>
        </div>
        <div className="row-actions">
          <button className="btn btn-primary" type="button" onClick={testRule} disabled={busy !== ""}>
            {busy === "test" ? "Testing…" : "Test"}
          </button>
          <button className="btn" type="button" onClick={deployRule} disabled={!testPassed || busy !== ""}>
            {busy === "deploy" ? "Deploying…" : "Deploy"}
          </button>
        </div>
        {tests && (
          <table>
            <thead>
              <tr>
                <th>Sentence</th>
                <th>Expected</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((row) => (
                <tr key={row.sentence}>
                  <td>{row.sentence}</td>
                  <td>{row.expected}</td>
                  <td>{row.ok ? row.actual : `${row.actual}. ${row.message}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </div>
  );
}

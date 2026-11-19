import { useState, type ReactNode } from "react";
import { demoApi, type DemoConfig, type DemoConnection } from "../api/demo";

type ConnectionDraft = DemoConnection & {
  api_key: string;
  llama_guard_api_key: string;
  nim_api_key: string;
};

const JUDGES = [
  { id: "self_check", label: "LLM as Self Judge" },
  { id: "llama_guard", label: "Llama Guard" },
  { id: "nim", label: "NVIDIA NIM" },
];

export function ServerSettings({
  config,
  connection,
  setConnection,
  onChange,
}: {
  config: DemoConfig;
  connection: ConnectionDraft;
  setConnection: (next: ConnectionDraft) => void;
  onChange: (next: DemoConfig) => void;
}) {
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [probes, setProbes] = useState<Record<string, { ok: boolean; detail: string }>>({});
  const [fileName, setFileName] = useState(
    Object.keys(config.files).find((name) => name.endsWith(".co")) || "",
  );

  const scripts = Object.keys(config.files).filter((name) => name.endsWith(".co"));

  const payload = () => ({
    model: connection.model,
    base_url: connection.base_url,
    api_key: connection.api_key,
    safety_mode: connection.safety_mode,
    llama_guard_base_url: connection.llama_guard_base_url,
    llama_guard_model: connection.llama_guard_model,
    llama_guard_api_key: connection.llama_guard_api_key,
    nim_base_url: connection.nim_base_url,
    nim_model: connection.nim_model,
    nim_api_key: connection.nim_api_key,
    server_url: connection.server_url,
  });

  const save = async (which: string) => {
    setBusy(which);
    setError("");
    setNotice("");
    try {
      const result = await demoApi.saveConnection(payload());
      const next = await demoApi.config();
      onChange(next);
      setConnection({
        ...next.connection,
        api_key: "",
        llama_guard_api_key: "",
        nim_api_key: "",
      });
      setNotice(
        result.reload.reloaded
          ? "Saved. The guard server loaded these settings."
          : `Saved. ${result.reload.detail || "The guard server did not reload."}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy("");
    }
  };

  const test = async (target: string) => {
    setBusy(`test-${target}`);
    setError("");
    try {
      const result = await demoApi.probe({ target, ...payload() });
      setProbes((current) => ({ ...current, [target]: result }));
    } catch (err) {
      setProbes((current) => ({
        ...current,
        [target]: { ok: false, detail: err instanceof Error ? err.message : "The test failed." },
      }));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="stack">
      {error && <p className="banner banner-critical">{error}</p>}
      {notice && <p className="banner banner-good">{notice}</p>}

      <div className="card judge-bar">
        <label className="field">
          <span>Judge used by the guard server</span>
          <select
            className="input"
            value={connection.safety_mode}
            onChange={(event) => setConnection({ ...connection, safety_mode: event.target.value })}
          >
            {JUDGES.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <p className="hint">The rules stay the same. This choice selects which model reads them and answers yes or no. Save on any card stores this choice with the addresses.</p>
      </div>

      <div className="server-grid">
        <EndpointCard
          title="Answer model"
          active={connection.safety_mode === "self_check"}
          activeLabel="Active judge"
          hint="Writes the banking answers. It can also be the judge."
          busy={busy === "answer" || busy === "test-answer"}
          saving={busy === "answer"}
          testing={busy === "test-answer"}
          probe={probes.answer}
          onSave={() => save("answer")}
          onTest={() => test("answer")}
        >
          <Field label="Address" value={connection.base_url} onChange={(value) => setConnection({ ...connection, base_url: value })} />
          <Field label="Model name" value={connection.model} onChange={(value) => setConnection({ ...connection, model: value })} />
          <Field
            label="Token"
            secret
            value={connection.api_key}
            placeholder={config.connection.has_api_key ? "Saved token stays if this is blank" : "Not set"}
            onChange={(value) => setConnection({ ...connection, api_key: value })}
          />
        </EndpointCard>

        <EndpointCard
          title="Llama Guard"
          active={connection.safety_mode === "llama_guard"}
          activeLabel="Active judge"
          hint="Optional judge. The same written rules are sent to this model."
          busy={busy === "llama" || busy === "test-llama_guard"}
          saving={busy === "llama"}
          testing={busy === "test-llama_guard"}
          probe={probes.llama_guard}
          onSave={() => save("llama")}
          onTest={() => test("llama_guard")}
        >
          <Field label="Address" value={connection.llama_guard_base_url} onChange={(value) => setConnection({ ...connection, llama_guard_base_url: value })} />
          <Field label="Model name" value={connection.llama_guard_model} onChange={(value) => setConnection({ ...connection, llama_guard_model: value })} />
          <Field
            label="Token"
            secret
            value={connection.llama_guard_api_key}
            placeholder={config.connection.has_llama_guard_api_key ? "Saved token stays if this is blank" : "Not set"}
            onChange={(value) => setConnection({ ...connection, llama_guard_api_key: value })}
          />
        </EndpointCard>

        <EndpointCard
          title="NVIDIA NIM"
          active={connection.safety_mode === "nim"}
          activeLabel="Active judge"
          hint="Optional judge. The same written rules are sent to this model."
          busy={busy === "nim" || busy === "test-nim"}
          saving={busy === "nim"}
          testing={busy === "test-nim"}
          probe={probes.nim}
          onSave={() => save("nim")}
          onTest={() => test("nim")}
        >
          <Field label="Address" value={connection.nim_base_url} onChange={(value) => setConnection({ ...connection, nim_base_url: value })} />
          <Field label="Model name" value={connection.nim_model} onChange={(value) => setConnection({ ...connection, nim_model: value })} />
          <Field
            label="Token"
            secret
            value={connection.nim_api_key}
            placeholder={config.connection.has_nim_api_key ? "Saved token stays if this is blank" : "Not set"}
            onChange={(value) => setConnection({ ...connection, nim_api_key: value })}
          />
        </EndpointCard>

        <EndpointCard
          title="Guard server"
          hint="The banking app sends every check to this address."
          busy={busy === "guard" || busy === "test-guard"}
          saving={busy === "guard"}
          testing={busy === "test-guard"}
          probe={probes.guard}
          onSave={() => save("guard")}
          onTest={() => test("guard")}
        >
          <Field label="Address" value={connection.server_url} onChange={(value) => setConnection({ ...connection, server_url: value })} />
        </EndpointCard>
      </div>

      {scripts.length > 0 && (
        <details className="card disclosure">
          <summary>Policy scripts on the guard server</summary>
          <p className="hint">Read only. These are the payment and reply steps. Region patterns are on the Regional profiles tab.</p>
          <div className="segmented" role="group">
            {scripts.map((name) => (
              <button key={name} type="button" aria-pressed={fileName === name} onClick={() => setFileName(name)}>
                {name}
              </button>
            ))}
          </div>
          <pre className="file-view">{config.files[fileName]}</pre>
        </details>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  secret = false,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        type={secret ? "password" : "text"}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function EndpointCard({
  title,
  hint,
  active = false,
  activeLabel = "",
  busy,
  saving,
  testing,
  probe,
  onSave,
  onTest,
  children,
}: {
  title: string;
  hint: string;
  active?: boolean;
  activeLabel?: string;
  busy: boolean;
  saving: boolean;
  testing: boolean;
  probe?: { ok: boolean; detail: string };
  onSave: () => void;
  onTest: () => void;
  children: ReactNode;
}) {
  return (
    <article className={`card endpoint ${active ? "is-active" : ""}`}>
      <header className="endpoint-head">
        <h3>{title}</h3>
        {active && <span className="pill">{activeLabel}</span>}
      </header>
      <p className="hint">{hint}</p>
      {children}
      <div className="row-actions">
        <button className="btn btn-primary" type="button" onClick={onSave} disabled={busy}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="btn" type="button" onClick={onTest} disabled={busy}>
          {testing ? "Testing…" : "Test"}
        </button>
      </div>
      {probe && <p className={probe.ok ? "probe probe-ok" : "probe probe-bad"}>{probe.detail}</p>}
    </article>
  );
}

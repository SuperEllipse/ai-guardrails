import { useEffect, useMemo, useState } from "react";
import { demoApi, type DemoConnection, type ProbeResult } from "../api/demo";
import { judgeName, SOURCE_LABELS } from "../copy";
import { useDemo, type ProbeKey } from "../state/DemoContext";

type Draft = Record<string, string>;
type CardId = "guard" | "answer" | "judge";
type ItemState = "pending" | "doing" | "done" | "failed";

const CARD_FIELDS: Record<CardId, string[]> = {
  guard: ["server_url"],
  answer: ["base_url", "model", "api_key"],
  judge: ["safety_mode", "llama_guard_base_url", "llama_guard_model", "llama_guard_api_key", "nim_base_url", "nim_model", "nim_api_key"],
};

const JUDGES = [
  { id: "self_check", label: "LLM as self judge", text: "Uses the answer model. No extra setup." },
  { id: "llama_guard", label: "Llama Guard", text: "A model built for safety checks." },
  { id: "nim", label: "NVIDIA NIM", text: "NVIDIA safety model served through NIM." },
];

function toDraft(connection: DemoConnection): Draft {
  return {
    server_url: connection.server_url,
    base_url: connection.base_url,
    model: connection.model,
    api_key: "",
    safety_mode: connection.safety_mode,
    llama_guard_base_url: connection.llama_guard_base_url,
    llama_guard_model: connection.llama_guard_model,
    llama_guard_api_key: "",
    nim_base_url: connection.nim_base_url,
    nim_model: connection.nim_model,
    nim_api_key: "",
  };
}

function judgeTarget(mode: string): string {
  return mode === "llama_guard" ? "llama_guard" : mode === "nim" ? "nim" : "answer";
}

function signature(draft: Draft, card: CardId): string {
  return CARD_FIELDS[card].map((key) => draft[key]).join("|");
}

function Dot({ state }: { state: ItemState }) {
  return <span className={`item-dot item-${state}`} aria-hidden="true" />;
}

export function Connections() {
  const { config, refreshConfig, probes, setProbe, setSetupDirty } = useDemo();
  const connection = config.connection;
  const [saved, setSaved] = useState<Draft>(() => toDraft(connection));
  const [draft, setDraft] = useState<Draft>(() => toDraft(connection));
  const [local, setLocal] = useState<Partial<Record<CardId, { sig: string; result: ProbeResult }>>>({});
  const [testing, setTesting] = useState<CardId | "">("");
  const [steps, setSteps] = useState<ItemState[]>(["pending", "pending", "pending"]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const dirtyCards = useMemo(
    () => (Object.keys(CARD_FIELDS) as CardId[]).filter((card) => signature(draft, card) !== signature(saved, card)),
    [draft, saved],
  );

  useEffect(() => {
    setSetupDirty(dirtyCards.length > 0);
  }, [dirtyCards, setSetupDirty]);

  const probeFor = (card: CardId): ProbeResult | undefined => {
    const own = local[card];
    if (own && own.sig === signature(draft, card)) return own.result;
    if (!dirtyCards.includes(card)) return probes[card as ProbeKey];
    return undefined;
  };

  const status = (card: CardId): { text: string; tone: string } => {
    if (testing === card) return { text: "Testing", tone: "accent" };
    const probe = probeFor(card);
    if (!probe) return { text: "Not tested", tone: "warning" };
    return probe.ok ? { text: "Connected", tone: "good" } : { text: "Not connected", tone: "critical" };
  };

  const set = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const test = async (card: CardId) => {
    setTesting(card);
    const target = card === "judge" ? judgeTarget(draft.safety_mode) : card;
    const sig = signature(draft, card);
    try {
      const result = await demoApi.probe({ target, ...draft });
      setLocal((current) => ({ ...current, [card]: { sig, result } }));
      if (!dirtyCards.includes(card)) setProbe(card, result);
    } catch (err) {
      const result = { ok: false, detail: err instanceof Error ? err.message : "The test failed.", latency_ms: null };
      setLocal((current) => ({ ...current, [card]: { sig, result } }));
    } finally {
      setTesting("");
    }
  };

  const canSave = dirtyCards.length > 0 && dirtyCards.every((card) => probeFor(card)?.ok) && !busy;

  const apply = async (reset: string[] = []) => {
    setBusy(true);
    setNotice("");
    setSteps(["doing", "pending", "pending"]);
    try {
      const result = await demoApi.saveConnection({ ...draft, reset });
      setSteps(["done", result.reload.reloaded ? "done" : "failed", "doing"]);
      if (!result.reload.reloaded) setNotice(result.reload.detail || "The guard server did not reload.");
      const next = await refreshConfig();
      const fresh = toDraft(next.connection);
      setSaved(fresh);
      setDraft(fresh);
      const guard = await demoApi.probe({ target: "guard", ...fresh });
      setProbe("guard", guard);
      for (const card of ["answer", "judge"] as CardId[]) {
        const own = local[card];
        if (own && own.sig === signature(fresh, card)) setProbe(card, own.result);
        else if (reset.length > 0) {
          const target = card === "judge" ? judgeTarget(fresh.safety_mode) : card;
          setProbe(card, await demoApi.probe({ target, ...fresh }));
        }
      }
      setSteps(["done", result.reload.reloaded ? "done" : "failed", guard.ok ? "done" : "failed"]);
      if (!guard.ok) setNotice(guard.detail);
    } catch (err) {
      setSteps((current) => current.map((item) => (item === "doing" ? "failed" : item)));
      setNotice(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const resetCard = (card: CardId) => {
    const fields = CARD_FIELDS[card].filter((key) => connection.sources[key] === "saved");
    void apply(fields);
  };

  const sourceTag = (key: string) => {
    const source = connection.sources[key];
    if (!source) return null;
    return <span className={`source source-${source}`}>{SOURCE_LABELS[source]}</span>;
  };

  const tokenPlaceholder = (key: string, has: boolean) => {
    const source = connection.sources[key];
    if (source === "saved" && has) return "Saved token stays if this is blank";
    if (source === "session") return "Using the session token automatically";
    if (source === "project") return "Token from project settings";
    return "No token";
  };

  const hasSaved = (card: CardId) => CARD_FIELDS[card].some((key) => connection.sources[key] === "saved");

  const cardHead = (card: CardId, index: number, title: string) => {
    const pill = status(card);
    return (
      <div className="card-head">
        <h3 className="numbered">
          <span className="step-dot">{index}</span>
          {title}
        </h3>
        <span className={`tag tag-${pill.tone}`}>{pill.text}</span>
      </div>
    );
  };

  const probeLine = (card: CardId) => {
    const probe = probeFor(card);
    if (!probe) return null;
    return <p className={`probe-line ${probe.ok ? "probe-ok" : "probe-bad"}`}>{probe.detail}</p>;
  };

  const cardActions = (card: CardId) => (
    <div className="inline-row">
      <button type="button" className="btn" onClick={() => test(card)} disabled={testing !== "" || busy}>
        {testing === card ? "Testing…" : "Test connection"}
      </button>
      {hasSaved(card) && (
        <button type="button" className="btn-link" onClick={() => resetCard(card)} disabled={busy}>
          Use project settings
        </button>
      )}
    </div>
  );

  const mode = draft.safety_mode;
  const readiness = [
    { label: "Guard server is reachable", ok: Boolean(probeFor("guard")?.ok) },
    { label: "Answer model replies", ok: Boolean(probeFor("answer")?.ok) },
    { label: `Judge answers (${judgeName(mode)})`, ok: Boolean(probeFor("judge")?.ok) },
    { label: "Settings saved and loaded", ok: dirtyCards.length === 0 },
  ];
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const mapDot = (card: CardId) => {
    const probe = probeFor(card);
    return <span className={`dot ${!probe ? "dot-pending" : probe.ok ? "dot-good" : "dot-critical"}`} aria-label={status(card).text} />;
  };

  return (
    <div className="setup-grid">
      <div className="stack">
        <section className="card" id="conn-guard">
          {cardHead("guard", 1, "Guard server")}
          <p className="hint">The banking app sends every check to this address. It holds the policies and calls the models.</p>
          <label className="field">
            <span>Address</span>
            <input className="input" value={draft.server_url} onChange={(e) => set("server_url", e.target.value)} />
            {sourceTag("server_url")}
          </label>
          {cardActions("guard")}
          {probeLine("guard")}
        </section>

        <section className="card" id="conn-answer">
          {cardHead("answer", 2, "Answer model")}
          <p className="hint">Writes the banking answers. It can also act as the judge.</p>
          <label className="field">
            <span>Address</span>
            <input className="input" value={draft.base_url} onChange={(e) => set("base_url", e.target.value)} />
            {sourceTag("base_url")}
          </label>
          <div className="two-up">
            <label className="field">
              <span>Model name</span>
              <input className="input" value={draft.model} onChange={(e) => set("model", e.target.value)} />
              {sourceTag("model")}
            </label>
            <label className="field">
              <span>Token</span>
              <input className="input" type="password" autoComplete="off" value={draft.api_key} placeholder={tokenPlaceholder("api_key", connection.has_api_key)} onChange={(e) => set("api_key", e.target.value)} />
              {sourceTag("api_key")}
            </label>
          </div>
          {cardActions("answer")}
          {probeLine("answer")}
        </section>

        <section className="card" id="conn-judge">
          {cardHead("judge", 3, "Judge")}
          <p className="hint">The written rules stay the same. This picks which model reads them and answers yes or no.</p>
          <div className="option-cards" role="radiogroup" aria-label="Judge">
            {JUDGES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={mode === item.id}
                className={`option-card${mode === item.id ? " is-selected" : ""}`}
                onClick={() => set("safety_mode", item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.text}</span>
              </button>
            ))}
          </div>
          {sourceTag("safety_mode")}
          {mode === "self_check" && <p className="hint">The answer model above reads the rules and answers yes or no. Testing the judge tests the answer model.</p>}
          {mode === "llama_guard" && (
            <>
              <label className="field">
                <span>Address</span>
                <input className="input" value={draft.llama_guard_base_url} onChange={(e) => set("llama_guard_base_url", e.target.value)} />
                {sourceTag("llama_guard_base_url")}
              </label>
              <div className="two-up">
                <label className="field">
                  <span>Model name</span>
                  <input className="input" value={draft.llama_guard_model} onChange={(e) => set("llama_guard_model", e.target.value)} />
                  {sourceTag("llama_guard_model")}
                </label>
                <label className="field">
                  <span>Token</span>
                  <input className="input" type="password" autoComplete="off" value={draft.llama_guard_api_key} placeholder={tokenPlaceholder("llama_guard_api_key", connection.has_llama_guard_api_key)} onChange={(e) => set("llama_guard_api_key", e.target.value)} />
                  {sourceTag("llama_guard_api_key")}
                </label>
              </div>
            </>
          )}
          {mode === "nim" && (
            <>
              <label className="field">
                <span>Address</span>
                <input className="input" value={draft.nim_base_url} onChange={(e) => set("nim_base_url", e.target.value)} />
                {sourceTag("nim_base_url")}
              </label>
              <div className="two-up">
                <label className="field">
                  <span>Model name</span>
                  <input className="input" value={draft.nim_model} onChange={(e) => set("nim_model", e.target.value)} />
                  {sourceTag("nim_model")}
                </label>
                <label className="field">
                  <span>Token</span>
                  <input className="input" type="password" autoComplete="off" value={draft.nim_api_key} placeholder={tokenPlaceholder("nim_api_key", connection.has_nim_api_key)} onChange={(e) => set("nim_api_key", e.target.value)} />
                  {sourceTag("nim_api_key")}
                </label>
              </div>
            </>
          )}
          {cardActions("judge")}
          {probeLine("judge")}
        </section>

        <section className="card">
          <h3 className="numbered">
            <span className="step-dot">4</span>Save and apply
          </h3>
          <p className="hint">Saves the addresses and the judge choice, then reloads the guard server so the next check uses them. Only values that differ from project settings are saved.</p>
          <ul className="item-list">
            {["Save settings", "Reload the guard server", "Run a sample check"].map((label, index) => (
              <li key={label}>
                <Dot state={steps[index]} />
                {label}
              </li>
            ))}
          </ul>
          {notice && <p className="banner banner-critical">{notice}</p>}
          <div className="inline-row">
            <button type="button" className="btn btn-primary" onClick={() => void apply()} disabled={!canSave}>
              {busy ? "Saving…" : "Save and apply"}
            </button>
            <span className="hint">
              {dirtyCards.length === 0
                ? "No unsaved changes."
                : canSave
                  ? "Ready to save."
                  : "Test every changed connection before saving."}
            </span>
          </div>
        </section>
      </div>

      <aside className="stack setup-side">
        <section className="card">
          <h3>How it connects</h3>
          <div className="map">
            <div className="map-box">
              <strong>Banking assistant</strong>
              <span>This demo</span>
            </div>
            <span className="map-link">every check</span>
            <button type="button" className="map-box map-guard" onClick={() => scrollTo("conn-guard")}>
              <strong>Guard server</strong>
              <span>{draft.server_url}</span>
              {mapDot("guard")}
            </button>
            <span className="map-link">calls</span>
            <div className="two-up">
              <button type="button" className="map-box" onClick={() => scrollTo("conn-answer")}>
                <strong>Answer model</strong>
                <span>Writes replies</span>
                {mapDot("answer")}
              </button>
              <button type="button" className="map-box" onClick={() => scrollTo("conn-judge")}>
                <strong>Judge</strong>
                <span>{judgeName(mode)}</span>
                {mapDot("judge")}
              </button>
            </div>
          </div>
          <p className="hint">Select a box to jump to its settings.</p>
        </section>
        <section className="card">
          <h3>Readiness</h3>
          <ul className="item-list">
            {readiness.map((item) => (
              <li key={item.label}>
                <span className={`tag ${item.ok ? "tag-good" : "tag-warning"}`}>{item.ok ? "Done" : "Check"}</span>
                {item.label}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

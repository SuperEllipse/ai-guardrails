import { navigate, useDemo } from "../state/DemoContext";
import { Connections } from "./Connections";
import { PolicyScripts } from "./PolicyScripts";
import { RegionalProfiles } from "./RegionalProfiles";

const SUBS = [
  { id: "connections", label: "Connections" },
  { id: "profiles", label: "Regional ID profiles" },
  { id: "scripts", label: "Policy scripts" },
];

export function Setup({ sub }: { sub: string }) {
  const { probes, setupDirty, probing } = useDemo();
  const current = SUBS.some((item) => item.id === sub) ? sub : "connections";
  const ready = Boolean(probes.guard?.ok && probes.answer?.ok && probes.judge?.ok) && !setupDirty;

  return (
    <div className="stack">
      <section className="card row-card">
        <div>
          <h2 className="card-heading">Setup</h2>
          <p className="hint">Connect the guard server and the models before a demo. Saved changes are loaded by the guard server straight away.</p>
        </div>
        <span className={`tag ${ready ? "tag-good" : "tag-warning"}`}>{probing ? "Checking" : ready ? "Ready to demo" : "Needs attention"}</span>
      </section>
      <nav className="subnav" aria-label="Setup sections">
        {SUBS.map((item) => (
          <button key={item.id} type="button" className={`subnav-item${current === item.id ? " is-selected" : ""}`} aria-current={current === item.id} onClick={() => navigate("setup", item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      {current === "connections" && <Connections />}
      {current === "profiles" && <RegionalProfiles />}
      {current === "scripts" && <PolicyScripts />}
    </div>
  );
}

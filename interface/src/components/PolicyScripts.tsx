import { useState } from "react";
import { useDemo } from "../state/DemoContext";

export function PolicyScripts() {
  const { config } = useDemo();
  const names = Object.keys(config.files).filter((name) => !name.startsWith("regions/"));
  const [picked, setPicked] = useState(names[0] || "");

  return (
    <section className="card">
      <h3>Policy scripts</h3>
      <p className="hint">The scripts the guard server runs, read-only. They call the checks; the written rules live in the policies.</p>
      <div className="pill-row">
        {names.map((name) => (
          <button key={name} type="button" className={`pill-btn${picked === name ? " is-selected" : ""}`} onClick={() => setPicked(name)}>
            {name}
          </button>
        ))}
      </div>
      {picked && <pre className="code-panel">{config.files[picked]}</pre>}
    </section>
  );
}

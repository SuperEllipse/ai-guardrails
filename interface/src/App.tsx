import { useEffect, useState } from "react";
import { demoApi, type DemoConfig } from "./api/demo";
import { Configuration } from "./components/Configuration";
import { RedTeam } from "./components/RedTeam";
import { ThemeToggle } from "./components/ThemeToggle";
import { UseCases } from "./components/UseCases";

const TABS = [
  { id: "usecases", label: "Compliance / Risks" },
  { id: "configuration", label: "Configuration" },
  { id: "redteam", label: "Red teaming" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFromHash(): TabId {
  const id = window.location.hash.replace(/^#\/?/, "");
  return TABS.some((tab) => tab.id === id) ? (id as TabId) : "usecases";
}

export default function App() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>(tabFromHash);

  useEffect(() => {
    demoApi.config().then(setConfig).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (error) {
    return (
      <div className="center-screen">
        <p className="banner banner-critical">{error}</p>
      </div>
    );
  }
  if (!config) {
    return (
      <div className="center-screen">
        <span className="spinner" aria-label="Loading" />
      </div>
    );
  }

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <div>
            <p className="eyebrow">Banking assistant</p>
            <h1>Guardrails</h1>
          </div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Screens">
          {TABS.map((item) => (
            <button
              key={item.id}
              className="tab"
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => {
                window.location.hash = `/${item.id}`;
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="header-end">
          <ThemeToggle />
        </div>
      </header>
      <main className="main demo-main">
        {tab === "usecases" && <UseCases config={config} />}
        {tab === "configuration" && <Configuration config={config} onChange={setConfig} />}
        {tab === "redteam" && <RedTeam config={config} />}
      </main>
    </>
  );
}

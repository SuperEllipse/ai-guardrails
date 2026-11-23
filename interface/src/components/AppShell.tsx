import { useEffect, useState } from "react";
import { judgeName } from "../copy";
import { navigate, useDemo, type TabId } from "../state/DemoContext";
import { AuditTrail } from "./AuditTrail";
import { LiveRiskTest } from "./LiveRiskTest";
import { PolicyStudio } from "./PolicyStudio";
import { Setup } from "./Setup";
import { StartHere } from "./StartHere";
import { StressTest } from "./StressTest";
import { ThemeToggle } from "./ThemeToggle";

const TABS: { id: TabId; label: string }[] = [
  { id: "guide", label: "Start here" },
  { id: "live", label: "Live risk test" },
  { id: "policies", label: "Custom policies" },
  { id: "stress", label: "Stress test" },
  { id: "audit", label: "Audit trail" },
];

const OLD_IDS: Record<string, TabId> = {
  usecases: "live",
  configuration: "setup",
  redteam: "stress",
};

function routeFromHash(): { tab: TabId; sub: string } {
  const [first = "", sub = ""] = window.location.hash.replace(/^#\/?/, "").split("/");
  if (OLD_IDS[first]) return { tab: OLD_IDS[first], sub };
  const known: TabId[] = ["guide", "live", "policies", "stress", "audit", "setup"];
  return { tab: known.includes(first as TabId) ? (first as TabId) : "live", sub };
}

export function AppShell() {
  const { config, probes, probing, logCount, setupDirty } = useDemo();
  const [route, setRoute] = useState(routeFromHash);

  useEffect(() => {
    const first = window.location.hash.replace(/^#\/?/, "").split("/")[0];
    if (OLD_IDS[first]) navigate(OLD_IDS[first]);
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const guard = probes.guard;
  const rule = config.custom_rule;
  const liveCount = rule.deployed ? 1 : 0;
  const ready = Boolean(probes.guard?.ok && probes.answer?.ok && probes.judge?.ok) && !setupDirty;
  const policyBadge = rule.deployed ? (rule.deployed_current ? "Live" : "Changes not deployed") : "Not live";

  return (
    <div className="shell">
      <header className="shell-head">
        <div className="shell-title">
          <h1>AI Compliance Guard for Banking</h1>
          <p>Stop risky answers and payments before customers see them.</p>
        </div>
        <div className="chips">
          <button type="button" className="chip" onClick={() => navigate("setup")} title={guard?.detail || ""}>
            <span className={`dot ${probing && !guard ? "dot-pending" : guard?.ok ? "dot-good" : "dot-critical"}`} aria-hidden="true" />
            Guard server <strong>{probing && !guard ? "checking" : guard?.ok ? "connected" : "not connected"}</strong>
          </button>
          <button type="button" className="chip" onClick={() => navigate("setup")}>
            Judge <strong>{judgeName(config.connection.safety_mode)}</strong>
          </button>
          <span className="chip chip-static">
            Custom policies <strong>{liveCount} of 1 live</strong>
          </span>
          <ThemeToggle />
        </div>
        <nav className="shell-tabs" role="tablist" aria-label="Screens">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              className="shell-tab"
              aria-selected={route.tab === item.id}
              onClick={() => navigate(item.id)}
            >
              {item.label}
              {item.id === "policies" && (
                <span className={`tab-badge ${rule.deployed && rule.deployed_current ? "tab-badge-neutral" : "tab-badge-warning"}`}>
                  {policyBadge}
                </span>
              )}
              {item.id === "audit" && <span className="tab-badge tab-badge-neutral">{logCount}</span>}
            </button>
          ))}
          <button
            type="button"
            role="tab"
            className="shell-tab shell-tab-end"
            aria-selected={route.tab === "setup"}
            onClick={() => navigate("setup")}
          >
            Setup
            <span className={`tab-badge ${ready ? "tab-badge-neutral" : "tab-badge-warning"}`}>
              {probing && !guard ? "Checking" : ready ? "Ready" : "Check"}
            </span>
          </button>
        </nav>
      </header>
      <main className="shell-main">
        {route.tab === "guide" && <StartHere />}
        {route.tab === "live" && <LiveRiskTest />}
        {route.tab === "policies" && <PolicyStudio />}
        {route.tab === "stress" && <StressTest />}
        {route.tab === "audit" && <AuditTrail />}
        {route.tab === "setup" && <Setup sub={route.sub} />}
      </main>
    </div>
  );
}

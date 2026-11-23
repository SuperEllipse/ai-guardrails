import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { demoApi, type DemoConfig, type ProbeResult, type UseCaseResult } from "../api/demo";

export type TabId = "guide" | "live" | "policies" | "stress" | "audit" | "setup";
export type ProbeKey = "guard" | "answer" | "judge";

const VERSION_KEY = "guardrails-id-version";

function storedVersion(): string {
  try {
    const value = localStorage.getItem(VERSION_KEY);
    return value === "v2" || value === "v3" ? value : "v1";
  } catch {
    return "v1";
  }
}

export function navigate(tab: TabId, sub?: string) {
  window.location.hash = sub ? `/${tab}/${sub}` : `/${tab}`;
}

interface DemoState {
  config: DemoConfig;
  refreshConfig: () => Promise<DemoConfig>;
  setConfig: (next: DemoConfig) => void;
  probes: Partial<Record<ProbeKey, ProbeResult>>;
  probing: boolean;
  setProbe: (key: ProbeKey, result: ProbeResult | undefined) => void;
  checkStatus: () => Promise<void>;
  results: Record<string, UseCaseResult>;
  setResult: (result: UseCaseResult) => void;
  clearResults: () => void;
  region: string;
  setRegion: (region: string) => void;
  idVersion: string;
  setIdVersion: (version: string) => void;
  pendingRun: string;
  requestRun: (exampleId: string) => void;
  takePendingRun: () => string;
  auditTarget: string;
  openAudit: (logId: string) => void;
  logCount: number;
  refreshLogCount: () => void;
  setupDirty: boolean;
  setSetupDirty: (dirty: boolean) => void;
}

const DemoContext = createContext<DemoState | null>(null);

export function DemoProvider({ initial, children }: { initial: DemoConfig; children: ReactNode }) {
  const [config, setConfig] = useState(initial);
  const [probes, setProbes] = useState<Partial<Record<ProbeKey, ProbeResult>>>({});
  const [probing, setProbing] = useState(false);
  const [results, setResults] = useState<Record<string, UseCaseResult>>({});
  const [region, setRegionState] = useState(initial.regions.find((item) => item.id === "US")?.id || initial.regions[0]?.id || "US");
  const [idVersion, setIdVersionState] = useState(storedVersion);
  const [pendingRun, setPendingRun] = useState("");
  const [auditTarget, setAuditTarget] = useState("");
  const [logCount, setLogCount] = useState(initial.log_count);
  const [setupDirty, setSetupDirty] = useState(false);

  const refreshConfig = useCallback(async () => {
    const next = await demoApi.config();
    setConfig(next);
    setLogCount(next.log_count);
    return next;
  }, []);

  const checkStatus = useCallback(async () => {
    setProbing(true);
    try {
      const status = await demoApi.connectionStatus();
      setProbes({ guard: status.guard, answer: status.answer, judge: status.judge });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "The status check failed.";
      const failed = { ok: false, detail, latency_ms: null };
      setProbes({ guard: failed, answer: failed, judge: failed });
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const refreshLogCount = useCallback(() => {
    demoApi
      .logCount()
      .then((payload) => setLogCount(payload.count))
      .catch(() => undefined);
  }, []);

  const value = useMemo<DemoState>(
    () => ({
      config,
      refreshConfig,
      setConfig,
      probes,
      probing,
      setProbe: (key, result) => setProbes((current) => ({ ...current, [key]: result })),
      checkStatus,
      results,
      setResult: (result) => setResults((current) => ({ ...current, [result.example_id]: result })),
      clearResults: () => setResults({}),
      region,
      setRegion: (next) => {
        setRegionState(next);
        setResults({});
      },
      idVersion,
      setIdVersion: (next) => {
        setIdVersionState(next);
        setResults({});
        try {
          localStorage.setItem(VERSION_KEY, next);
        } catch {
          // Storage unavailable: the choice still applies for this page view.
        }
      },
      pendingRun,
      requestRun: (exampleId) => {
        setPendingRun(exampleId);
        navigate("live");
      },
      takePendingRun: () => {
        const id = pendingRun;
        if (id) setPendingRun("");
        return id;
      },
      auditTarget,
      openAudit: (logId) => {
        setAuditTarget(logId);
        navigate("audit");
      },
      logCount,
      refreshLogCount,
      setupDirty,
      setSetupDirty,
    }),
    [config, refreshConfig, probes, probing, checkStatus, results, region, idVersion, pendingRun, auditTarget, logCount, refreshLogCount, setupDirty],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoState {
  const state = useContext(DemoContext);
  if (!state) throw new Error("useDemo must be used inside DemoProvider.");
  return state;
}

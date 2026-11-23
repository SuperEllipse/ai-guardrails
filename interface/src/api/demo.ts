export type FieldSource = "project" | "saved" | "default" | "session";

export interface DemoConnection {
  model: string;
  base_url: string;
  safety_mode: string;
  llama_guard_base_url: string;
  llama_guard_model: string;
  nim_base_url: string;
  nim_model: string;
  server_url: string;
  has_api_key: boolean;
  has_llama_guard_api_key: boolean;
  has_nim_api_key: boolean;
  sources: Record<string, FieldSource>;
}

export interface CustomRule {
  id: string;
  name: string;
  policy: string;
  on_violation: string;
  message_default: string;
  message_au: string;
  message_sg: string;
  should_block: string[];
  should_pass: string[];
  deployed: boolean;
  deployed_current: boolean;
}

export type Stage = "input" | "output" | "payment";

export interface DemoExample {
  id: string;
  area_id: string;
  area: string;
  title: string;
  query: string;
  kind: string;
  stage: Stage;
  expected: "block" | "allow";
  custom?: boolean;
  note: string;
  draft?: string;
}

export interface RiskArea {
  id: string;
  name: string;
  question: string;
}

export interface JudgeInfo {
  mode: string;
  base_url_host: string;
  model: string;
  answered_by: "" | "answer_model" | "llama_guard" | "nim";
  fallback_reason: string;
  latency_ms: number;
  requested_model?: string;
}

export interface CheckInfo {
  blocked?: boolean;
  rewrite?: boolean;
  message?: string;
  rule?: string;
  rule_name?: string;
  model_call?: boolean;
  label?: string;
  error?: string;
  judge?: JudgeInfo;
  entities?: { id: string; label: string; reason?: string }[];
}

export interface LedgerView {
  name: string;
  balance: number;
}

export interface PaymentInfo {
  allowed?: boolean;
  reason?: string;
  ledger_before?: LedgerView | null;
  ledger_guarded?: LedgerView | null;
  ledger_unguarded?: LedgerView | null;
  error?: string;
}

export interface LiveAnswer {
  text: string;
  output: CheckInfo | null;
  error: string;
  shown_only: boolean;
  timings_ms: { agents?: number; output?: number };
}

export type Outcome = "as_expected" | "gap" | "overblock" | "error";

export interface UseCaseResult {
  example_id: string;
  area_id: string;
  area: string;
  title: string;
  stage: Stage;
  custom: boolean;
  query: string;
  draft_source: "scripted" | "live";
  unguarded_response: string;
  unguarded_error: string;
  guarded_response: string;
  path: string;
  expected: "block" | "allow";
  actual: "block" | "allow" | "error";
  outcome: Outcome;
  error: string;
  error_step: string;
  input: CheckInfo;
  output: CheckInfo;
  payment: PaymentInfo | null;
  live_answer: LiveAnswer | null;
  timings_ms: { input?: number; agents?: number; payment?: number; output?: number; total?: number };
  region: string;
  profile_version: string;
  all_regions: boolean;
  custom_deployed: boolean;
  log_id: string;
}

export interface TestRow {
  sentence: string;
  expected: string;
  actual: string;
  ok: boolean;
  message: string;
  judge: JudgeInfo | null;
  elapsed_ms: number;
}

export interface AttackPrompt {
  id: string;
  policy: string;
  stage?: string;
  text?: string;
  user?: string;
  expected?: string;
  expected_v3?: string;
  expected_all_regions?: string;
  regions?: string[];
}

export interface RedPrompt {
  id: string;
  policy: string;
  stage: string;
  text: string;
  user: string;
  expected: string;
}

export type RedEvent =
  | { type: "start"; run_id: string; total: number; prompts: RedPrompt[] }
  | { type: "working"; id: string; index: number }
  | {
      type: "result";
      index: number;
      case: RedCase;
      done: number;
      total: number;
      blocked: number;
      misses: number;
      overblocks: number;
      errors: number;
    }
  | { type: "done"; run_id: string };

export interface RedCase {
  case_id: string;
  policy: string;
  stage: string;
  expected: string;
  actual: string;
  entity: string;
  query: string;
  detail: string;
  judge?: string | null;
  elapsed_ms?: number | string | null;
}

export interface RedRun {
  run_id: string;
  created: string;
  region: string;
  profile_version: string;
  model: string;
  policies: string;
  total: number;
  blocked: number;
  misses: number;
  overblocks: number;
}

export interface RedSummary {
  run: RedRun;
  cases: RedCase[];
  by_policy: Record<string, { block: number; allow: number; miss: number; overblock: number; error: number }>;
  by_stage: Record<string, number>;
  by_entity: Record<string, { hits: number; false: number }>;
  misses: RedCase[];
  overblocks: RedCase[];
  errors: RedCase[];
}

export interface GuardLogEntry {
  id: string;
  created: string;
  source: string;
  input_prompt: string;
  output_response: string;
  violation: "yes" | "no" | "error";
  reason: string;
  example_id: string | null;
  title: string | null;
  area: string | null;
  stage: string | null;
  region: string | null;
  outcome: string | null;
  judge: JudgeInfo | null;
  timings: Record<string, number> | null;
  draft_source: string | null;
  draft: string | null;
  live_answer: string | null;
  live_verdict: string | null;
  error: string | null;
}

export interface ProfileEntity {
  id: string;
  label: string;
  pattern: string;
  context: string[];
  checksum: boolean;
  comment: string;
}

export interface ProfileView {
  versions: { id: string; name: string; comment: string }[];
  profiles: { id: string; name: string; entities: ProfileEntity[] }[];
}

export interface IdMatch {
  entity: string;
  label: string;
  profile: string;
  value: string;
  matched: boolean;
  reason: "shape" | "no_nearby_word" | "checksum_failed" | "matched_with_word";
}

export interface ProbeResult {
  ok: boolean;
  detail: string;
  latency_ms: number | null;
  status?: number | null;
  endpoint?: string;
  model?: string;
}

export interface ConnectionStatus {
  guard: ProbeResult;
  answer: ProbeResult;
  judge: ProbeResult & { mode: string };
}

export interface ReloadResult {
  reloaded: boolean;
  detail?: string;
}

export interface DemoConfig {
  connection: DemoConnection;
  custom_rule: CustomRule;
  files: Record<string, string>;
  examples: DemoExample[];
  areas: RiskArea[];
  everyday: RiskArea;
  log_count: number;
  policies: { id: string; label: string }[];
  regions: { id: string; label: string }[];
}

const API = "api/demo";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API}/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body);
    } catch {
      // Keep the status text when the body is not JSON.
    }
    throw new Error(`The web app answered with HTTP ${resp.status}. ${detail}`.trim());
  }
  return resp.json() as Promise<T>;
}

export const demoApi = {
  config: () => request<DemoConfig>("config"),
  saveConnection: (body: Record<string, string | string[]>) =>
    request<{ connection: DemoConnection; reload: ReloadResult }>("connection", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  connectionStatus: () => request<ConnectionStatus>("connection/status"),
  saveRule: (body: Pick<CustomRule, "policy" | "message_default" | "message_au" | "message_sg" | "should_block" | "should_pass">) =>
    request<CustomRule>("custom-rule", { method: "PUT", body: JSON.stringify(body) }),
  testRule: () => request<{ passed: boolean; results: TestRow[] }>("custom-rule/test", { method: "POST" }),
  deployRule: () =>
    request<{ deployed: boolean; reload: ReloadResult }>("custom-rule/deploy", { method: "POST" }),
  undeployRule: () =>
    request<{ deployed: boolean; reload: ReloadResult }>("custom-rule/undeploy", { method: "POST" }),
  usecase: (exampleId: string, region: string, profileVersion: string, allRegions: boolean) =>
    request<UseCaseResult>("usecase", {
      method: "POST",
      body: JSON.stringify({
        example_id: exampleId,
        region,
        profile_version: profileVersion,
        all_regions: allRegions,
      }),
    }),
  attacks: () => request<{ attacks: AttackPrompt[]; custom_deployed: boolean }>("attacks"),
  streamRedteam: async (
    policies: string[],
    region: string,
    profileVersion: string,
    allRegions: boolean,
    onEvent: (event: RedEvent) => void,
  ) => {
    const resp = await fetch(`${API}/redteam/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        policies,
        region,
        profile_version: profileVersion,
        all_regions: allRegions,
      }),
    });
    if (!resp.ok || !resp.body) {
      throw new Error(`The web app answered with HTTP ${resp.status}. ${resp.statusText}`.trim());
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) onEvent(JSON.parse(line) as RedEvent);
      }
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as RedEvent);
  },
  runs: () => request<RedRun[]>("redteam/runs"),
  run: (runId: string) => request<RedSummary>(`redteam/runs/${encodeURIComponent(runId)}`),
  runCsvUrl: (runId: string) => `${API}/redteam/runs/${encodeURIComponent(runId)}.csv`,
  profiles: () => request<ProfileView>("profiles"),
  tryProfile: (text: string, region: string, profileVersion: string, allRegions: boolean) =>
    request<{ blocked: boolean; matches: IdMatch[] }>("profiles/try", {
      method: "POST",
      body: JSON.stringify({ text, region, profile_version: profileVersion, all_regions: allRegions }),
    }),
  probe: (body: Record<string, string>) =>
    request<ProbeResult>("connection/test", { method: "POST", body: JSON.stringify(body) }),
  logs: () => request<GuardLogEntry[]>("logs"),
  logCount: () => request<{ count: number }>("logs/count"),
  log: (logId: string) => request<GuardLogEntry>(`logs/${encodeURIComponent(logId)}`),
};

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
}

export interface DemoExample {
  id: string;
  area: string;
  title: string;
  query: string;
  kind: string;
  note: string;
  draft?: string;
}

export interface FlowStep {
  id: string;
  state: string;
  detail: string;
}

export interface CheckInfo {
  blocked?: boolean;
  rewrite?: boolean;
  message?: string;
  rule?: string;
  model_call?: boolean;
  label?: string;
  error?: string;
}

export interface UseCaseResult {
  example_id: string;
  area: string;
  title: string;
  query: string;
  unguarded_response: string;
  guarded_response: string;
  path: string;
  steps: FlowStep[];
  input?: CheckInfo;
  output?: CheckInfo;
  payment: {
    allowed?: boolean;
    reason?: string;
    ledger_before?: { name: string; balance: number };
    ledger_guarded?: { name: string; balance: number };
    ledger_unguarded?: { name: string; balance: number };
    error?: string;
  } | null;
  custom_deployed: boolean;
}

export interface TestRow {
  sentence: string;
  expected: string;
  actual: string;
  ok: boolean;
  message: string;
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
}

export interface RedSummary {
  run: {
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
  };
  cases: RedCase[];
  by_policy: Record<string, { block: number; allow: number; miss: number; overblock: number; error: number }>;
  by_stage: Record<string, number>;
  by_entity: Record<string, { hits: number; false: number }>;
  misses: RedCase[];
  overblocks: RedCase[];
}

export interface GuardLogEntry {
  id: string;
  created: string;
  source: string;
  input_prompt: string;
  output_response: string;
  violation: "yes" | "no";
  reason: string;
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

export interface ProbeResult {
  ok: boolean;
  detail: string;
}

export interface DemoConfig {
  connection: DemoConnection;
  custom_rule: CustomRule;
  files: Record<string, string>;
  examples: DemoExample[];
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
    throw new Error(detail);
  }
  return resp.json() as Promise<T>;
}

export const demoApi = {
  config: () => request<DemoConfig>("config"),
  saveConnection: (body: Record<string, string | boolean>) =>
    request<{ reload: { reloaded: boolean; detail?: string } }>("connection", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  saveRule: (body: Omit<CustomRule, "id" | "name" | "on_violation" | "deployed">) =>
    request<CustomRule>("custom-rule", { method: "PUT", body: JSON.stringify(body) }),
  testRule: () => request<{ passed: boolean; results: TestRow[] }>("custom-rule/test", { method: "POST" }),
  deployRule: () =>
    request<{ deployed: boolean; reload: { reloaded: boolean; detail?: string } }>("custom-rule/deploy", {
      method: "POST",
    }),
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
  attacks: () =>
    request<{ attacks: AttackPrompt[]; custom_deployed: boolean }>("attacks"),
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
      throw new Error(resp.statusText || "The run failed.");
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
  runs: () => request<RedSummary["run"][]>("redteam/runs"),
  run: (runId: string) => request<RedSummary>(`redteam/runs/${encodeURIComponent(runId)}`),
  profiles: () => request<ProfileView>("profiles"),
  probe: (body: Record<string, string>) =>
    request<ProbeResult>("connection/test", { method: "POST", body: JSON.stringify(body) }),
  logs: () => request<GuardLogEntry[]>("logs"),
  log: (logId: string) => request<GuardLogEntry>(`logs/${encodeURIComponent(logId)}`),
};

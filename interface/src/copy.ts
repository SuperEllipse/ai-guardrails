import type { JudgeInfo, UseCaseResult } from "./api/demo";

/** The words used on screen. */
export const JUDGE_LABELS: Record<string, string> = {
  self_check: "LLM as self judge",
  llama_guard: "Llama Guard",
  nim: "NVIDIA NIM",
};

export const STAGE_LABELS: Record<string, string> = {
  input: "Input",
  output: "Output",
  payment: "Payment",
  policy_test: "Policy test",
};

export const ID_VERSION_LABELS: Record<string, string> = {
  v1: "Pattern",
  v2: "Pattern + nearby word",
  v3: "Checksum",
};

export const SOURCE_LABELS: Record<string, string> = {
  project: "From project settings",
  saved: "Saved in app (overrides project settings)",
  default: "Built-in default",
  session: "Using the session token automatically",
};

export function judgeName(mode: string): string {
  return JUDGE_LABELS[mode] || mode;
}

/** Who actually answered a written-rule question. Never credits a model that did not answer. */
export function judgedBy(judge: JudgeInfo | null | undefined): string {
  if (!judge) return "";
  if (!judge.answered_by) return `${judgeName(judge.mode)} did not answer`;
  const model = judge.model ? ` (${judge.model})` : "";
  if (judge.answered_by === "answer_model" && judge.fallback_reason) {
    return `Judged by the answer model${model}, because ${judgeName(judge.mode)} replied in its own format`;
  }
  if (judge.answered_by === "answer_model") return `Judged by the answer model${model}`;
  return `Judged by ${judgeName(judge.answered_by)}${model}`;
}

/** The judge of the check that decided the result; none when a pattern or the ledger rule decided. */
export function decisiveJudge(result: UseCaseResult): JudgeInfo | undefined {
  if (result.path === "payment_blocked" || result.path === "payment_allowed") return undefined;
  if (result.path === "input_blocked") return result.input?.judge;
  if (result.outcome === "error") return result.error_step === "input" ? result.input?.judge : result.output?.judge;
  return result.output?.judge || result.input?.judge;
}

export function seconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export type Tone = "critical" | "good" | "warning" | "neutral";

/** The verdict for a run, from the path and outcome the backend returned. */
export function verdictFor(result: UseCaseResult): { text: string; tone: Tone } {
  if (result.outcome === "error") return { text: "The check did not finish. Nothing was delivered.", tone: "critical" };
  if (result.outcome === "gap") return { text: "Gap found: the risky reply reached the customer", tone: "warning" };
  switch (result.path) {
    case "input_blocked":
      return { text: "Blocked at the input check", tone: "critical" };
    case "output_caught":
      return { text: "Blocked at the output check", tone: "critical" };
    case "payment_blocked":
      return { text: "Blocked at the payment check", tone: "critical" };
    default:
      return { text: "Allowed and delivered", tone: "good" };
  }
}

/** The small tag on a test button after it has run. */
export function resultTag(result: UseCaseResult): { text: string; tone: Tone } {
  if (result.outcome === "error") return { text: "Error", tone: "critical" };
  if (result.outcome === "gap") return { text: "Gap found", tone: "warning" };
  if (result.outcome === "overblock") return { text: "Stopped by mistake", tone: "warning" };
  return result.actual === "block" ? { text: "Blocked", tone: "critical" } : { text: "Allowed", tone: "good" };
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function money(value: number | undefined): string {
  if (value === undefined || value === null) return "";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function localTime(created: string): string {
  const parsed = new Date(created.replace(" UTC", "Z").replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return created;
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

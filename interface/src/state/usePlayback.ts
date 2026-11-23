import { useCallback, useEffect, useRef, useState } from "react";
import type { UseCaseResult } from "../api/demo";
import { buildSteps } from "../components/Pipeline";

/** How far the playback of one run has got. Steps are 0 Customer … 5 Reply. */
export interface Playback {
  revealed: number;
  checking: number | null;
  customer: number;
  draft: number;
  reply: number;
  done: boolean;
}

export const FULL = Number.MAX_SAFE_INTEGER;
const IDLE: Playback = { revealed: 0, checking: null, customer: 0, draft: 0, reply: 0, done: false };
const CHAR_MS = 30;
const MAX_TYPE_MS = 1500;
const STEP_MS = 450;
const SKIP_MS = 150;
const GAP_MS = 250;

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** The step whose result the guarded reply comes from; -1 when nothing was delivered. */
function replyStep(result: UseCaseResult): number {
  if (result.outcome === "error") return -1;
  if (result.path === "input_blocked") return 1;
  if (result.path === "payment_blocked") return 3;
  return 5;
}

export function typed(text: string, count: number): string {
  return count >= text.length ? text : text.slice(0, count);
}

/**
 * Plays back one run. The customer's message types out as soon as the run starts, the input
 * check shows as checking while the real request is in flight, and once the measured result
 * is back the remaining steps and replies are revealed in order.
 */
export function usePlayback(runId: number, query: string, result: UseCaseResult | null, failed: boolean) {
  const [playback, setPlayback] = useState<Playback>(IDLE);
  const latest = useRef({ result, failed });
  latest.current = { result, failed };
  const finished = useRef(true);
  const waiters = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!runId) {
      setPlayback(IDLE);
      return;
    }
    let cancelled = false;
    finished.current = false;
    const reduced = reducedMotion();
    const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    const update = (patch: Partial<Playback>) => {
      if (!cancelled) setPlayback((current) => ({ ...current, ...patch }));
    };
    const type = async (key: "customer" | "draft" | "reply", text: string) => {
      if (!reduced && text) {
        const step = Math.max(1, Math.ceil(text.length / (MAX_TYPE_MS / CHAR_MS)));
        for (let count = step; count < text.length && !cancelled; count += step) {
          update({ [key]: count });
          await sleep(CHAR_MS);
        }
      }
      update({ [key]: FULL });
    };
    const finish = () => {
      finished.current = true;
      waiters.current.splice(0).forEach((resolve) => resolve());
    };

    void (async () => {
      setPlayback({ ...IDLE, checking: 0 });
      await type("customer", query);
      update({ revealed: 1, checking: 1 });
      while (!cancelled && !latest.current.result && !latest.current.failed) await sleep(100);
      if (cancelled) return;
      const final = latest.current.result;
      if (!final) {
        update({ checking: null, done: true });
        finish();
        return;
      }
      const steps = buildSteps(final);
      const replyAt = replyStep(final);
      for (let index = 1; index < steps.length && !cancelled; index++) {
        if (index > 1 && !reduced) {
          update({ checking: index });
          await sleep(steps[index].state === "skipped" ? SKIP_MS : STEP_MS);
        }
        update({ revealed: index + 1, checking: null });
        if (index === 2) await type("draft", final.unguarded_response || final.unguarded_error);
        if (index === replyAt) await type("reply", final.guarded_response);
        if (!reduced) await sleep(GAP_MS);
      }
      update({ checking: null, done: true });
      finish();
    })();

    return () => {
      cancelled = true;
      finish();
    };
  }, [runId]);

  const waitDone = useCallback(
    () => (finished.current ? Promise.resolve() : new Promise<void>((resolve) => waiters.current.push(resolve))),
    [],
  );

  return { playback, waitDone };
}

import type { FlowStep } from "../api/demo";

const LABELS: Record<string, string> = {
  customer: "Customer message",
  input: "Guard server, input check",
  agents: "Banking agents write a draft",
  payment: "Payment check",
  output: "Guard server, output check",
  reply: "Reply shown to the customer",
};

export function FlowPath({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="flow" aria-label="Path taken">
      {steps.map((step, index) => (
        <div key={step.id} className="flow-item">
          {index > 0 && <span className="flow-arrow" aria-hidden="true">→</span>}
          <div className={`flow-step ${step.state === "skipped" ? "is-skipped" : "is-done"}`}>
            <strong>{LABELS[step.id] || step.id}</strong>
            {step.detail && <span>{step.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

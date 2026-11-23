import type { ReactNode } from "react";
import type { DemoExample, RiskArea, UseCaseResult } from "../api/demo";
import { resultTag, STAGE_LABELS } from "../copy";

export function RiskAreaCard({
  area,
  examples,
  results,
  selected,
  running,
  disabled,
  onRun,
  children,
}: {
  area: RiskArea;
  examples: DemoExample[];
  results: Record<string, UseCaseResult>;
  selected: string;
  running: string;
  disabled: boolean;
  onRun: (exampleId: string) => void;
  children?: ReactNode;
}) {
  return (
    <section className="card area-card">
      <h3>{area.name}</h3>
      <p className="hint">{area.question}</p>
      <div className="test-grid">
        {examples.map((example) => {
          const result = results[example.id];
          const tag = result ? resultTag(result) : null;
          return (
            <button
              key={example.id}
              type="button"
              className={`test${selected === example.id ? " is-selected" : ""}${running === example.id ? " is-running" : ""}`}
              onClick={() => onRun(example.id)}
              disabled={disabled}
              title={example.note}
            >
              <span className="test-title">{example.title}</span>
              <span className="test-tags">
                {example.custom && <span className="tag tag-accent">Custom</span>}
                <span className="tag tag-outline">{STAGE_LABELS[example.stage]}</span>
                {running === example.id && <span className="spinner spinner-sm" aria-label="Running" />}
                {tag && running !== example.id && <span className={`tag-text tone-${tag.tone}`}>{tag.text}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {children}
    </section>
  );
}

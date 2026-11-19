import { useState } from "react";
import type { CustomRule, DemoConfig, DemoConnection } from "../api/demo";
import { CustomRuleEditor } from "./CustomRuleEditor";
import { RegionalProfiles } from "./RegionalProfiles";
import { ServerSettings } from "./ServerSettings";

const SECTIONS = [
  { id: "servers", label: "Servers" },
  { id: "profiles", label: "Regional profiles" },
  { id: "rule", label: "Custom rule" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

type ConnectionDraft = DemoConnection & {
  api_key: string;
  llama_guard_api_key: string;
  nim_api_key: string;
};

function draftFrom(config: DemoConfig): ConnectionDraft {
  return {
    ...config.connection,
    api_key: "",
    llama_guard_api_key: "",
    nim_api_key: "",
  };
}

export function Configuration({
  config,
  onChange,
}: {
  config: DemoConfig;
  onChange: (next: DemoConfig) => void;
}) {
  const [section, setSection] = useState<SectionId>("servers");
  const [connection, setConnection] = useState<ConnectionDraft>(draftFrom(config));
  const [rule, setRule] = useState<CustomRule>(config.custom_rule);

  const adopt = (next: DemoConfig) => {
    onChange(next);
    setConnection(draftFrom(next));
    setRule(next.custom_rule);
  };

  return (
    <section className="view config-view">
      <div className="page-head">
        <h2>Configuration</h2>
        <p>Server connections, the regional ID profiles, and the custom refund rule each have their own view.</p>
      </div>
      <div className="subnav" role="tablist" aria-label="Configuration sections">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {section === "servers" && (
        <ServerSettings config={config} connection={connection} setConnection={setConnection} onChange={adopt} />
      )}
      {section === "profiles" && <RegionalProfiles />}
      {section === "rule" && <CustomRuleEditor rule={rule} setRule={setRule} onChange={adopt} />}
    </section>
  );
}

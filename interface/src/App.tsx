import { useEffect, useState } from "react";
import { demoApi, type DemoConfig } from "./api/demo";
import { AppShell } from "./components/AppShell";
import { DemoProvider } from "./state/DemoContext";

export default function App() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    demoApi.config().then(setConfig).catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="center-screen">
        <p className="banner banner-critical">The web app did not answer. {error}</p>
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
    <DemoProvider initial={config}>
      <AppShell />
    </DemoProvider>
  );
}

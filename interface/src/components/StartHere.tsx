import { navigate } from "../state/DemoContext";

const STEPS = [
  { title: "Pick a risk", text: "Risk areas are listed on the left of the live screen, each with one to three test requests." },
  { title: "Watch the check", text: "The pipeline on the right lights up and shows exactly where the request was stopped." },
  { title: "Close a gap", text: "When a risk gets through, write a custom policy, test it, deploy it, and run the test again." },
];

const GLOSSARY = [
  ["Input check", "Reads the customer's message before the AI answers."],
  ["Output check", "Reads the AI's draft before the customer sees it."],
  ["Payment check", "Approves or stops a transfer using account age and device."],
  ["Judge", "A safety model that reads a written rule and answers yes or no."],
  ["Custom policy", "A rule compliance writes in plain English, tests with example sentences, and deploys to the guard server."],
  ["Gap", "A risky reply that reached the customer because no policy covers it yet."],
];

export function StartHere() {
  return (
    <div className="stack">
      <section className="card">
        <h2 className="card-heading">What this demo shows</h2>
        <p className="lead">
          A bank's AI assistant gets real customer requests. Each one goes through a guard server that checks the
          question, the drafted answer, and any money movement. You see what the customer would get with and without
          guardrails, and how compliance can close a gap by writing a new policy.
        </p>
        <p className="hint">
          Some tests use a scripted risky draft so the check always has something to catch. The real AI answer is shown
          underneath.
        </p>
      </section>

      <div className="three-up">
        {STEPS.map((step, index) => (
          <section key={step.title} className="card">
            <span className="step-dot">{index + 1}</span>
            <h3>{step.title}</h3>
            <p className="hint">{step.text}</p>
          </section>
        ))}
      </div>

      <section className="card row-card">
        <div>
          <h3>Before the audience arrives</h3>
          <p className="hint">Open Setup, test the guard server and both models, and check that the readiness badge says Ready.</p>
        </div>
        <button type="button" className="btn" onClick={() => navigate("setup")}>
          Open setup
        </button>
      </section>

      <section className="card">
        <h3>Five-minute presenter script</h3>
        <ol className="script">
          <li>Run <strong>Branch hours</strong> with Try a normal question. Normal questions still get normal answers.</li>
          <li>Run <strong>Mutual fund</strong>. Advice is stopped before the assistant even writes a reply.</li>
          <li>
            Run <strong>Biased reply</strong>. Even if the AI drafts something risky, the output check catches it.
            This test uses a scripted risky draft so the check always has something to catch. The real AI answer is
            shown underneath it.
          </li>
          <li>Run <strong>New account transfer</strong>. The payment is stopped and the balance does not change.</li>
          <li>Run <strong>Refund promise</strong>. If no custom policy is live, it gets through: a gap. Press <strong>Close this gap</strong>.</li>
          <li>In <strong>Custom policies</strong>, read the rule, press <strong>Test rule</strong>, then <strong>Deploy</strong>. Press <strong>Run the gap test again</strong>: blocked.</li>
          <li>Press <strong>Run all tests</strong> and open the <strong>Audit trail</strong> to close.</li>
        </ol>
        <button type="button" className="btn btn-primary" onClick={() => navigate("live")}>
          Start the demo
        </button>
      </section>

      <section className="card">
        <h3>Words used on screen</h3>
        <dl className="glossary">
          {GLOSSARY.map(([term, text]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

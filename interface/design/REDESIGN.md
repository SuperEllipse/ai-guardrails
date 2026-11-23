# Banking Guardrails demo: UI redesign spec

This is the source of truth for redesigning the demo UI in `interface/src`. It explains what each screen must do, how it maps to the code today, what must change, and how to verify the result.

The design is approved. Build what is described here. When this document and the wireframe disagree, this document wins.

## 1. Design artefacts

| File | What it is |
|---|---|
| `interface/design/wireframe.html` | Clickable wireframe, approved version. One self-contained file; open it in any browser. Visual and interaction reference only. |
| `interface/design/screenshots/*.png` | Screenshots of every tab and the key states, captured from the wireframe at 1280 px. Referenced below. |
| `interface/design/tools/capture_screenshots.py` | Playwright script that recaptures the screenshots. Copy and adapt it to capture the real app for comparison (section 10). |
| `interface/design/history/` | Earlier wireframe versions. For context only; do not build from them. |

The wireframe is a mockup. Its replies, timings, endpoint addresses, keyword matching, ID patterns, and stress-test numbers are placeholders. Section 8 lists exactly what must come from the backend instead.

## 2. Goals and design principles

The audience is bank risk, compliance, and technology leaders watching a live demo. Today the app shows the machinery (guard server, ID profile version, custom rule) before the audience knows what question the demo answers.

1. **Story first.** Every screen answers "what risk, what happened, what did the customer get, where is the proof". Machinery is secondary.
2. **One screen per job.** The live test fits on one screen: risks on the left, the result on the right. No horizontal scrolling strips.
3. **Show the flow.** The pipeline is numbered, ordered, and connected by arrows, and lights up as the request moves.
4. **Gaps are a feature.** A risky reply that gets through is shown honestly (amber "Gap found") and leads straight to fixing it with a custom policy.
5. **Plain language.** Labels are written for a non-engineer (glossary in section 9). No internal IDs such as `redress_liability` or `v1` in the UI.
6. **Real behaviour only.** Every state shown comes from the backend. Never simulate a result in the frontend. Section 2A defines this precisely and overrides anything else in this document.

## 2A. Real AI calls only (non-negotiable)

This is a demo of an AI application. Every model answer, verdict, rewritten reply, status, and timing the audience sees must come from a real call made at that moment: to the answer model, the guard server, or the configured judge (answer model, Llama Guard, or NVIDIA NIM). This applies to both the frontend and the backend. Not allowed:
- mocks, stubs, or canned responses
- recorded replies presented as live
- verdicts computed in the frontend
- "demo mode" switches that skip calls
- silent fallbacks

### What must be real

| What the audience sees | Real call that produces it | Code today |
|---|---|---|
| AI assistant draft ("Without guardrails") | Banking agents calling the answer model | `_draft_from_agents()` → `run_banking_crew()` in `src/api/usecase_runner.py` |
| "Live AI answer, not scripted" under a scripted test draft | The same agents call, made on every run of that test | 7.7 |
| Input check and output check verdicts | Guard server `POST /v1/demo-check` | `check_messages()` in `src/guardrails/guard_client.py` |
| Judge yes or no | `POST {judge}/chat/completions` on the configured judge endpoint | `judge_text()` / `_ask_model()` in `src/guardrails/written_rules.py` |
| Rewritten safe reply | Guard server, using the deployed policy and the region | `_regional_message()` via the output check |
| Payment verdict and balances | Guard server `POST /v1/transfer-check` | `check_transfer()` → `src/guardrails/transfer_gate.py` |
| Custom policy test rows | One judge call per example sentence | `test_custom_rule()` in `src/api/demo_api.py` |
| Deploy and remove | Copy the file, then guard server `/v1/reload` | `deploy_custom_rule()`, `reload_server()` |
| Connection status and readiness | Live probe of each endpoint | `probe_target()` in `src/guardrails/connection_probe.py` |
| Stress test results | Guard server, once per attack prompt | `stream_redteam()` in `src/simulation/redteam.py` |
| Audit trail | Records written by the calls above | `record_log()` in `src/guardrails/audit_log.py` |
| Durations ("1.2 s") | Measured on the server during the call | none today (7.10) |

### Deterministic by design (allowed, but must be labelled honestly)

These are real checks that intentionally do not use a model. Do not present them as AI.
- **ID and card screening:** regional pattern matching on the guard server (`screen_pii`; see `checks.co`: "Personal data does not call a model"). Label the step "Pattern check, no model".
- **Payment rules:** account age and known device, evaluated against the demo ledger (`transfer_gate.py`). Show a "Demo ledger" tag on balances.
- **Customer records the agents look up:** `data/dummy_cis`. Label them "Demo customer data" wherever they appear.
- **Test inputs:** the customer message, the transfer parameters, and the custom policy example sentences. These are inputs, not results.
- **Scripted test drafts (7.7):** a fixed risky draft for the output-check and payment tests, so the check under test always has something to catch. It is an input, so it is allowed under these conditions:
  - it is always tagged "Scripted test draft"
  - the guard server and judge verdict on it is real
  - the live AI answer is shown underneath it

### Backend behaviour that breaks this rule today (fix before building the UI on it)

1. **Scripted drafts shown as AI answers.** `kind: "fixed_draft"` examples (`fair`, `output-advice`, `refund`) return the hard-coded `draft` from `demo_examples.py`, and the UI presents it as the assistant's answer. Payment examples return a template string ("I'll transfer $500…"). No real model answer is shown for these tests. Fix in 7.7 by labelling the draft as scripted and adding the live AI answer.
2. **Hard-coded gap verdict.** `usecase_runner.py` sets `path = "refund_pending"` because `example["id"] == "refund"`, not because of what the checks returned. Fix in 7.8.
3. **Hidden judge substitution.** When Llama Guard or NIM replies in its own safe/unsafe format, `judge_text()` silently re-asks the answer model, so the UI would credit the wrong model. Fix in 7.9.
4. **Invented numbers.** The wireframe's durations and probe messages are placeholders. Fix in 7.10.

### Rules for every screen

- **Fail closed and visibly.** If any call errors or times out, show the error state with the backend's error text and a link to Setup. Never show Allowed or Passed. Never fill in a scripted, cached, or previous reply.
- **No verdict logic in the frontend.** Render `path`, `outcome`, `input`, `output`, `payment`, `judge`, and `timings_ms` exactly as returned.
- **No mock or offline mode.** Do not add flags, environment variables, or fixtures that skip the model, guard server, or judge in the running app. Unit tests may stub calls, but only inside test code.
- **Show non-determinism honestly.** Model output can vary. If the judge disagrees with the expected outcome, show that as it happened ("Gap found", "Stopped by mistake") with "Run again". If the live AI answer would also have been blocked, or is harmless, show its real verdict. Never correct it.
- **Animation replays the real result.** Pipeline pacing is cosmetic. Step states and per-step durations come from the response.

## 3. Information architecture

| New tab | Replaces | Purpose |
|---|---|---|
| Start here | Nothing (new) | What the demo shows, a presenter script, and a glossary |
| Live risk test | "Compliance / Risks" (`UseCases.tsx`) | Run tests by risk area and see the pipeline and the two replies |
| Custom policies | Configuration → "Custom rule" (`CustomRuleEditor.tsx`) | Write, test, deploy, and verify a custom policy |
| Stress test | "Red teaming" (`RedTeam.tsx`) | Batch adversarial prompts with a summary |
| Audit trail | The side "Guardrail log" panel in `UseCases.tsx` | Every guard decision and policy test, filterable, with detail |
| Setup (right-aligned) | Configuration → "Servers" and "Regional profiles" (`ServerSettings.tsx`, `RegionalProfiles.tsx`) | Connections, judge choice, regional ID profiles, policy scripts |

Keep hash routing (`#/<tab>` in `App.tsx`). New tab ids: `guide`, `live`, `policies`, `stress`, `audit`, `setup`. Map the old ids (`usecases`, `configuration`, `redteam`) to the new ones so existing links keep working. Default tab: `live`.

## 4. Global shell

![Live risk test, idle](screenshots/02-live-risk-test-idle.png)

- **Title:** "Safe AI Banking Assistant". **Subtitle:** "Watch guardrails stop risky answers and payments before they reach a customer." Replaces the "Banking assistant / Guardrails" eyebrow and heading in `App.tsx`.
- **Status chips (header, right):**
  - "Guard server connected" (or "not connected"). Clicking it opens Setup.
  - "Judge <name>". Clicking it opens Setup.
  - "Custom policies N of M live".
- **Tab badges:**
  - Custom policies: "Live" or "Not live".
  - Audit trail: record count.
  - Setup: "Ready" or "Check".
- **Theme toggle:** keep `ThemeToggle`.
- **Data:** chip values come from `DemoConfig` (`connection.safety_mode`, `custom_rule.deployed`) plus the last connection probe results (section 7.6).

## 5. Screens

### 5.1 Start here

![Start here](screenshots/01-start-here.png)

- **"What this demo shows":** one paragraph.
- **Three steps:** pick a risk, watch the check, close a gap.
- **"Before the audience arrives":** a card with an "Open setup" button.
- **Presenter script:** seven numbered steps, as in the wireframe. The tests named must exist in `demo_examples.py`. A "Start the demo" button opens Live risk test.
- **Glossary:** input check, output check, payment check, judge, custom policy, gap.

**Current code:** none. `DemoGuide.tsx` is legacy and not used by `App.tsx`. **Change:** new `StartHere.tsx`, static content.

### 5.2 Live risk test

| Blocked at output | Blocked at input | Payment blocked |
|---|---|---|
| ![](screenshots/03-live-blocked-at-output.png) | ![](screenshots/04-live-blocked-at-input.png) | ![](screenshots/05-live-payment-blocked.png) |

| Gap found | Gap closed after deploy | All tests run |
|---|---|---|
| ![](screenshots/06-live-gap-found.png) | ![](screenshots/09-live-gap-closed.png) | ![](screenshots/10-live-run-all-tests.png) |

**Layout:** two columns, about 5:7.
- **Top bar (full width):** Customer region, a score line ("N of M run · blocked · allowed · gaps", pluralised correctly), "Try a normal question", "Run all tests".
- **Left column:** six risk-area cards, stacked. Each card has a name, a one-line regulator question, and test buttons. Each button shows a stage tag (Input, Output, Payment), a "Custom" tag where relevant, and a result tag once run (Blocked, Allowed, Gap found).
  - The Customer data card holds the ID detection select and the "Check all regions" checkbox.
  - The Promises and commitments card shows the custom policy status, with a "Set up" or "Edit" link to Custom policies.
- **Right column (stays on screen while the left scrolls):**
  - **Card 1, "How the request was checked":**
    - Lane strip above the steps: Customer | Guard server | AI | Guard server | Customer.
    - The numbered pipeline (below).
    - Legend.
    - Verdict bar, for example "Blocked at the output check", plus the risk area.
  - **Card 2, "What the customer gets":**
    - Empty state before any run.
    - Without guardrails and With guardrails, side by side. Each shows the customer message and the assistant reply. For payments, add a balance line (before → after) to each side.
    - For scripted-draft tests (7.7), the "Without guardrails" reply carries a "Scripted test draft" tag. Underneath it is a dashed box headed "Live AI answer, not scripted": the real answer-model reply to the same message, clamped to two lines with "Show full answer", plus its own output-check verdict. Other tests label the reply "Assistant, live AI answer".
    - One-sentence reason.
    - "Open audit record <id>" link, which opens the Audit trail with that row selected.
    - When the result is a gap: an amber "No policy covers this yet" call to action with a "Close this gap" button that opens Custom policies.

**Risk areas and tests (rename `area` in `src/api/demo_examples.py`):**

| Risk area (card) | Regulator question | Tests (example id) |
|---|---|---|
| Investment advice | Can it give advice it is not licensed to give? | Mutual fund (`advice`), Bitcoin (`bitcoin`), Fund pick in answer (`output-advice`) |
| Promises and commitments | Can it promise things only staff can approve? | Lock a rate (`commit`), Refund promise (`refund`, custom) |
| Fair treatment | Can it treat a customer unfairly? | Biased reply (`fair`) |
| Customer data | Does it keep sensitive data out of the chat? | National ID (`pii-nric`), Card and one-time code (`pii-card`) |
| Fraud and payments | Can it move money for a risky account? | New account transfer (`pay-new`), Known customer transfer (`pay-aged`) |
| Prompt attacks | Can someone talk it out of its rules? | Jailbreak (`jailbreak`) |

"Branch hours" (`happy`) is not a card. It runs from the "Try a normal question" button.

**Pipeline, in execution order:**

| # | Step | Shape | Source in `UseCaseResult` |
|---|---|---|---|
| 1 | Customer | circle | always reached |
| 2 | Input check | rounded square (guard) | `input` (`blocked`, `error`, `model_call`, `rule`, `message`) |
| 3 | AI assistant | circle | reached unless `path === "input_blocked"` |
| 4 | Payment check | rounded square (guard) | `payment` (`allowed`, `reason`, `error`); "Skipped" when `payment` is null |
| 5 | Output check | rounded square (guard) | `output` |
| 6 | Reply | circle | "Passed", or "Risky reply sent" when `path === "refund_pending"` |

- **Step states:**
  - Checking: blue, slightly raised.
  - Passed: green.
  - Stopped: red, with ✕ instead of the number.
  - Risky reply sent: amber, with !.
  - Skipped: faded.
- **Arrows:** each arrow goes blue, then green, as the request moves to the next step. Arrows after a stop are grey and dashed.
- **Animation:** each step takes about 400 ms. Respect `prefers-reduced-motion` (no animation; show the final state).
- **Verdict mapping from `result.path`:**

| `path` | Verdict | Colour |
|---|---|---|
| `input_blocked` | Blocked at the input check | red |
| `output_caught` | Blocked at the output check | red |
| `payment_blocked` | Blocked at the payment check | red |
| `payment_allowed` | Allowed and delivered | green |
| `refund_pending` | Gap found: the risky reply reached the customer | amber |
| `error` | The guard server did not answer. Check Setup. | red banner, with a link to Setup |
| anything else | Allowed and delivered | green |

- **Run all tests:** runs every example in order with a short step time, updates each result tag, and leaves the last result on the right.
- **Regions:** use `config.regions` (SG, AU, US, EU, IN). The wireframe's "United Kingdom" is a placeholder; do not add it.

**Current code:** `UseCases.tsx` has a toolbar (region, ID profile version, all regions, custom-rule hint), a horizontally scrolling `scenario-bar`, three `Station` cards in the wrong order (agents, guard, judge), a chat thread, a comparison card, and the `GuardLog` side panel. `buildFrames()` already derives the animation frames from `input`, `output`, and `payment`.

**Change:**
- Split `UseCases.tsx` into `LiveRiskTest.tsx`, `RiskAreaCard.tsx`, `Pipeline.tsx`, and `ResultCompare.tsx`.
- Rewrite `buildFrames()` to produce the six ordered steps and the arrow states.
- Remove the chat thread, the custom-rule hint, and `GuardLog` (it moves to the Audit trail).
- Move the version select and "all regions" into the Customer data card.

**Acceptance:**
- All six cards and the result are visible at 1280×800 without horizontal scrolling.
- The right column stays in view while the cards scroll.
- Every example shows the verdict and colours in the table above.
- The refund example shows a gap before deploy and a block after deploy.

### 5.3 Custom policies (policy studio)

| Studio, before testing | Tested and deployed |
|---|---|
| ![](screenshots/07-custom-policy-studio.png) | ![](screenshots/08-custom-policy-tested-and-deployed.png) |

**Layout:**
- **Header card:** title, a one-line explanation, the policy select, and a status pill (Not deployed, Live, or Changes not deployed).
- **Progress bar:** five steps, each marked done, current, or pending.
- **Main column:** five numbered section cards.
- **Side column:** "The gap this policy closes" (customer message and AI draft from the `refund` example), "Before and after", and a collapsed list of the built-in policies.

**Steps and data (`CustomRule` in `demo.ts`):**
1. **Write the rule:** policy name (read-only `name` for now), rule text (`policy`), and "Check at" (Output, fixed; shown as a disabled checkbox).
2. **Set the safe reply:** Default (`message_default`), Australia (`message_au`), Singapore (`message_sg`).
3. **Test with examples:** "Should be stopped" (`should_block`) and "Should be allowed" (`should_pass`), one per line. "Test rule" calls `saveRule`, then `testRule`. Show the result table (Sentence, Expected, Result with an "as expected" or "not expected" tag) and a pass or fail banner. Any edit clears the result and locks Deploy again.
4. **Deploy to the guard server:** a four-item progress list (save file, copy to server, reload server, live) driven by `deployRule`. Show `reload.detail` when `reload.reloaded` is false. Deploy is enabled only after the latest test passed. Add "Remove from server" (needs a new endpoint, section 7.3).
5. **Run the gap test again:** opens Live risk test and runs the `refund` example. Mark the step done when the result is `output_caught`.

**Entry points:**
- The "Close this gap" button on a gap result.
- The "Set up" / "Edit" link on the Promises and commitments card.
- The Custom policies tab.

**Current code:** `CustomRuleEditor.tsx` already has every field, Test (save, then test), and Deploy (enabled after a passing test).

**Change:**
- New `PolicyStudio.tsx`, reusing the `CustomRuleEditor` logic.
- Add the progress bar, the side column, the deploy progress list, the verify step, and "Remove from server".
- The policy select lists the single custom rule plus a disabled "New policy (coming soon)" option.

**Acceptance:**
- The whole flow works against the real backend: gap → test → deploy → re-run → blocked, with the regional sentence for SG and AU.
- The status pill, tab badge, header chip, and card status always agree.

### 5.4 Stress test

![Stress test](screenshots/12-stress-test.png)

**Current code:** `RedTeam.tsx` streams results (`streamRedteam`) and has `misses`, `overblocks`, past runs, and a CSV download.

**Change:**
- Rename to "Stress test".
- Add three summary figures at the top from the live run or the selected past run: caught (blocked) / total, "Should have been stopped" (misses), "Stopped by mistake" (overblocks).
- Add a per-policy table from `by_policy`.
- Keep the existing prompt and result lists below.
- The wireframe numbers are placeholders.

### 5.5 Audit trail

![Audit trail](screenshots/11-audit-trail.png)

- **Header:** title, a one-line explanation, and a filter: All records, Blocked, Allowed, Policy tests.
- **Table columns:** Time, Test, Risk area, Check, Verdict.
  - Check values: Input, Output, Payment, Policy test.
  - Verdict tags: Blocked (red), Allowed (green), or the plain outcome for policy tests.
- **Detail card below:** record id, time, risk area, region, input, outcome, reason.
- **Deep links:** "Open audit record" on the live screen selects the matching row. The tab badge shows the record count.

**Current code:**
- `GuardLog` in `UseCases.tsx`, fed by `demoApi.logs()` / `log(id)`.
- Records come from `record_log()` in `src/guardrails/audit_log.py`, with fields `id`, `created`, `source` (`compliance` | `custom_rule`), `input_prompt`, `output_response`, `violation`, `reason`.

**Change:**
- New `AuditTrail.tsx`.
- Backend: add `example_id`, `title`, `area`, `stage`, `region` to the log records (section 7.4).
- The usecase endpoint must return the new log `id` so the live screen can deep-link to it.

### 5.6 Setup

| Connections | Judge test failed | Saved and ready |
|---|---|---|
| ![](screenshots/13-setup-connections.png) | ![](screenshots/14-setup-judge-test-failed.png) | ![](screenshots/15-setup-saved-and-ready.png) |

| Regional ID profiles | Policy scripts |
|---|---|
| ![](screenshots/16-setup-regional-id-profiles.png) | ![](screenshots/17-setup-policy-scripts.png) |

A sub-navigation switches between Connections, Regional ID profiles, and Policy scripts. The header card shows "Ready to demo" or "Needs attention".

#### 5.6.1 Connections

**Main column**, four numbered cards. Each connection card has a status pill (Connected, Not tested, Not connected, or Testing) and a result line in plain English.

1. **Guard server:** Address (`server_url`). Test runs `probe({target: "guard"})`.
2. **Answer model:** Address (`base_url`), Model name (`model`), Token (`api_key`; password field; placeholder "Saved token stays if this is blank" when `has_api_key`). Test runs `probe({target: "answer"})`.
3. **Judge:** three option cards for `safety_mode`:
   - `self_check`, "LLM as self judge": shows a note that it reuses the answer model; no fields.
   - `llama_guard`, "Llama Guard": fields `llama_guard_base_url`, `llama_guard_model`, `llama_guard_api_key`.
   - `nim`, "NVIDIA NIM": fields `nim_base_url`, `nim_model`, `nim_api_key`.

   Test runs `probe({target: "llama_guard" | "nim" | "answer"})` to match the choice.
   **Where values come from (all connection cards).** Project environment variables are the main configuration. Values saved here override them (7.11).
   - Under each field, show a small source tag: "From project settings", "Saved in app (overrides project settings)", or "Built-in default".
   - When no token is saved, the token field shows "Using the session token automatically".
   - A "Use project settings" link on each card clears that card's saved overrides.
4. **Save and apply:** one button for the whole form, replacing today's Save button on each card. It calls `saveConnection`, then shows a three-item progress list (save settings, reload guard server, sample check). The sample check reuses the guard probe. It is enabled only when there are unsaved changes and every changed connection has passed its test. Show `reload.detail` when the server did not reload.

**Side column (stays on screen):**
- **"How it connects" map:** Banking assistant → Guard server → (Answer model, Judge). Each box shows a status dot, and clicking a box scrolls to its card.
- **Readiness checklist:** guard reachable, answer model replies, judge answers, settings saved.

**Current code:** `ServerSettings.tsx` has the judge select, four `EndpointCard`s, each with its own Save and Test, plus a read-only scripts viewer.

**Change:**
- New `Setup.tsx` and `Connections.tsx`, reusing the `payload()`, `save()`, and `test()` logic.
- Replace the per-card saves with one save.
- Add the map, readiness, and status pills.
- Track a "dirty" state for each connection.
- Placeholder: the endpoint addresses, timings, and messages in the wireframe. Use `public_connection()` values and the `probe` `detail`.

#### 5.6.2 Regional ID profiles

- **"How strictly IDs are detected":** three selectable cards from `profiles().versions` (name and comment). The selection is the default for the ID detection select on the live screen. Store it in app state; local storage is fine.
- **"ID types by region":** region pills from `profiles().profiles` (including "Every region"), and a table with columns ID type (`label`), Looks like (`pattern`, monospace), Nearby words (`context`), Checksum (`checksum`). The wireframe's example values and region list are placeholders.
- **"Try a sentence":** a text input and a Check button. It shows the overall verdict and each match with the reason (shape matched, nearby word missing, checksum failed). Needs a new endpoint (section 7.5). Never re-implement the patterns in the frontend.

**Current code:** `RegionalProfiles.tsx` (read-only version cards, region buttons, an entity card for each ID type). **Change:** a table layout, a selectable version, and the tester.

#### 5.6.3 Policy scripts

Read-only. Pill buttons for each `.co` file from `config.files` (exclude `regions/*.yml`; those belong to Regional ID profiles), shown in a monospace panel. **Current code:** the `<details>` block in `ServerSettings.tsx`. **Change:** move it here.

## 6. Master mapping: wireframe feature → current code → change

| # | Wireframe feature | Current code | Change needed | Backend? |
|---|---|---|---|---|
| 1 | Title, subtitle, status chips | `App.tsx` header | New copy; chips from config and probes | No |
| 2 | Tabs and hash routing | `App.tsx` `TABS` | Six tabs; map old ids to new ones | No |
| 3 | Start here | `DemoGuide.tsx` (legacy, unused) | New static `StartHere.tsx` | No |
| 4 | Risk-area cards | `scenario-bar` in `UseCases.tsx`; `area` in `demo_examples.py` | Group by the new areas; stage tags; result tags | Yes: rename `area`, add `stage` and `question` |
| 5 | Two-column live layout with a right column that stays in view | Single column plus `GuardLog` aside | New grid; `position: sticky`; no `overflow: hidden` on ancestors | No |
| 6 | Numbered pipeline with arrows and lanes | `Station` × 3, `buildFrames()` | `Pipeline.tsx` with six ordered steps and arrow states | No |
| 7 | Verdict bar | `noteFor()` | Map from `path` (table in 5.2) | No |
| 8 | Side-by-side replies, payment balances | Comparison card and ledger table | `ResultCompare.tsx`; balance line on each side | No |
| 9 | Gap state and "Close this gap" | `refund_pending` note | Amber state and button to Custom policies | No |
| 10 | Score line, Run all tests | None | Client-side tally; sequential runs | No |
| 11 | Policy studio progress bar and steps 1–4 | `CustomRuleEditor.tsx` | `PolicyStudio.tsx`; progress bar; deploy progress list | No |
| 12 | Remove from server | None | Endpoint and button | Yes (7.3) |
| 13 | Run the gap test again | None | Open Live risk test and run `refund` | No |
| 14 | Stress test summary | `RedTeam.tsx` | Summary figures and per-policy table | No |
| 15 | Audit trail tab with filter and detail | `GuardLog` side panel | `AuditTrail.tsx` | Yes (7.4) |
| 16 | Deep link from a result to its audit record | None | Usecase returns `log_id` | Yes (7.4) |
| 17 | Setup connections, one save, readiness, map | `ServerSettings.tsx` | `Connections.tsx` | No |
| 18 | Judge option cards | Judge `<select>` | Radio cards; fields shown for the chosen judge | No |
| 19 | Regional ID profiles as a table, default version | `RegionalProfiles.tsx` | Table, selectable version, shared state | No |
| 20 | Try a sentence | None | Tester UI | Yes (7.5) |
| 21 | Policy scripts | `<details>` in `ServerSettings.tsx` | Own sub-tab | No |
| 22 | Ready / Check badge | None | Derived from probe results and dirty state | Optional (7.6) |
| 23 | "Without guardrails" draft for every example | `unguarded_draft()` returns scripted `draft` for `fixed_draft` and a template for `payment` | Scripted drafts tagged "Scripted test draft"; live answer-model reply shown underneath, clamped to two lines, with its own output-check verdict | Yes (7.7) |
| 24 | Gap found / As expected / Stopped by mistake | `path = "refund_pending"` keyed on example id | `outcome` computed from expected vs actual verdict | Yes (7.8) |
| 25 | "Judged by …" on judge steps and audit rows | Not returned; silent fallback to the answer model | `judge` provenance on every judge call | Yes (7.9) |
| 26 | Per-step durations, probe latency | Not returned | `timings_ms` measured on the server | Yes (7.10) |
| 27 | Error state on any step | `path = "error"` exists; UI handling is partial | Every failed call shows an error with a Setup link; never Allowed | No |
| 28 | Source tag per setting, "Use project settings" | `connection.yml` silently overrides env | Show the source; reset clears the override | Yes (7.11) |

## 7. Backend changes

### 7.1 Examples (`src/api/demo_examples.py`, `DemoExample` in `demo.ts`)

- Rename `area` to the six names in 5.2. `happy` becomes `Everyday banking`. Move `jailbreak` to `Prompt attacks` and `output-advice` to `Investment advice`. `refund` belongs to `Promises and commitments`.
- Add `stage`: `"input" | "output" | "payment"`.
- Add `custom: true` on `refund`.
- Add an `AREAS` list with `id`, `name`, `question`, and order, and expose it as `config.areas`, so the frontend does not hard-code the cards.

### 7.2 Use case (`POST /api/demo/usecase`)

Return `log_id` (the id written by `record_log`). No other change. `path`, `input`, `output`, and `payment` already carry everything the pipeline needs.

### 7.3 Custom rule undeploy (new `POST /api/demo/custom-rule/undeploy`)

Delete `DEPLOYED`, call `build_active_config()`, call `reload_server()`, and return `{deployed: false, reload}`. It mirrors `deploy_custom_rule`.

### 7.4 Audit log (`src/guardrails/audit_log.py`)

- Add nullable columns `example_id`, `title`, `area`, `stage`, `region`, `judge` (7.9), `draft_source`, `live_answer`, and `live_verdict` (7.7). Add them with `ALTER TABLE ... ADD COLUMN` when missing, so existing databases keep working.
- Pass them from `usecase()` and from `test_custom_rule()` (with `stage = "policy_test"`).
- Return them from `list_logs()` and `get_log()`.
- Extend `GuardLogEntry` in `demo.ts`.

### 7.5 ID tester (new `POST /api/demo/profiles/try`)

- **Body:** `{text, region, profile_version, all_regions}`.
- **Implementation:** wrap `screen_pii()` / `load_profiles()` in `src/guardrails/pii_screen.py`.
- **Return:** `{blocked, matches: [{entity, label, value, matched, reason}]}`, where `reason` is one of `shape`, `no_nearby_word`, `checksum_failed`, `matched_with_word`.

### 7.6 Readiness (optional)

The frontend can derive readiness from probes run in the current session. If a check on page load is wanted, add `GET /api/demo/connection/status`, which probes guard, answer, and the active judge, and returns `{guard, answer, judge}` with `ok` and `detail`.

### 7.7 Scripted test draft plus the live AI answer (`demo_examples.py`, `usecase_runner.py`, `UseCaseResult`)

The output check and payment check need something risky to catch on every run, so some tests use a fixed risky draft. To stay honest, the draft is always labelled as scripted, and the real model answer to the same message is shown with it.

- **Which tests.**
  - Rename `kind: "fixed_draft"` to `kind: "scripted_draft"` for `output-advice`, `fair`, and `refund`. Keep their `draft` strings.
  - Payment examples (`pay-new`, `pay-aged`) also use `scripted_draft`. Move the "I'll transfer $…" template into a `draft` string on the example. The transfer parameters stay as test inputs.
  - Every other example uses the agents' live answer as its draft, as today.
- **The test path is real.** The scripted draft goes through the real guard server:
  - output check via `check_messages()`, including the configured judge
  - payment check via `check_transfer()`

  `path`, `outcome`, `guarded_response`, and the audit record all come from that real verdict.
- **The live answer, on every run of a scripted test.**
  - In the same request, call `_draft_from_agents(query)` with the configured answer model. Do not add a second model setting.
  - Send the reply through the real output check too.
  - Run it concurrently with the scripted path (`asyncio.gather`) to keep latency down.
- **Response shape.** `UseCaseResult` gains:
  - `draft_source: "scripted" | "live"`
  - `live_answer: {text, output: <same shape as result.output>, error, timings_ms} | null`. It is null for tests that are already live.
- **Audit.** The audit record stores `draft_source`. It stores the live answer and its verdict as a second row linked by `log_id`, or in nullable `live_answer` / `live_verdict` columns (7.4).
- **What the UI shows** (see `screenshots/03-live-blocked-at-output.png`):
  - The "Without guardrails" reply has a "Scripted test draft" tag.
  - Underneath it is a dashed box headed "Live AI answer, not scripted". It shows the real reply, clamped to two lines with "Show full answer", and a verdict chip, for example "Output check: Allowed". For payments, the chip reads "Shown only", because the transfer is decided by the payment check on the scripted request.
  - Tests that are already live label the reply "Assistant, live AI answer" and have no box.
  - If the live call fails, the box shows the model error ("The answer model did not answer: …"). The scripted test still shows its real verdict. Never put placeholder text in the box.
- **Start here copy.** Add one line: "Some tests use a scripted risky draft so the check always has something to catch. The real AI answer is shown underneath."

### 7.8 Expected vs actual outcome (`demo_examples.py`, `usecase_runner.py`, `UseCaseResult`)

- **Expected verdict.** Add `expected: "block" | "allow"` to every example. This is test metadata, not a result.
- **Remove the hard-coded gap.** Remove the `example.get("id") == "refund"` branch. `path` only records where the run stopped: `input_blocked`, `output_caught`, `payment_blocked`, `payment_allowed`, `happy`, or `error`.
- **Return `outcome`:**
  - `as_expected`
  - `gap`: expected block, but the real checks allowed it
  - `overblock`: expected allow, but it was blocked
  - `error`
- **"Close this gap".** Show it when `outcome == "gap"` and the example has `custom: true`. For any other gap, show "Not covered by a policy yet".
- **Rename in the UI.** "Gap found" replaces `refund_pending` (section 9).

### 7.9 Judge provenance (`written_rules.py`, `UseCaseResult`, audit log)

- **Return provenance.** `judge_text()` returns `judge: {mode, base_url_host, model, answered_by, fallback_reason}`.
  - `answered_by` is `"llama_guard"`, `"nim"`, or `"answer_model"`.
  - When Llama Guard or NIM replies in its own safe/unsafe format and the code re-asks the answer model, set `answered_by: "answer_model"` and `fallback_reason: "Llama Guard replied safe/unsafe, not yes/no"`.
- **Pass it through.** Send it via the guard server response, `UseCaseResult.input/output`, `test_custom_rule` rows, and a new nullable `judge` column in the audit log (7.4).
- **Show it.** The pipeline judge step and the audit detail read "Judged by Llama Guard (model name)", or "Judged by the answer model, because Llama Guard replied in its own format". Never credit a model that did not answer.

### 7.10 Measured timings

- **Use case.** `usecase()` returns `timings_ms: {input, agents, payment, output, total}`, measured with `time.perf_counter()` around each real call. Omit steps that did not run.
- **Probes.** `probe_target()` returns `latency_ms`.
- **UI.** Show only these values. Never show a duration the backend did not measure.

### 7.11 Configuration source (`src/guardrails/connection.py`, `PUT /api/demo/connection`)

- **Configuration comes from project settings.** Cloudera AI project environment variables are the source of truth (README step 3; `scripts/setup_project_env.py`). `guardrails/catalog/connection.yml` holds only explicit overrides saved from Setup.
- **Report the source.** `public_connection()` returns `sources: {field: "project" | "saved" | "default"}`.
- **Clear overrides.** `PUT /api/demo/connection` accepts `{reset: [field, ...]}`, which removes those keys from `connection.yml` so the project value applies again.
- **Tokens.** Never write a token to `connection.yml` unless the user typed one into Setup. Inside a Cloudera AI session, the token comes from `/tmp/jwt` through `read_session_jwt()`.

## 8. Placeholder content in the wireframe (do not copy)

- Unguarded and guarded replies, reasons, and the payment balances. Use `unguarded_response`, `guarded_response`, `payment.ledger_*`, and `input/output.rule/message` instead.
- Record ids, times, and seeded audit rows. Use `demoApi.logs()`.
- Policy test keyword matching. Use `testRule()`.
- Endpoint addresses, model names, timings, and probe messages. Use `config.connection` and the `probe` `detail`.
- ID patterns, region list, example IDs, and the tester logic. Use `profiles()` and 7.5.
- Stress test figures. Use `RedSummary`.
- The "United Kingdom" region. Use `config.regions`.
- The wireframe's replies, its "Live AI answer" sample text and verdicts, and its timer-driven pipeline. Replies and the live answer come from 7.7. Step states and durations come from the response (7.8, 7.10).
- The scripted test drafts belong in `demo_examples.py` (7.7), not in the frontend. The frontend never holds a draft or reply string.

## 9. Copy and terminology

Use these labels exactly. Sentence case everywhere. Buttons start with a verb.

| Use | Do not use |
|---|---|
| Live risk test | Compliance / Risks Guardrail Test |
| Guard server | NeMo server, rails server |
| Input check, Output check, Payment check | input rail, output rail, transfer gate |
| Judge | safety mode, self_check |
| LLM as self judge, Llama Guard, NVIDIA NIM | `self_check`, `llama_guard`, `nim` |
| Custom policy, Refund promises | Custom refund rule, `redress_liability` |
| Gap found | refund_pending |
| ID detection: Pattern / Pattern + nearby word / Checksum | v1 / v2 / v3 |
| Stress test | Red teaming |
| Audit trail | Guardrail log |
| Setup | Configuration |

Errors are one sentence that says what happened and what to do next, for example "NVIDIA NIM refused the request: no token. Add the NIM token and test again."

## 10. Visual system

- **Tokens:** use `interface/src/styles/tokens.css`. Do not add new colour values.
  - Red / Blocked: `--status-critical`, `-wash`, `-ink`.
  - Green / Allowed or Passed: `--status-good`.
  - Amber / Gap, Not tested, Changes not deployed: `--status-warning`.
  - Blue / Checking, selected, guard lane: `--accent`, `--accent-wash`.
- **Colour meanings:** red means stopped, green means passed or allowed, amber means risk got through or needs attention, blue means in progress or selected. Never use these colours decoratively.
- **Shapes:** guard-server steps are rounded squares; other pipeline steps are circles. Pair colour with text or a symbol (✕, !) so states never rely on colour alone.
- **Sticky columns:** no ancestor may use `overflow: hidden`, or sticky positioning breaks. Use `overflow: clip` if clipping is needed.
- **Breakpoints:**
  - Two columns down to about 680 px.
  - Pipeline stays as one row of six.
  - Below about 680 px, stack the columns.
- **Dark mode:** must work through the existing tokens and `ThemeToggle`.
- **Motion:** `prefers-reduced-motion` turns off pipeline animation.

## 11. Implementation phases

Ship one phase per pull request. After each phase, run the checks in section 12.

| Phase | Scope | Done when |
|---|---|---|
| 1. Shell | Title, chips, six tabs, hash mapping, Start here | Every tab renders; old hash links redirect; chips show real config |
| 2. Backend: real calls and data | 2A fixes; 7.1, 7.2, 7.4, 7.7–7.10 | Scripted drafts are tagged and paired with a live answer; no id-based verdicts remain; `draft_source`, `live_answer`, `outcome`, `judge`, `timings_ms`, `config.areas`, `stage`, and `log_id` are returned; logs carry the new fields; old database still works; section 12 real-call checks pass |
| 3. Live risk test | 5.2 complete | All acceptance points in 5.2 pass against the real backend |
| 4. Policy studio | 5.3 and 7.3 | Gap → test → deploy → re-run → blocked works end to end; undeploy restores the gap |
| 5. Audit trail | 5.5; remove `GuardLog` | Filter and detail work; deep link from the live screen selects the row |
| 6. Setup | 5.6.1, 5.6.3, and 7.11 | One save; failed probes show inline; readiness and badge update; judge change is reflected in the chips and pipeline; each field shows its source, and "Use project settings" clears overrides |
| 7. Regional profiles | 5.6.2 and 7.5 | Version default syncs with the live screen; the tester returns real backend results |
| 8. Stress test | 5.4 | Summary and per-policy table come from real runs |
| 9. Cleanup | Remove unused legacy components (`Architecture`, `BatchDashboard`, `ChatCompare`, `FlowPath`, `SettingsPanel`, `StatusBar`, `PolicyStatus`, `DemoGuide`) if nothing imports them; remove dead CSS | `npm run build` passes; no unused imports |

## 12. Verification for every phase

1. `cd interface && npm run typecheck && npm run build`.
2. Run the app with the backend and guard server, and work through the Start here presenter script end to end.
3. Capture the real app with a copy of `tools/capture_screenshots.py` pointed at the app URL, at the same 1280 px viewport. Compare it side by side with the matching file in `screenshots/`. List any differences in the pull request description, with a reason for each one you keep.
4. Check dark mode and a narrow (about 760 px) window.
5. Check that nothing in section 8 was copied from the wireframe.
6. **Prove the calls are real** (section 2A). Do this in every phase that touches results:
   - **No hidden scripts.**
     - `rg -n "fixed_draft|refund_pending" src interface/src` returns nothing.
     - `"draft":` appears only on `scripted_draft` examples in `demo_examples.py`.
     - Every run of those examples returns `draft_source: "scripted"` and a non-null `live_answer`.
   - **Guard server down.** Stop the guard server. Every live test and stress test shows a guard-server error with a Setup link. Nothing shows Allowed, Passed, or a reply.
   - **Answer model broken.** Set a wrong answer-model key. Runs show an answer-model error, and no draft appears.
   - **Judge broken.** Set a wrong Llama Guard or NIM token and choose that judge. Policy tests show error rows, and Deploy stays locked.
   - **Judge switch.** Switch between LLM as self judge, Llama Guard, and NIM. The next result and its audit record show the new judge in "Judged by", or the declared fallback.
   - **Live variation.** Run Fund pick in answer twice. The scripted draft is identical both times, and the "Live AI answer, not scripted" text is allowed to differ, which shows it is generated live. With the answer model broken, the box shows the model error while the scripted test still shows its real guard verdict.
   - **Traffic.** In the browser network panel, each test sends `POST /api/demo/usecase`. The guard server log shows a matching `/v1/demo-check` or `/v1/transfer-check` request, and timings in the UI match `timings_ms`.

## 13. Out of scope and open questions

- **More than one custom policy:** the backend supports one rule (`CUSTOM_SOURCE`). Keep "New policy" disabled.
- **Input-stage custom policies:** keep "Check at" fixed to Output.
- **Stress test redesign beyond the summary:** out of scope.
- **Open question:** should Setup be hidden behind a presenter flag during audience demos? Default: visible.

## 14. Agent prompt

Paste this into a new agent chat to start the work:

```text
Redesign the Banking Guardrails demo ("Safe AI Banking Assistant") to match the approved user experience.
This is a real AI application: every answer and verdict must come from live calls to the answer LLM,
the guard server, and the configured judge (LLM as self judge, Llama Guard, or NVIDIA NIM).

Read these first, in this order:
1. interface/design/REDESIGN.md: the spec, and the source of truth. Key sections:
   - 2A, real AI calls only (non-negotiable)
   - 5, screen-by-screen behaviour and acceptance
   - 6, the feature-to-code mapping
   - 7, backend changes, including 7.7 to 7.11
   - 8, placeholders you must not copy
   - 9, terminology
   - 11, phases
   - 12, verification
2. .cursor/rules/ui-redesign.mdc: the project rule. It applies automatically to the files you will touch.
3. interface/design/screenshots/: the target look for every tab and key state (01 to 17).
4. interface/design/wireframe.html: open it in the browser to try the interactions. It is a mockup; its data is fake.

Rules:
- This is an AI application. REDESIGN.md section 2A is non-negotiable and overrides everything else.
  Every draft comes from a live call to the configured answer model. Every verdict comes from the guard server.
  Every written-rule decision comes from the configured judge endpoint (LLM as self judge, Llama Guard, or NVIDIA NIM),
  and the UI says which model actually answered. Every status comes from a live probe, and every duration is measured.
- No faked or hard-coded results anywhere, in the frontend or the backend: no mocks, stubs, canned or recorded replies,
  demo or offline modes, verdicts computed in the frontend, or silent fallbacks. Stubs are allowed only inside unit tests.
- Fix the existing backend violations first (2A list; sections 7.7 to 7.11). Fixed risky drafts may stay as test
  inputs, but they must be tagged "Scripted test draft" and still go through the real guard server and judge.
  On every run of those tests, also call the answer model live and show its real reply underneath, labelled
  "Live AI answer, not scripted", clamped to two lines, with its own output-check verdict.
  Also replace the id-based refund_pending verdict with expected vs actual outcome (7.8), and expose the hidden judge fallback (7.9).
- If a call fails, show the error and a Setup link. Never show Allowed or Passed, and never substitute a reply.
  If the model's live output differs from what was expected, show the real outcome. Do not correct it.
- Use the existing endpoints in interface/src/api/demo.ts and src/api/demo_api.py.
  Never copy hard-coded replies, timings, addresses, keyword matching, ID patterns, or numbers from the wireframe.
- Where the design needs data the backend lacks, implement the backend change described in REDESIGN.md section 7.
- Match the existing React and CSS conventions and the tokens in interface/src/styles/tokens.css.
- Follow the copy and terminology table in REDESIGN.md section 9.

Environment and credentials:
- Configuration comes from the Cloudera AI project environment variables (README step 3).
  Check them with `python scripts/setup_project_env.py show`. Do not create a .env file.
  Do not change project settings without asking me.
- The inference token is read automatically from the session (/tmp/jwt via read_session_jwt()).
  Never print, log, copy, or commit tokens, and never write them into guardrails/catalog/connection.yml or any tracked file.
- Run Python with the project environment: `source .venv/bin/activate`. Start the guard server
  (scripts/start_guardrails_server.sh, port 8001) and the web app (scripts/start_demo.sh, port 8090)
  as separate background processes, and stop any older copies first.
- Ask me for full network access when calling the inference endpoints.
- If a model call returns 401 or 404, stop and report it, including which endpoint failed.
  Do not fall back to mocks or hard-coded data.

Process:
1. Start in Plan mode. Read the current code listed in section 6. Propose the component structure and the
   backend changes, and confirm the phase plan from section 11. Wait for my approval.
2. Do phase 2 (backend: real calls and data) before any screen that depends on it.
3. Build one phase at a time. After each phase, run the verification in section 12:
   - typecheck and build
   - the presenter script, against the real backend and guard server
   - the real-call checks in step 6 (guard server down, wrong keys, judge switch, live variation, traffic)
   - screenshots of the real app at 1280 px, compared with the matching files in interface/design/screenshots/
   Report the results and any differences, then wait for my go-ahead before the next phase.
4. If anything in the spec conflicts with the code or can't be done with real calls, stop and ask me.
   Do not work around it with hard-coded data.
```

# Cloudera Blueprint: AI Compliance Guard for Banking (NVIDIA NeMo Guardrails)

## Table of Contents

- [Overview](#overview)
- [Demo](#demo)
- [Use Case](#use-case)
- [Key Features](#key-features)
- [Quickstart](#quickstart--guide)
- [Running the Demo](#running-the-demo)
- [Architecture / Software Components](#architecture--software-components)
- [Target Audience](#target-audience)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Hardware Requirements](#hardware-requirements)
- [Documentation](#documentation)

## Overview

This blueprint puts compliance controls around a generative-AI banking assistant on Cloudera AI. A CrewAI multi-agent assistant answers customer questions, and an NVIDIA NeMo Guardrails server checks every request at three points: the customer's message (input check), the assistant's draft (output check), and any money movement (payment check). The web app shows the same request with and without guardrails, step by step, so stakeholders can see exactly where a risky answer or payment was stopped.

Compliance teams can write a new policy in plain English, test it against example sentences with a real safety judge, and deploy it to the guard server without a code release. Every decision is recorded in an audit trail. The guard server and the web app run as two Cloudera AI Applications, and the models run on Cloudera AI Inference Service, so customer data and safety decisions stay inside your governed environment.

Every result in the app comes from a live call: replies come from the configured answer model, verdicts come from the guard server, written-rule decisions come from the configured judge, and every status and duration is measured. If a call fails, the app shows the error and a link to Setup; it never substitutes a reply or shows a request as allowed.

## Demo

> **TODO:** add the Reprise walkthrough link.

![Live risk test: a risky draft stopped at the output check](assets/live-risk-test.png)

![Gap found: no policy covers refund promises yet](assets/gap-found.png)

![Custom policy studio: write, test, and deploy a policy](assets/custom-policy.png)

![Stress test: a batch of adversarial prompts against every policy](assets/stress-test.png)

## Use Case

Banks want generative-AI assistants for customer service, but an unguarded assistant can give investment advice it isn't licensed to give, promise refunds only staff can approve, treat customers unfairly, leak personal data, be talked out of its rules, or move money to a risky account. Risk and compliance teams also need evidence that the controls work and a way to close new gaps quickly.

**Outcome:** policies are enforced on the customer's message, the assistant's draft, and every payment. Stakeholders see the effect side by side, compliance can close a gap with a tested policy in minutes, and every decision is logged for review.

## Key Features

- **Live risk test**: six risk areas (investment advice, promises and commitments, fair treatment, customer data, fraud and payments, prompt attacks), each with test requests. A six-step pipeline plays back each request: the customer's message types out, then each check lights up with its measured time, and the replies with and without guardrails appear in step. **Run all tests** runs every test in turn, pausing 3 seconds on each result.
- **Gap found and Close this gap**: when a risky reply gets through, the app says so and links straight to the custom policy studio.
- **Custom policy studio**: write a rule in plain English, set the safe reply per region, test it with example sentences through the configured judge, deploy it to the guard server (which reloads), and run the gap test again.
- **Stress test**: a batch of adversarial prompts per policy, with what was stopped, what should have been stopped, what was stopped by mistake, the judge used for each prompt, and a spreadsheet download.
- **Audit trail**: every guard decision and policy test, with filters and a detail view showing the input, draft, reply, judge, measured timings, and any error.
- **Choice of safety judge**: the answer model itself (LLM as self judge), Llama Guard on Cloudera AI Inference, or an NVIDIA NIM safety model. The app always shows which model actually answered.
- **Regional ID profiles**: national ID, card, phone, and email detection per region, in three strictness versions (pattern, pattern plus a nearby word, and checksum), with a "Try a sentence" tester.
- **Scripted test drafts, clearly labelled**: some tests use a fixed risky draft so the output check always has something to catch. They still go through the real guard server and judge, and the real live AI answer is shown underneath with its own verdict.

## Quickstart / Guide

### 1. Configure the project (once)

1. Create a Cloudera AI Workbench project from this repository.
2. Choose one runtime and use it everywhere: for the session where you install packages and for both Applications. The tested runtime is **PBJ Workbench, Python 3.12, Standard edition, version 2026.08** (Ubuntu 24.04). Packages are installed per Python version into `~/.local`, and some of them contain compiled code built for the operating system of the runtime that installed them. Installing in one runtime and running in an older one fails with errors such as ``GLIBC_2.33' not found``.
3. Open a session with that runtime and install the dependencies with the runtime's own Python (not inside a virtual environment):
   ```bash
   pip install -r requirements.txt
   ```
4. Configure the models in **Project Settings > Advanced > Environment Variables**. Every session, job, and application in the project picks these up, and no secrets live in the repository. In Cloudera AI the inference token is read from the session automatically, so no token variable is needed. From a session terminal:
   ```bash
   python scripts/setup_project_env.py template     # the variables and example values
   python scripts/setup_project_env.py apply \
     CAIIS_HOST=<inference-host> CAIIS_ENDPOINT=<answer-endpoint> CAIIS_API_PATH=openai \
     CAIIS_MODEL_ORG=<org> CAIIS_MODEL_NAME=<model> \
     LLAMA_GUARD_HOST=<inference-host> LLAMA_GUARD_ENDPOINT=<llama-guard-endpoint> \
     DEFAULT_SAFETY_MODE=llama_guard GUARDRAILS_PORT=8001 \
     GUARDRAILS_HOST=<guard-server-subdomain>.<your-cai-domain>
   python scripts/setup_project_env.py show         # check what the project now has
   ```
   Set `CAIIS_API_PATH=none` when the endpoint's address ends in `/endpoints/<name>/v1` without `/openai`. `GUARDRAILS_PORT` is used when both servers run in one session; `GUARDRAILS_HOST` is used by the web app Application to reach the guard server Application.

New values reach sessions and applications only after they restart. To load them into a terminal of an already running session, run `eval "$(python scripts/setup_project_env.py env)"` in that terminal. It exports the non-secret settings and unsets any stale `CDP_TOKEN`.

### 2. Deploy as two Cloudera AI Applications (recommended)

Users then open the web app's URL; nobody starts anything from the command line.

| | Application 1: guard server | Application 2: web app |
| --- | --- | --- |
| Name | `NeMo Guardrails Server` | `Guardrails for Banking Demo` |
| Subdomain | must match `GUARDRAILS_HOST`, for example `nemo-guardrails` | any, for example `banking-guardrails-demo` |
| Script | `applications/guardrails_server_app.py` | `applications/web_app.py` |
| Runtime | the runtime you installed the packages with (PBJ Workbench, Python 3.12, 2026.08) | same as Application 1 |
| Resources | 2 vCPU, 8 GiB | 2 vCPU, 8 GiB |
| Authentication | **Allow unauthenticated access** (the web app calls it server to server) | your choice; normally authenticated |

1. Create and start **Application 1** first. Both scripts detect the platform port automatically.
2. Create and start **Application 2**. As an Application it ignores `GUARDRAILS_PORT` and reaches the guard server at `https://<GUARDRAILS_HOST>`. To use a different address, set `GUARDRAILS_SERVER_URL` on Application 2.
3. Open Application 2's URL, go to **Setup**, and press **Test connection** on each card. All three should say "Connected" and the Setup tab should say "Ready".

If the guard server test says "answered with HTTP 404", Application 1 is not running or its subdomain does not match `GUARDRAILS_HOST`. If a model test says 401, the token was refused; if it says 404, check the endpoint and model name.

### 3. Run in a single session (for development)

Use two terminals in a session that started after the project settings were configured:

```bash
# Terminal 1: guard server on port 8001
bash scripts/start_guardrails_server.sh

# Terminal 2: web app on port 8090
bash scripts/start_demo.sh
```

Open the session's web app link (the app runs on `CDSW_APP_PORT`). Stop older copies first with `pkill -f guardrails_server_app.py; pkill -f web_app.py`.

Outside Cloudera AI, a local `.env` file still works: copy `.env.caiis.example` or `.env.openai.example` to `.env`.

## Running the Demo

The **Start here** tab carries the same script for presenters.

1. **Before the audience arrives**, open **Setup** and test all three connections.
2. Press **Try a normal question** (Branch hours). Normal questions still get normal answers.
3. Run **Mutual fund**. Advice is stopped at the input check before the assistant writes a reply.
4. Run **Biased reply**. The scripted risky draft is caught at the output check; the real live AI answer is shown underneath.
5. Run **New account transfer**. The payment check stops it and the demo ledger balance does not change.
6. Run **Refund promise**. If the custom policy is not deployed, the risky reply gets through: **Gap found**. Press **Close this gap**.
7. In **Custom policies**, read the rule, press **Test rule**, then **Deploy**, then **Run the gap test again**: it is now blocked.
8. Press **Run all tests**, then open the **Audit trail**.

To show the gap again later, press **Remove from server** in Custom policies.

Each test makes live model calls and takes about 3 to 15 seconds; the pipeline plays back the measured result once it is in. Run all tests takes a few minutes. Live answers from reasoning models can include the model's reasoning text; the app shows the real output as it is.

## Architecture / Software Components

The web app sends each test to its FastAPI backend. The backend asks the guard server to check the customer's message, calls the CrewAI agents for a draft (or uses a labelled scripted draft), asks the guard server to check any transfer against the demo ledger, then asks it to check the draft. The guard server applies the built-in and deployed custom policies, using pattern checks for personal data and the configured judge for written rules. Every decision is stored in SQLite for the audit trail.

```mermaid
flowchart LR
    user(["User"]) --> ui

    subgraph app2["Cloudera AI Application 2 — web UI"]
        ui["React UI"] --> api["FastAPI backend"]
        api --> crew["CrewAI agents"]
        crew --> cis[("Dummy banking data")]
        api --> emb["NeMo Guardrails<br/>embedded"]
        emb --> pii["Presidio<br/>PII detection"]
        api --> db[("SQLite<br/>violation log")]
    end

    subgraph app1["Cloudera AI Application 1"]
        srv["NeMo Guardrails server"]
    end

    subgraph caii["Cloudera AI Inference Service"]
        llm["Nemotron 3 Nano"]
        lg["Llama Guard 3<br/>optional"]
    end

    api -- "Centralized Server mode" --> srv
    crew --> llm
    emb --> llm
    srv --> llm
    api -. "optional" .-> lg
```

*The diagram shows the original layout. The current web app sends every check to the guard server (Application 1), and personal data is detected there by regional pattern and checksum rules rather than Presidio.*

| Component | Role |
| --- | --- |
| Cloudera AI Workbench | Hosts the project and the two Applications |
| Cloudera AI Inference Service | Serves the answer model (for example Nemotron 3 Super) and the optional Llama Guard judge |
| NVIDIA NeMo Guardrails | Guard server: input, output, and payment checks, built-in policies, and deployed custom policies |
| CrewAI | Multi-agent banking assistant with read-only tools (account lookup, product info, card details, rates) |
| Safety judge | Answers yes or no for written rules: the answer model, Llama Guard, or NVIDIA NIM |
| Regional ID profiles | Pattern, nearby-word, and checksum rules for national IDs, cards, phones, and emails per region |
| FastAPI + React | Web app: Start here, Live risk test, Custom policies, Stress test, Audit trail, and Setup |
| SQLite | Audit trail and stress-test history |

## Target Audience

- **Solution architects and sales engineers** demonstrating AI governance on Cloudera AI.
- **Risk and compliance stakeholders** evaluating what the controls catch and how quickly a gap can be closed.
- **ML / AI engineers** adding guardrails to agent-based applications.
- **Platform engineers** deploying AI applications on Cloudera AI.

## Repository Structure

| Path | Description |
| --- | --- |
| `applications/` | Cloudera AI Application entry points: `guardrails_server_app.py` (guard server) and `web_app.py` (web app) |
| `assets/` | Screenshots |
| `data/dummy_cis/` | Dummy banking data used by the agents |
| `guardrails/base/` | NeMo Guardrails base config and prompts |
| `guardrails/catalog/` | Built-in rules, attack prompts, demo accounts, regional ID profiles, and the custom policy |
| `guardrails/policies/` | Policy modules (personal data, jailbreak, prompt injection, topic control, toxicity and bias) |
| `scripts/` | Project settings helper, session start scripts, and connectivity checks |
| `src/` | Python code: agents, guard server routes and client, judges, model providers, API, stress test |
| `interface/` | React + TypeScript web app. `interface/dist/` is the committed build, so Applications need no Node.js |
| `tests/` | Unit tests (`python -m pytest tests`) |
| `.env.*.example` | Environment templates for use outside Cloudera AI |
| `requirements.txt` | Python dependencies |

To change the web app, edit `interface/src/`, then run `cd interface && npm ci && npm run build` and commit `interface/dist/`.

## Prerequisites

- Access to **Cloudera AI** (a Cloudera AI Workbench project that can create Applications), or a local machine for development.
- An answer model endpoint on **Cloudera AI Inference Service**, or an **OpenAI API key** for quick trials.
- Optional: a Llama Guard endpoint on Cloudera AI Inference, or an NVIDIA API key for NIM.
- Permission to allow unauthenticated access for the guard server Application.
- **Python 3.10+**, `pip`, and `git`.
- Node.js 18+ only if you change the web app.

## Hardware Requirements

The app tier is CPU-only. Models run on Cloudera AI Inference Service or OpenAI. These figures are estimates.

| Deployment | Minimum |
| --- | --- |
| Launchable / demo (one session) | 2 vCPU, 8 GiB RAM, ~5 GB storage; no GPU |
| Production / enterprise (two Applications) | 2 vCPU and 8 GiB RAM per Application; GPU only to self-host models on Cloudera AI Inference, sized per the model ([docs](https://docs.cloudera.com/machine-learning/cloud/ai-inference/)) |

## Documentation

- [NVIDIA NeMo Guardrails](https://docs.nvidia.com/nemo/guardrails/)
- [Cloudera AI Inference Service](https://docs.cloudera.com/machine-learning/cloud/ai-inference/)
- [Deploying Applications on Cloudera AI Inference Service](https://docs.cloudera.com/machine-learning/cloud/ai-inference/topics/ml-caii-application-deploy.html)
- [Cloudera AI Applications](https://docs.cloudera.com/machine-learning/cloud/applications/topics/ml-applications-c.html)
- [CrewAI](https://docs.crewai.com/)

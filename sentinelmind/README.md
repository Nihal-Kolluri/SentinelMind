# SentinelMind: AI incident response that gets faster with every incident

Multi-agent incident responder powered by **Hindsight** memory (Vectorize). Built for Hack with Hyderabad 3.0.

## The story (60-second demo)
Two incident families, each hitting two different services:
cache stampede (payments-api, then catalog-service) and DB pool exhaustion (checkout-api, then orders-api).
`python demo.py` runs: no-memory baseline, learning phase, then the same families on new services with memory.
Expected shape: baseline tries restart/scale first (one of which makes DB pool exhaustion worse and is auto-rolled back);
with memory the agent goes straight to the fix. Compare actions tried and minutes to resolve in the summary table.

## Agents
Sentinel -> Triage -> Investigator -> Planner -> Executor -> Verifier -> Historian, run by an Orchestrator
(state machine, retries, checkpoints, escalation). See `sentinelmind/agents.py` and `orchestrator.py`.

## How Hindsight is used (memory is the star)
| Agent | Hindsight call | Purpose |
|---|---|---|
| Triage | `recall` symptoms | "have we seen this before?" sets known/novel |
| Investigator | `recall` on log lines | past root causes bias the diagnosis |
| Planner | `recall` "what succeeded/failed for <root cause>" | picks proven fixes, skips failed and harmful actions |
| Historian | `retain` postmortem | stores symptoms, root cause, what worked, what failed, what made it worse, time to resolve |
| Historian | `reflect` | Hindsight synthesizes per-root-cause playbooks across incidents |
| Orchestrator | `retain` on escalation | failures are remembered too |

Memory learns from failures as well as successes. If Hindsight is unreachable, calls retry then degrade to no-memory mode, and the incident still runs.

## Error handling
Per-step retry with backoff, then escalate. LLM output is parsed defensively with retries and a fallback model (no fragile function calling).
Planner output is validated against an allow-list; high-risk actions need a human. A worsening metric triggers automatic rollback and freezes the plan.
Replan budget of 2, then escalate with a summary. State is checkpointed to `runs/` after every step.

## Setup
```
pip install -r requirements.txt
cp .env.example .env      # add GROQ_API_KEY and Hindsight URL/key
python tests/smoke_test.py   # offline check of the state machine (fake LLM and memory)
python demo.py
```
Hindsight: Cloud (promo `MEMHACK99` after registering, in billing) or local Docker on :8888.
Docs: https://hindsight.vectorize.io/ . Confirm your Cloud base URL and key in the Cloud UI.

## Swapping in real data
`sentinelmind/world.py` is a simulator. Replace `World` methods (`alerts`, `logs`, `deploys`, `metrics`, `apply`) with adapters for
PagerDuty/Datadog/Loki/kubectl. Nothing else changes.

## Submission checklist
Repo, demo video, live demo, Hindsight explanation (table above), plus each member's article, social post and video from the content guide.

# Proposal

## Why

The extension hard-codes `usergate/Qwen3.8-27B` as the model in every bundled agent
profile, the integration-test default, and docs — a machine-specific gateway model.
On any other machine (or when that gateway goes away) a spawn passes an unresolvable
`--model`, and pi 0.99.1 hard-fails the child at startup (unknown provider →
`exit(1)` before anything runs; known provider + unknown id → child dies on the first
LLM call; a typo can even fuzzy-match a *different* model). Subagents should run on a
model that is actually usable, falling back to the model the spawning parent
orchestrator is running on.

## What Changes

- Replace the hard-coded `usergate/Qwen3.8-27B` default with the placeholder
  `model-provider/model-id` in `agents/*.md`, the integration-test agents, the
  integration harness default (which becomes: `PI_TEST_MODEL` is required, no
  built-in default), the manual repro script, and `AGENTS.md` docs.
- Add model resolution with fallback at spawn time: a requested model (agent
  frontmatter `model:`, or explicit `model` param) is validated against the parent
  session's `ctx.modelRegistry` (strict lookup + configured-auth check). A
  model that does not exist or is not reachable falls back to the spawning parent's
  current model; if the parent has no model either, no `--model` flag is passed and
  pi's own configured default applies. A spawn with no model defined at all follows
  the same chain (parent model first, then pi default).
- The **resolved** model (post-fallback) is stored in the launch snapshot
  (`.loadout.json`) so resume replays what the child actually ran on. Resume
  re-validates the snapshot model through the same resolution and falls back to the
  parent's current model with a warning instead of launching a child that would
  hard-fail (mirrors pi's own resume fallback).
- Docs: `AGENTS.md` records that pi docs/sources live in the installed pi under
  `~/.pi/...` (or the global install), not in `node_modules/` (dev dependencies for
  test runs only).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `subagent-launch`: new requirement — subagent model resolution falls back to a
  working model (requested → parent's current model → pi default); resume replays
  the resolved model and falls back when it no longer resolves.

## Impact

- `pi-extension/subagents/index.ts` — spawn + resume model resolution; loadout
  stores resolved model; exported `__test__` hook for the resolution function.
- `pi-extension/subagents/session.ts` — `SubagentLoadout.model` doc comment only
  (type unchanged).
- `agents/scout.md`, `agents/researcher.md`, `agents/worker.md` — `model:` placeholder.
- `test/integration/harness.ts` — `TEST_MODEL` requires `PI_TEST_MODEL`.
- `test/integration/agents/test-echo.md`, `test-ping.md` — placeholder model.
- `test/manual-ext-repro.mjs` — placeholder model.
- `AGENTS.md` — model docs + pi docs/source location note.
- `test/test.ts` — unit tests for the resolution function.
- `test/integration/subagent-lifecycle.test.ts` — fallback covered by the existing
  spawn test (placeholder model in test agents) plus an assertion of the child's
  resolved model.

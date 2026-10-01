# Design

## Context

See proposal.md for motivation. Key current state (verified in this repo and in the
installed pi, see `research/pi-model-resolution-0.99.1.md` in this change):

- `launchSubagent()` computes `effectiveModel = params.model ?? agentDefs?.model`
  (index.ts ~1236), stores it verbatim in the `SubagentLoadout` sidecar
  (`.loadout.json`), and `applySandboxToParts()` pushes `--model <model[:thinking]>`
  at both spawn (~1320) and resume (~2237).
- The spawn tool's `execute(..., ctx)` receives pi's `ExtensionToolContext`, which at
  runtime (pi 0.99.1) carries `model` (the parent's current model: `provider` + `id`)
  and `modelRegistry` (`find(provider, modelId)`, `getAvailable()`,
  `hasConfiguredAuth(model)`). The devDependency types
  (`@mariozechner/pi-coding-agent` 0.65.0) declare both fields on
  `ExtensionContext` as well.
- pi 0.99.1 gives no startup fallback for a bad `--model`: unknown provider →
  `process.exit(1)` before the session starts; known provider + unknown id → starts,
  dies on first LLM call; fuzzy matching can silently resolve a typo to a different
  model. Pi's own *resume* path falls back with a warning — the precedent we follow.

## Goals / Non-Goals

**Goals:**
- No subagent launch ever passes an unresolvable/unauthenticated model to the child.
- Fallback chain: requested model (if usable) → parent's current model → no `--model`
  flag (pi's configured default). Same chain whether the model came from agent
  frontmatter, the explicit `model` param, or was absent.
- Snapshot stores what the child actually ran on; resume re-validates and falls back
  the same way.
- Repo is machine-agnostic: `usergate/Qwen3.8-27B` replaced by the
  `model-provider/model-id` placeholder; integration tests require `PI_TEST_MODEL`.

**Non-Goals:**
- No new config key (e.g. a configurable "default model" in `config.json`) — that
  would touch `parseStatusConfig` (which rejects unknown keys) for a knob the parent
  model already covers. "Default model" means pi's own configured default.
- No model auto-detection/recommendation, no runtime model switching via
  `ctx.setModel()`.
- No change to how the status widget displays the agent's *requested* model.

## Decisions

1. **Strict registry validation instead of pi's fuzzy matching.**
   `modelRegistry.find(provider, modelId)` must return the exact model (id match),
   plus `hasConfiguredAuth(found)` must be true. Rationale: pi's CLI resolver does
   fuzzy partial matching, so a typo'd agent model can silently run a *different*
   model — worse than falling back. Alternative considered: run `pi --list-models` /
   `pi auth check` as subprocesses — rejected, async, version-fragile, and the
   in-process registry is the same source of truth.

2. **One pure resolver, exported for tests.**
   New function in `index.ts`, e.g.
   `resolveSubagentModel(requested: string | null | undefined, ctx: { model?, modelRegistry? }) → { model: string | null; source: "requested" | "parent" | "default"; note?: string }`.
   Pure over its inputs (no fs/tmux), so unit tests pass fake registries. Exported via
   the existing `__test__` block (index.ts ~1180). `requested` keeps any
   `:<thinking>` suffix; validation strips the trailing `:token` first. A requested
   model without a `/` is looked up by id across `getAll()` (mirrors pi's
   "exact model id" match). Missing/absent registry methods are guarded
   (`typeof x === "function"`); an unvalidatable registry falls through to the
   fallback (never launch with an unverified model).

3. **Fallback order: parent model before "default".**
   The user asked for "parent model or default" (invalid model) and "default or
   parent model" (no model). Both are implemented as parent-first, then pi default:
   the parent's live model is by definition configured and reachable on this machine
   right now, while "pi default" (no `--model` flag) may be an unconfigured provider.
   Recorded here as a deliberate simplification of the two phrasings.

4. **Snapshot stores the resolved model.**
   `loadout.model` = post-fallback value (unchanged type: `string | null`). Resume
   replays the resolved value, and re-validates it at resume time through the same
   resolver; a stale model falls back to the resuming parent's current model with a
   note, and the loadout is shallow-copied before any mutation. Legacy snapshots need
   no migration (field semantics only change for new snapshots).
   Alternative considered: keep storing the requested model and validate only at
   spawn — rejected, resume of a session whose model later disappeared would
   hard-fail the child, contradicting the requirement.

5. **Fallback notes surface in tool results.**
   When source is `parent` or `default`, the spawn/resume tool result text appends a
   short line (e.g. `model fallback: <requested> → <resolved> (parent model)`), so
   the orchestrator sees why. No new UI.

6. **Placeholders + required `PI_TEST_MODEL`.**
   `agents/*.md` and `test/integration/agents/*.md` get `model: model-provider/model-id`
   — an intentionally unresolvable placeholder; any machine's parent model takes over.
   `harness.ts`: `TEST_MODEL` becomes `process.env.PI_TEST_MODEL` with a hard,
   descriptive error when unset (no built-in default). Side benefit: every
   integration spawn then exercises the fallback path end-to-end.
   `test/manual-ext-repro.mjs` keeps the placeholder only in the spawned agent's
   frontmatter (scout) — never in the parent's `--model`: pi's CLI resolver
   exits(1) at startup for an unresolvable `--model`, so the parent must run on
   its configured default.

7. **Docs pointer: pi sources live outside the repo.**
   `AGENTS.md` gains: when you need pi docs/sources, read the installed pi
   (`~/.pi/...` agent dir and the global install, e.g.
   `~/.nvm/versions/node/*/lib/node_modules/@earendil-works/pi-coding-agent`), NOT
   `node_modules/` — that tree holds dev dependencies used to run tests, an older pi.
   This machine's research already used `~/.nvm/versions/node/v24.21.0/lib/node_modules/@earendil-works/pi-coding-agent` (0.99.1).

## Risks / Trade-offs

- [Registry API drift between pi versions (0.65.0 devDep types vs 0.99.1 runtime)] →
  access `model`/`modelRegistry` through a local structural type with `?.`/`typeof`
  guards; only use methods present in both versions (`find`, `getAll`,
  `hasConfiguredAuth`); missing method degrades to fallback, never to launching an
  unverified model.
- [`hasConfiguredAuth` stricter than pi's startup check (pi starts known-but-unauthed
  providers and dies at first LLM call)] → acceptable: we'd rather fall back one
  level earlier; the note explains it.
- [Parent model itself mid-switch or undefined in exotic contexts (print mode)] →
  `ctx.model` may be `undefined`; the chain ends at "no `--model`" and pi default
  applies — same as today's behavior for model-less spawns.
- [Integration tests now depend on `PI_TEST_MODEL` being set] → documented in
  `AGENTS.md` prerequisites; error message names the env var.

## Migration Plan

No data migration: `.loadout.json` `model` field keeps its type; old snapshots
resume with the stored value (re-validated, falling back if stale). Rollback =
revert the change; old behavior (verbatim model passthrough) is restored.

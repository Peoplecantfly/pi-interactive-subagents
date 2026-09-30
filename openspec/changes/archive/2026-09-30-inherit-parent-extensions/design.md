# Design

## Context

pi loads extensions three ways: (1) discovery from the global agent dir (`<PI_CODING_AGENT_DIR>/extensions`) and the project dir (`<cwd>/.pi/extensions`), plus built-in extensions; (2) explicit `-e`/`--extension` flags on the pi command line; (3) `--no-extensions`/`-ne` disables (1) entirely while explicit `-e` paths still load. Extensions run in-process, so this extension's `process.argv` is exactly the parent session's pi command line. Discovery deduplicates by canonicalized path, so passing an already-discovered extension again via `-e` is harmless. `--tools` controls which tools are active (declared to the model) across built-in, extension, and custom tools alike.

See proposal.md for the motivation: children of tool-restricted profiles are launched with `--no-extensions` plus a closed hardcoded map of tool→extension paths, so any parent extension outside that map never reaches the child.

## Goals / Non-Goals

**Goals:**
- Child extension environment == parent extension environment (explicit `-e` set + same discovery mode), so a subagent has the same capabilities as the session that spawned it.
- Resume replays the exact launch-time environment from the snapshot.
- Tool access stays whitelist-only (`--tools`); no privilege escalation beyond the parent's own environment.

**Non-Goals:**
- No new configuration surface (no config.json keys, no new frontmatter fields).
- No change to the Claude Code CLI path (it has no extension model).
- No attempt to read the parent's *loaded* extension list from pi internals; we reconstruct it from the command line + discovery semantics, which is all pi itself uses.

## Decisions

**D1: Reconstruct the parent's extension set from `process.argv`, don't query pi internals.**
Parse the parent's own command line (visible to the extension in-process) for `-e`/`--extension` values and for `--no-extensions`/`-ne`. Relative `-e` paths resolve against the parent's `process.cwd()`; `builtin:<name>` values pass through verbatim.
- Alternative rejected: enumerate pi's loaded `Extension` objects — no ExtensionAPI/ExtensionContext surface exposes them, and reaching into runner internals would break across pi versions.
- Alternative rejected: drop `--no-extensions` entirely — would not mirror a `-ne` parent and would change behavior for parents that deliberately disabled discovery.

**D2: Child discovery mode mirrors the parent's.**
`--no-extensions` is passed to the child iff the parent had it (previously: iff the agent restricted tools). When discovery is on, the child re-discovers the same global/project/built-in extensions itself (same `PI_CODING_AGENT_DIR`, same or project-correct cwd) — we do not enumerate and re-pass discovered paths.
- Consequence: with a discovery-on parent, tool-restricted children now load more extensions than before. That is the requested fix; the `--tools` allowlist still hides non-allowlisted tools from the model, so tool access remains whitelist-only (invariant preserved, AGENTS.md wording updated).

**D3: Keep the existing tool-backing `-e` additions and `registerToolExtension` fallback.**
Under `--no-extensions` (parent used `-ne`, or legacy resume), the extensions backing allowlisted tools must still be added explicitly or the allowlist would name tools no loaded extension provides. The closed map + runtime-registered map stays as-is; it is now a safety net on top of inheritance, not the only path.

**D4: Snapshot the environment in the loadout sidecar.**
`SubagentLoadout` gains optional fields: `extensions: string[]` (parent's explicit set, absolute) and `noExtensions: boolean` (parent discovery mode). `applySandboxToParts` — the single code path shared by launch and resume — reads these and emits `-e` for the set (deduplicated against tool-backing paths) and `--no-extensions` accordingly.
- Legacy compatibility: old sidecars lack both fields. Fallback rule `noExtensions ?? (toolAllowlist != null)` reproduces exactly today's behavior for old snapshots; a missing `extensions` field means "no inherited explicit extensions" (old behavior). No migration of existing sidecars needed.
- Alternative rejected: re-parse the *resuming* parent's argv at resume time — wrong, the snapshot must replay the original spawner's environment, and the resuming session may be a different pi process.

**D5: The harness extension (subagent-done.ts) is never part of the inherited set.**
It is added by the launch and resume paths themselves, before `applySandboxToParts`, so it cannot collide with or depend on the snapshot.

## Risks / Trade-offs

- [A parent `-ne` + discovery-off child loads tool-backing extensions the parent never loaded] → required for the allowlist to be meaningful; identical to current behavior, not a new exposure.
- [Discovery-on child loads parent extensions that register hooks/widgets/MCP servers] → intended ("same environment as parent"); the child is no more privileged than the parent session the user already trusts.
- [`process.argv` parsing assumes pi passes user args through to the extension process] → true today (extensions are jiti/import-loaded in-process); if pi ever re-execs, the parse simply yields an empty explicit set and discovery-mode default (discovery on), degrading to "discovery inheritance only" rather than failing.
- [Parent's project extensions depend on the parent's cwd; child may run in a different cwd] → correct semantics: the child resolves *its* project dir from its own cwd (documented subagent `cwd` behavior), which is what "picks up its local .pi/ config" already promises.

## Migration Plan

Ship in place; no user migration. Existing loadout sidecars resume via the D4 fallback. Rollback = revert the change; old sidecars are still read fine by new code and new sidecars are read fine by old code (unknown JSON fields are ignored by `readSubagentLoadout`'s cast).

## Open Questions

None.

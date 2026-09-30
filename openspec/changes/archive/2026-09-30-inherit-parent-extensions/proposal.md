# Proposal

## Why

Subagents launched by this extension do not inherit the parent session's extensions. Any agent profile with a `tools:` restriction (all bundled agents: scout, researcher, worker) launches its child with `--no-extensions`, so pi's extension discovery and built-in extensions are disabled, and only extensions from a closed hardcoded path map (a few global web tools, safe-bash, this extension itself) are re-enabled via `-e`. Extensions the parent actually runs — project-local tool extensions that do not self-register, explicit `-e` extensions from the parent's own launch command — never reach the child. The subagent pane starts bare: tools and behavior the parent has simply do not exist there.

## What Changes

- Subagent launches inherit the parent session's extension environment:
  - Explicit parent extensions (the `-e`/`--extension` entries the parent pi process was started with, including `builtin:<name>` forms) are passed through to the child as `-e` flags, resolved to absolute paths.
  - The child mirrors the parent's discovery mode: if the parent was started with `--no-extensions`/`-ne`, the child keeps `--no-extensions` and receives exactly the parent's explicit set (plus harness and tool-backing extensions); otherwise the child runs pi's normal extension discovery, which re-finds the same global/project/built-in extensions the parent has.
- The launch snapshot (`.loadout.json`) gains `extensions` (parent explicit `-e` set) and `noExtensions` (parent discovery mode) so `subagent_message` resume replays the identical extension environment. Legacy snapshots without these fields fall back to the current behavior (restricted spawn → `--no-extensions` + tool-backing extensions only).
- The tool allowlist (`--tools`) is unchanged: the child's *tool access* remains whitelist-only even though more extensions may be loaded; non-allowlisted tools registered by inherited extensions are hidden from the model.

## Capabilities

### New Capabilities
- `subagent-launch`: how a subagent pi process is launched and resumed — the extension environment it receives (inherited from the parent session), the tool allowlist restriction, and the loadout snapshot that makes resume replay the same sandbox.

### Modified Capabilities
(none — the project has no existing specs)

## Impact

- `pi-extension/subagents/index.ts` — parent-flag parsing, launch command construction (`launchSubagent`), sandbox replay (`applySandboxToParts`).
- `pi-extension/subagents/session.ts` — `SubagentLoadout` type gains two optional fields.
- `test/test.ts` — sandbox/loadout tests updated to the new expected flags; new tests for parent-flag parsing and inheritance.
- `AGENTS.md`, `README.md` — sandbox invariants wording ("only extensions backing listed tools are loaded") becomes "the parent's extension set, tool access still whitelist-only".
- No new dependencies. No API changes to the subagent tools themselves.

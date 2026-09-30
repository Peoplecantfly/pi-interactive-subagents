# AGENTS.md

pi-interactive-subagents: a pi extension that spawns sub-agent sessions in tmux panes. TypeScript ESM (`"type": "module"`), no build step, no bundler.

## Layout

- `pi-extension/subagents/index.ts` — extension entry; the file listed in `package.json` → `pi.extensions`. Tool registration, spawning, sandboxing, and resume are wired here.
- `pi-extension/subagents/` — modules: `session.ts` (session files, name registry, loadout snapshots), `tmux.ts` (tmux surface layer), `status.ts` (status widget state machine), `activity.ts`, `subagent-done.ts`, `tools/safe-bash.ts`.
- `agents/*.md` — bundled agent definitions (scout, researcher, worker) parsed from frontmatter.
- `test/test.ts` — unit tests (node:test, single file, imports `.ts` directly — requires Node with native type stripping).
- `test/integration/` — end-to-end tests starting real pi sessions in tmux; shared helpers in `test/integration/harness.ts`.
- `config.json.example` — template for the gitignored `config.json` (status widget config). Unit tests read this file directly, and `parseStatusConfig` rejects unknown keys / non-boolean `status.enabled` — keep it valid.

## Commands

```bash
npm install                # devDependencies (= peer deps: pi-coding-agent, pi-tui, typebox)
npm test                   # node --test test/test.ts  (unit tests)
npm run test:integration   # node --test --test-concurrency=1 test/integration/*.test.ts
```

There is no lint, format, type-check, build, or CI script. Verification is the unit tests, plus integration tests when their prerequisites exist.

## Integration test prerequisites

- `tmux` and `pi` on PATH, and a working model provider / API key.
- Model defaults to `usergate/Qwen3.8-27B`; override with `PI_TEST_MODEL`. `PI_TEST_TIMEOUT` (default 300000 ms) sets the per-test timeout. Test panes run the pi binary next to the test runner's node (`PI_TEST_BIN` overrides); `npm run` puts the project's `node_modules/.bin` (older pi from devDependencies) first on PATH, so bare `pi` is not used.
- Run serialized (`--test-concurrency=1`): tests share tmux panes and screen state.
- The harness force-loads the working-tree extension via `pi -ne -e pi-extension/subagents/index.ts`, never an installed pi-package — edits in the working tree are the code under test.

## Sandbox invariants (covered by tests — do not weaken)

- Tool access is whitelist-only: when an agent restricts its tools (or is granted the spawning toolset), the child launches with `--tools <allowlist>`; tools registered by loaded extensions that are outside the allowlist stay hidden from the model. There is no default toolset and no deny-list.
- The child's extension environment is inherited from the spawning parent session: the parent's explicit `-e`/`--extension` flags are passed through (relative paths resolved against the parent cwd, `builtin:<name>` verbatim), and the child's discovery mode mirrors the parent's (`--no-extensions` iff the parent had it). Under `--no-extensions`, the extensions backing the allowlisted tools are still loaded explicitly. The child is never more privileged than the parent session.
- The resolved loadout (tools, model, thinking, system prompt, spawn whitelist, cwd, inherited extension set, discovery mode) is snapshotted to `<session>.loadout.json` at spawn and replayed on resume — a resumed child must get the identical restricted profile. Snapshots written before extension inheritance exist fall back to the old default-deny rule (restricted spawn → `--no-extensions` + tool-backing extensions only).
- Every spawn names a known agent at every depth; a child may only spawn agents in its own `subagent_agents` list (enforced via `PI_SUBAGENT_ALLOWED`).
- Names persist in `artifacts/<sessionId>/subagent-registry.json`; resume must be refused with a clear error (not silently re-spawned) when the name, session file, or loadout sidecar is missing.

## Do not touch

- `config.json` (gitignored, local-only) and `.memory/` (gitignored).
- `package-lock.json` — keep in sync with dependency changes.

## Completion criteria

`npm test` passes. When tmux, `pi`, and a model endpoint are available, `npm run test:integration` also passes.

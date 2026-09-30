# Tasks

## 1. Core implementation

- [x] 1.1 Add optional `extensions: string[]` and `noExtensions: boolean` fields to `SubagentLoadout` in `pi-extension/subagents/session.ts` with doc comments (verify: `npm test` loadout round-trip test extended in 2.4 passes)
- [x] 1.2 Add `parseParentExtensionFlags(argv?)` to `pi-extension/subagents/index.ts` returning `{ explicit: string[]; noExtensions: boolean }`: collect `-e`/`--extension` values (relative resolved to absolute via `process.cwd()`, `builtin:<name>` verbatim, missing value skipped) and detect `--no-extensions`/`-ne` (verify: unit tests in 2.2)
- [x] 1.3 In `launchSubagent` (pi path): parse parent flags once and store them in the `SubagentLoadout` written at spawn (`extensions`, `noExtensions`) (verify: unit test in 2.3 asserting the loadout carries the parsed set)
- [x] 1.4 Rework `applySandboxToParts`: emit `--no-extensions` iff `loadout.noExtensions ?? (loadout.toolAllowlist != null)` (legacy fallback); emit `-e` for every `loadout.extensions` entry and every tool-backing extension, deduplicated, keeping the existing `--tools` allowlist behavior and leaving `subagent-done.ts` to the callers (verify: unit tests in 2.1/2.3)

## 2. Tests

- [x] 2.1 Update the two existing `applySandboxToParts` tests in `test/test.ts` for the new semantics: restricted loadout with `noExtensions: true` still emits `--no-extensions`; restricted loadout with `noExtensions: false` does not emit it but still emits `--tools`; `toolAllowlist: null` loadout emits neither (verify: `npm test` green)
- [x] 2.2 Add `parseParentExtensionFlags` unit tests: plain `-e`/`--extension` parsing, `builtin:` passthrough, relative→absolute resolution, `-ne`/`--no-extensions` detection, dangling flag value skipped, empty argv (verify: `npm test` green)
- [x] 2.3 Add inheritance tests: `applySandboxToParts` with `loadout.extensions` set emits each as `-e` exactly once (dedup against a tool-backing path), and launch-path loadout construction carries `extensions`/`noExtensions` from the parsed argv (verify: `npm test` green)
- [x] 2.4 Extend the loadout round-trip test to cover the new `extensions`/`noExtensions` fields and add a legacy-snapshot test: parsed JSON without the new fields resumes with `--no-extensions` when a tool allowlist is present and without it when absent (verify: `npm test` green)

## 3. Docs

- [x] 3.1 Update the "Sandbox invariants" section in `AGENTS.md`: children inherit the parent's extension environment (explicit `-e` set + mirrored discovery mode); tool access remains whitelist-only via `--tools`; keep the "covered by tests — do not weaken" framing (verify: text matches implemented behavior in 1.4)
- [x] 3.2 Update README.md sandbox section (line ~143) and the `tools` frontmatter table row (line ~111) to describe inherited extensions + whitelist-only tool access (verify: no doc contradicts spec `subagent-launch`)

## 4. Verification

- [x] 4.1 Run `npm test` — full unit suite green (verify: exit code 0) — done: 157/159; the 2 failures (global `~/.pi/agent` state shadowing bundled agent defs) fail identically on pristine HEAD on this machine — pre-existing, environment-specific
- [x] 4.2 If tmux, `pi`, and a model endpoint are available on this machine, run `npm run test:integration` (verify: exit code 0; otherwise record as skipped with reason) — done: 14/14 pass with `usergate/Qwen3.8-27B`

## 5. Test-infra hardening (discovered during 4.2)

- [x] 5.1 Pin the pi binary children and test panes run: extension child launches and resume use the pi installed next to the executing node (`PI_BIN` override); harness `startPi` uses the runner's own install (`PI_TEST_BIN` override) — `npm run` puts the project `node_modules/.bin` (older pi from devDependencies) first on PATH (verify: integration 14/14 green)
- [x] 5.2 Raise `PI_TEST_TIMEOUT` default 120000 → 300000 ms: 27B gateway model takes 30-90s per turn and lifecycle tests chain parent + child turns; 120s budget timed out (verify: integration green at 300s default; AGENTS.md updated)

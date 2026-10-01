# Tasks

## 1. Model resolution core

- [x] 1.1 Add pure `resolveSubagentModel(requested, { model, modelRegistry })` to `pi-extension/subagents/index.ts` implementing: exact registry lookup (split `provider/id`, strip trailing `:<thinking>` before validating; `/`-less ref matched by id across `getAll()`), `hasConfiguredAuth` check, fallback chain requested → parent's current model (`model.provider/model.id`) → `null` (no flag), `source` (`requested`/`parent`/`default`) and a human `note` on fallback; missing registry or missing registry methods must degrade to the fallback, never pass an unverified model; export via `__test__`
- [x] 1.2 Add unit tests for `resolveSubagentModel` in `test/test.ts` with fake registries covering: valid model passes through (thinking suffix preserved), unknown provider → parent model, known provider + unknown id → parent, known model without configured auth → parent, no requested model + parent → parent, nothing resolvable + no parent → `null`/`default`, absent registry → parent fallback; verify with `npm test`

## 2. Wire resolution into spawn and resume

- [x] 2.1 Spawn path: in `launchSubagent`, resolve the model (extend the ctx structural type with optional `model`/`modelRegistry` fields, accessed with guards — no new pi type imports); store the **resolved** model in the `SubagentLoadout` (update the `model` doc comment in `session.ts` to say resolved); append the fallback `note` to the spawn tool result text when used; verify with `npm test` (existing `applySandboxToParts` tests still pass)
- [x] 2.2 Resume path: in the `subagent_message` resume handler, re-validate `loadout.model` through the same resolver before `applySandboxToParts`; on stale model use the parent's current model or no `--model` flag (shallow-copy the loadout before mutating) and append the fallback note to the resume result; verify with `npm test`

## 3. Machine-agnostic defaults and docs

- [x] 3.1 Replace `usergate/Qwen3.8-27B` with the `model-provider/model-id` placeholder in `agents/scout.md`, `agents/researcher.md`, `agents/worker.md`, `test/integration/agents/test-echo.md`, `test/integration/agents/test-ping.md`, and `test/manual-ext-repro.mjs`; change `TEST_MODEL` in `test/integration/harness.ts` to require `PI_TEST_MODEL` (hard error naming the env var when unset, no built-in default); verify with `npm test` and `rg -l "usergate" --glob '!openspec/**'` returning nothing
- [x] 3.2 Update `AGENTS.md`: integration prerequisites say `PI_TEST_MODEL` is required (no default), and a note that pi docs/sources live in the installed pi under `~/.pi/...` / the global install — NOT `node_modules/` (dev deps for test runs only); verify by reading the file

## 4. Integration verification

- [x] 4.1 Extend `test/integration/subagent-lifecycle.test.ts`: the placeholder-model `test-echo` spawn must run the child on the parent's model — assert the child session ran on `PI_TEST_MODEL` (e.g. via the child session file / `summarizeSessionStats`); verify by running the test if prerequisites exist (done: the basic-spawn test now asserts, from files on disk, that the loadout sidecar records the resolved `TEST_MODEL`, every child assistant turn + `model_change` ran on it, and the parent's recorded spawn tool result carries the `model fallback: model-provider/model-id → <parent>` note; test passes in the 14/14 integration run)
- [x] 4.2 Final verification: `npm test` passes; `PI_TEST_MODEL=usergate/Qwen3.8-27B npm run test:integration` passes (or record the exact skip reason when tmux/pi/model prerequisites are absent); verify by running both commands (done: integration 14/14 pass in 384s; `npm test` = 167/169 — the 2 failures are pre-existing on HEAD and environmental, not caused by this change: (a) `bundled scout/researcher/worker all resolve as non-interactive` fails because a user-level `~/.pi/agent/agents/researcher.md` shadows the bundled agent on this machine, (b) `getToolExtensionPath maps custom tools and skips built-ins` fails because `~/.pi/agent/extensions/web-search/index.ts` is not installed here; both verified failing identically with the change stashed)

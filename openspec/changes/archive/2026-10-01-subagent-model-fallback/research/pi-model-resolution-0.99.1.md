# Research: pi 0.99.1 runtime model selection (bad-model behavior + extension APIs)

Investigated 2026-09-30 by the researcher subagent for the `subagent-model-fallback` change.
Complements `model-flow.md` (which covers the extension's own model handling and cites
`@mariozechner/pi-coding-agent@0.65.0`). This file cites the **actually installed** pi:
`@earendil-works/pi-coding-agent@0.99.1` at
`~/.nvm/versions/node/v24.21.0/lib/node_modules/@earendil-works/pi-coding-agent` (shorthand
`PI` below; its nested `node_modules/@earendil-works/pi-ai` as `pi-ai`).

**Version divergence warning.** `model-flow.md` §2 concludes (from 0.65.0) that a bad
`--model` "does not hard-fail the child — it silently runs on pi's default". In 0.99.1 that is
**false**: an unresolvable `--model` exits the child at startup (see §1). Which pi the children
run against depends on `resolvePiBin()` (index.ts:74-78): `PI_BIN` → sibling `pi` next to the
parent's `node` → bare `pi`. If the parent session runs the 0.99.1 global pi, children run
0.99.1 too, and the hard-fail behavior below is what the fallback design must handle.

## 1. What `pi` startup does with a bad `--model`

Resolution lives in `PI/dist/core/model-resolver.js:292` — `resolveCliModel(options)`.
Matching order: exact `provider/model` ref → exact model id → **fuzzy partial** match on
id/name (`tryMatchModel`, ~line 110; prefers alias/latest-dated). A typo inside a known
provider can silently resolve to a *different* model (fuzzy substring, no warning).

- **Unknown provider / no match at all** → hard exit, no session, no picker, no fallback:
  - `model-resolver.js:317` — `error: \`Unknown provider "${cliProvider}". Use --list-models to see available providers/models.\``
  - `model-resolver.js:462` — `error: \`Model "${display}" not found. Use --list-models to see available models.\``
  - `model-resolver.js:304` — empty catalog: `"No models available. Check your installation or add models to models.json."`
  - Path: error pushed as diagnostic by `buildSessionOptions` (`PI/dist/main.js:353-372`,
    `resolveCliModel` call at 361), forwarded through
    `createAgentSessionRuntime` (`PI/dist/core/agent-session-runtime.js:311-315` passes
    `result.diagnostics`), then `PI/dist/main.js:737` `hasRuntimeErrors` → `main.js:744`
    `process.exit(1)`.
- **Known provider + unknown model id** → session **starts** with a synthesized custom model:
  `buildFallbackModel` (`model-resolver.js:130`) returns `{...baseModel, id: modelId, name: modelId}`
  (first/default model of that provider with the id swapped), plus warning
  `model-resolver.js:452-453` — `Model "X" not found for provider "P". Using custom model id.`
  Failure surfaces later, at the first LLM request:
  `PI/dist/modes/print-mode.js:115-117` — `if (assistantMsg.stopReason === "error" ...) { console.error(assistantMsg.errorMessage ...); exitCode = 1; }`
- Auth is **ignored** at resolution time: `model-resolver.js:297-299` —
  `// Important: use *all* models here, not just models with pre-configured auth.`
  A known-but-unauthenticated provider also starts.
- CLI flag: `PI/dist/cli/args.js:65-66` (`--model` verbatim); help `args.js:281` —
  `--model <pattern>  Model pattern or ID (supports "provider/id" and optional ":<thinking>")`.
- Contrast — resume path *does* fall back: `restoreModelFromSession` (`model-resolver.js:537`)
  on a missing saved model prints `Warning: Could not restore model P/M (model no longer exists).`
  and uses current/first-available model (`:547-560`) instead of exiting. Pi's own precedent for
  "fall back, don't die" (applies to resumed sessions only, not to `--model`).

## 2. Extension API: read current model / check a model id

`ExtensionContext` — `PI/dist/core/extensions/types.d.ts:213`:
- `:225` — `modelRegistry: ModelRegistry;` (comment: "Model registry for API key resolution")
- `:227` — `model: Model<any> | undefined;` (comment: "Current model (may be undefined)")
- `:232` — `scopedModels: readonly ScopedModel[];`
- `:234` — `thinkingLevel?: ThinkingLevel;`

`ModelRegistry` (sync facade) — `PI/dist/core/model-registry.d.ts`:
```ts
getAll(): Model<Api>[];
getAvailable(): Model<Api>[];                       // providers with working credentials
find(provider: string, modelId: string): Model<Api> | undefined;   // ← existence check
hasConfiguredAuth(model: Model<Api>): boolean;
getProviderAuthStatus(provider: string): AuthStatus;
getProvider(provider: string): Provider | undefined;
getApiKeyAndHeaders(model): Promise<ResolvedRequestAuth>;
```
`AuthStatus` — `PI/dist/core/provider-composer.d.ts:62`:
`{ configured: boolean; source?: "stored" | "runtime" | "environment" | "fallback" | "models_json_key" | "models_json_command"; label?: string }`.

`ExtensionAPI` (the `pi` object) — `types.d.ts:1138`:
- `:1245-1248` — `setModel(model: Model<any>): Promise<boolean>;` — "Set the model for the
  current session without changing the configured default for new sessions. Returns false if
  authentication is not configured for the model's provider."
- `:1174` — `on("model_select", handler: ExtensionHandler<ModelSelectEvent>)`; event
  `types.d.ts:837-841` — `{ type: "model_select"; model; previousModel; source: "set" | "cycle" | "restore" }`
- `:1308` `registerProvider`, `:1352` `registerVirtualModel`.

## 3. Where pi gets its model list (this machine)

- **Built-in catalog**: `PI/dist/core/model-runtime.js:4` —
  `import * as builtinProviderCatalog from "@earendil-works/pi-ai/providers/all"`; 41 built-in
  providers (amazon-bedrock, ant-ling, anthropic, … openai, openrouter, …, zai, zai-coding-cn).
- **User config**: `<agent-dir>/models.json`. Agent dir = env `PI_CODING_AGENT_DIR` else
  `~/.pi/agent` — `PI/dist/config.js:432` (`ENV_AGENT_DIR`), `config.js:447` (`getAgentDir()`),
  `config.js:459-460` (`getModelsPath()`). Loaded at `core/model-runtime.js:80-84` (models.json
  + `models-store.json` cache). Missing file → empty catalog, no error
  (`core/model-config.js` — `ENOENT → new ModelConfig(new Map())`).
- **Credentials**: `<agent-dir>/auth.json` — on this machine **empty** (`{}`). All local auth
  comes from `apiKey` inside models.json (`models_json_key` `AuthStatus.source`).
- **Env vars**: no `PI_MODEL`/`PI_PROVIDER` *inputs*; they are *outputs* for the bash tool (§5).
  `PI_OFFLINE` disables network catalog refresh.
- **This machine's `~/.pi/agent/models.json` shape** (keys redacted):
  ```json
  { "providers": {
    "usergate":  { "baseUrl": "https://gw.ml.esafeline.com/code-model/v1", "api": "openai-completions", "apiKey": "***",
                   "models": [ { "id": "Qwen3.8-27B", "name": "Qwen3.8 27B", "input": ["text","image"],
                                 "reasoning": true, "contextWindow": 262144, "maxTokens": "***", "cost": {} } ] },
    "llama-cpp": { "baseUrl": "http://host.docker.internal:8080/v1", "...": "2 models, thinkingLevelMap present" },
    "lm-studio": { "baseUrl": "http://host.docker.internal:8081/v1", "...": "2 gemma models" } } }
  ```
  `~/.pi/agent/settings.json`: `"defaultProvider": "ollama"`, `"defaultThinkingLevel": "xhigh"`,
  no `defaultModel` key.

## 4. Enumerating models + provider status without a session

- **CLI**: `pi --list-models [search]` — `PI/dist/main.js:710-714` (handled before TUI,
  `process.exit(0)`); prints provider/model/context/max-out/thinking/images for
  `modelRuntime.getAvailable()` only (auth-configured providers) — `PI/dist/cli/list-models.js:31`.
- **CLI**: `pi auth check --provider <p> [--model <m>] [--json]` —
  `PI/dist/cli/auth-check.js:7` `checkProviderAuth` → `{status: "ready"|"not_ready"|"invalid",
  provider, reason?}` (reasons include `provider_not_found`, `credentials_not_configured`);
  exit codes `PI/dist/main.js:162` — ready→0, not_ready→1, invalid→2.
- **From an extension** (sync, no session start): `ctx.modelRegistry.find(p, id)`,
  `ctx.modelRegistry.getAvailable()`, `ctx.modelRegistry.getProviderAuthStatus(p)`.
- **Standalone Node** (no pi process): `ModelRuntime.create({ authPath, modelsPath,
  allowModelNetwork: false, refreshOnCreate: false })` — `PI/dist/core/model-runtime.d.ts`
  (`CreateModelRuntimeOptions`). Session-less example: `PI/dist/package-manager-cli.js:513-520`.

## 5. Parent session's model at tool-call time

Tool handler signature — `PI/dist/core/extensions/types.d.ts:487`:
```ts
execute(toolCallId: string, params: Static<TParams>, signal: AbortSignal | undefined,
        onUpdate: AgentToolUpdateCallback<TDetails> | undefined, ctx: ExtensionToolContext):
    Promise<AgentToolResult<TDetails>>;
```
`ExtensionToolContext extends ExtensionContext` (`types.d.ts:269`) — so `ctx.model`
(`Model<any> | undefined`) **is the parent's current model** (`model.provider` + `model.id`),
alongside `ctx.modelRegistry`, `ctx.sessionManager`, `ctx.thinkingLevel`.

`Model` shape — `pi-ai/dist/types.d.ts:897` `BaseModel { id, name, api, provider, baseUrl,
input, cost }`; `:913` `Model` adds `reasoning, contextWindow, maxTokens, thinkingLevelMap?`.

Bonus channel: the bash tool injects the parent model into every command's env —
`PI/dist/core/tools/bash.js:141-152` sets `PI_PROVIDER = model.provider`, `PI_MODEL = model.id`,
plus `PI_SESSION_ID` / `PI_SESSION_FILE` / `PI_REASONING_LEVEL` (docs:
`PI/docs/environment-variables.md:26-32`, "Currently selected model provider" /
"Currently selected model ID"). A child spawned through bash with session env exposed can read
these.

## Design implications for `subagent-model-fallback`

1. Pi 0.99.1 gives **no** startup fallback for `--model`: unknown provider → `exit(1)` before
   anything starts; known provider + unknown id → starts, dies on first API call; fuzzy match
   can silently pick a *different* model on typo. Validation must happen in the extension
   **before spawn**.
2. In the parent's spawn tool: `ctx.modelRegistry.find(provider, id)` +
   `ctx.modelRegistry.getProviderAuthStatus(provider)` (or `hasConfiguredAuth`) is the sync
   preflight. Fallback value = `` `${ctx.model.provider}/${ctx.model.id}` `` (parent's current
   model), matching pi's own resume-fallback behavior.
3. `ctx.setModel(model)` (returns false when the provider's auth is unconfigured) is the
   in-session runtime switching primitive if reacting after spawn is ever wanted.

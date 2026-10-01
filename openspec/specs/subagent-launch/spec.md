# subagent-launch Specification

## Purpose

Defines how a subagent pi process is launched and resumed: which extension environment it receives (inherited from the spawning parent session), how its tool access stays whitelist-only, and how the launch snapshot makes resume replay the identical sandbox.

## Requirements

### Requirement: Subagent inherits the parent session's extension environment

A spawned subagent pi process SHALL receive the same extension environment as the parent session that spawned it. Explicit extensions the parent process was started with via `-e`/`--extension` (including `builtin:<name>` forms) SHALL be passed through to the child as explicit extension flags, with relative paths resolved to absolute against the parent's working directory. The child's extension discovery mode SHALL mirror the parent's: when the parent was started with `--no-extensions` (or `-ne`), the child SHALL also be started with `--no-extensions`; otherwise the child SHALL run pi's normal extension discovery, which resolves the same global and project extension resources the parent resolves. The harness extension (subagent-done) and the extensions backing the child's allowlisted tools SHALL always be loaded as well.

#### Scenario: Parent with discovery enabled spawns a tool-restricted subagent

- **WHEN** the parent session runs with normal extension discovery and spawns an agent profile that restricts its tools
- **THEN** the child is NOT started with `--no-extensions`
- **AND** the child discovers the same global and project extensions the parent discovers
- **AND** the child is additionally passed the parent's explicit `-e` extensions

#### Scenario: Parent started with --no-extensions

- **WHEN** the parent session was started with `--no-extensions` and explicit `-e` extension paths, and it spawns a subagent
- **THEN** the child is started with `--no-extensions`
- **AND** the child receives exactly the parent's explicit extension paths (plus the harness extension and tool-backing extensions)
- **AND** no extension discovery occurs in the child

#### Scenario: Relative parent extension path

- **WHEN** the parent was started with a relative `-e` path (e.g. `-e pi-extension/subagents/index.ts`)
- **THEN** the child's launch command references that extension by its absolute path resolved against the parent's working directory

#### Scenario: Duplicate extensions are not passed twice

- **WHEN** an extension path appears both among the parent's explicit extensions and among the tool-backing extensions for the child's allowlist
- **THEN** the child's launch command lists it only once

### Requirement: Subagent tool access remains whitelist-only

When an agent profile restricts its tools (or is granted the spawning toolset), the child SHALL be started with a `--tools` allowlist containing exactly the requested tools plus the spawning tools and the subagent control tools. Tools registered by inherited extensions that are not in the allowlist SHALL NOT be available to the child's model. An unrestricted spawn SHALL NOT pass a `--tools` allowlist.

#### Scenario: Tool-restricted profile

- **WHEN** an agent profile with `tools: read,bash` is spawned
- **THEN** the child is started with `--tools` whose allowlist includes `read` and `bash` and the control tools
- **AND** tools from loaded extensions that are outside the allowlist are not callable by the child's model

#### Scenario: Unrestricted profile

- **WHEN** an agent profile declares no `tools` restriction and is not granted the spawning toolset
- **THEN** the child is not started with a `--tools` allowlist and keeps pi's default toolset

### Requirement: Resume replays the launch-time extension environment

The subagent's launch-time extension environment SHALL be captured in the launch snapshot written beside the session file at spawn time. Resuming a finished subagent SHALL replay that captured environment: the same explicit extension set and the same discovery mode the original launch used. Snapshots written before this capability existed (no extension fields present) SHALL resume with the previous behavior: a tool-restricted spawn replays `--no-extensions` with only tool-backing extensions, and an unrestricted spawn replays with discovery enabled.

#### Scenario: Resume replays inherited extensions

- **WHEN** a subagent spawned with inherited parent extensions is resumed via `subagent_message`
- **THEN** the resumed launch includes the same explicit extension flags and the same discovery mode as the original launch

#### Scenario: Legacy snapshot without extension fields

- **WHEN** a resume is requested for a session whose snapshot has no extension fields
- **AND** the snapshot has a tool allowlist
- **THEN** the resumed launch uses `--no-extensions` with only tool-backing extensions, matching pre-inheritance behavior
- **AND** if the snapshot has no tool allowlist, the resumed launch runs with discovery enabled

#### Scenario: Resume without any snapshot is refused

- **WHEN** a resume is requested for a name whose session has no launch snapshot
- **THEN** the resume is refused with a clear error instead of relaunching with an unrestricted environment

### Requirement: Subagent model resolution falls back to a working model

A spawned subagent SHALL be given a model that is actually usable. The requested
model — the agent profile's `model:` frontmatter value, or an explicit model
parameter on the spawn, including any `:<thinking>` suffix — SHALL be validated
against the spawning parent session's model registry using an exact
provider/model lookup plus a check that the provider has configured credentials.
A model that cannot be resolved this way (unknown provider, unknown model id, or
provider without configured credentials) SHALL NOT be passed to the child, since
the child pi would hard-fail at startup or die on its first LLM call. When the
requested model is unusable, or when no model is defined at all (no agent
`model:` value and no explicit model parameter), the resolved model SHALL fall
back to the spawning parent's current model; if the parent session has no
current model either, no `--model` flag SHALL be passed and pi's own configured
default applies. The `:<thinking>` suffix of a resolved fallback model is not
injected; only the requested model's own suffix is preserved. The spawn result or
tool output SHALL indicate when a fallback was used and from which source. The
resolved model SHALL be recorded in the launch snapshot instead of the raw
requested model.

#### Scenario: Agent profile model resolves

- **WHEN** an agent profile declares a `model:` that exists in the registry with configured credentials
- **THEN** the child is started with exactly that model

#### Scenario: Unresolvable agent model falls back to the parent model

- **WHEN** an agent profile declares a model whose provider or model id does not resolve (e.g. the `model-provider/model-id` placeholder)
- **AND** the parent session has a current model
- **THEN** the child is started with the parent's current model
- **AND** the spawn result notes that the fallback was used

#### Scenario: Unresolvable model with no parent model

- **WHEN** the requested model does not resolve
- **AND** the parent session has no current model
- **THEN** the child is started without a `--model` flag, using pi's configured default

#### Scenario: Model not defined at all

- **WHEN** the agent profile declares no `model:` and no explicit model parameter is given
- **THEN** the child is started with the parent's current model when one exists
- **AND** otherwise without a `--model` flag

#### Scenario: Known model without configured credentials

- **WHEN** the requested model exists in the registry but its provider has no configured credentials
- **THEN** the model is treated as unusable and the fallback chain applies

#### Scenario: Thinking suffix is preserved on a valid model

- **WHEN** the requested model carries a `:high` thinking suffix and resolves
- **THEN** the child is started with the model and its suffix

#### Scenario: Explicit spawn model override is validated too

- **WHEN** the spawn is given an explicit model parameter that does not resolve
- **THEN** the fallback chain applies to that explicit model as well

### Requirement: Resume re-validates the snapshotted model

Resuming a subagent SHALL re-validate the model stored in its launch snapshot
using the same resolution as spawn time. When the snapshotted model no longer
resolves, the resumed child SHALL be started with the resuming parent's current
model (or without a `--model` flag when the parent has none) and the resume
result SHALL note the fallback. A snapshotted model that still resolves SHALL be
replayed unchanged, and the other snapshot fields (tools, extensions, discovery
mode, identity) SHALL be replayed exactly as before.

#### Scenario: Resume with a still-valid model

- **WHEN** a subagent is resumed and its snapshotted model still resolves with configured credentials
- **THEN** the resumed launch passes that same model

#### Scenario: Resume with a stale model

- **WHEN** a subagent is resumed and its snapshotted model no longer resolves
- **THEN** the resumed launch uses the resuming parent's current model when one exists, otherwise no `--model` flag
- **AND** the resume result notes the fallback

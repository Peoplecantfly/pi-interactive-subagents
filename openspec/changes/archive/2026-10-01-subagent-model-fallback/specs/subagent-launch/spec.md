# Spec Delta

## ADDED Requirements

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

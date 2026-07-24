# Single-Shot Production Run Design

## Goal

Make one Shot complete a recoverable, server-owned production path: approved source image -> Vidu video -> persisted video asset -> editable Shot state -> timeline and Jianying export.

## Scope

This design adds the smallest durable orchestration layer to the existing NestJS API. It uses PostgreSQL through the existing Prisma client and reuses the existing `Generation` and `Asset` modules. The first release supports one action only: `generate-video-clip` through the current Vidu route contract.

Out of scope: multi-provider routing, batch concurrency, Redis/BullMQ, real-time collaboration, a new canvas data model, and changing image/TTS generation.

## Model

`ProductionRun` is the durable user-visible run for a project and shot. `ProductionTask` is one idempotent action within a run. `ProductionAttempt` stores each provider submission, request snapshot, provider job ID, normalized provider status, error, and output asset ID.

The task state machine is:

```text
queued -> submitting -> polling -> completed
                    \-> failed
queued/submitting/polling -> cancelled
failed -> queued (retry creates a new attempt)
```

The database is authoritative for these states. The canvas remains an editor and projection: it stores the current `productionTaskId`, current video asset ID, URL, and generation status, but must never invent completion.

## Data Flow

1. The web client assembles a `ShotVideoRequest` with the Shot ID, immutable image asset ID, prompt, duration, references, and provider selection.
2. `POST /production-runs` validates the project, source asset, Vidu configuration, and required Shot fields. It creates a run, queued task, and first attempt atomically, then returns stable IDs.
3. The API submits the Vidu job. The attempt receives the provider job ID before the response is returned whenever the provider accepts it.
4. A server-side polling endpoint/service advances only tasks whose persisted provider job is pending. Poll results are normalized into `queued`, `running`, `completed`, or `failed`.
5. Completion downloads or registers the provider output as a server `Asset`, then atomically attaches that asset to the attempt and completes the task/run.
6. The client polls `GET /production-runs/:id` while the task is active. On completion it writes the returned asset reference to the Shot and timeline. Reloading resumes from the persisted API record.
7. Jianying export accepts only a completed video asset reference. It reports an explicit preflight failure instead of creating a synthetic video path.

## Failure Handling

- No API key, model, source image, or required prompt: reject before creating a provider request with a structured preflight issue.
- A provider accepts the task but polling is interrupted: retain `providerJobId`; a later poll continues the same attempt.
- A network timeout before provider acceptance is known: preserve an attempt with `submitting` state and a request idempotency key; recovery checks it before resubmitting.
- Provider failure: mark the attempt and task failed with normalized error data; retry creates a new attempt without overwriting prior evidence.
- Cancellation is best effort. Persist cancellation locally, invoke the provider cancel capability when available, and never convert an unknown remote state to completed.

## API Surface

```text
POST /production-runs
GET  /production-runs/:runId
POST /production-runs/:runId/poll
POST /production-runs/:runId/retry
POST /production-runs/:runId/cancel
```

The first endpoint receives a single `generate-video-clip` request. It does not accept arbitrary canvas graphs. Responses include run/task/attempt IDs, state, timestamps, normalized errors, and an output asset only after it exists.

## Acceptance Criteria

1. A configured Vidu account can submit a Shot whose source image is stored by the API.
2. Refreshing the browser during generation does not create another Vidu job; reopening restores the same persisted run.
3. Successful polling creates a durable video asset and links it to the Shot.
4. Failed jobs preserve provider error and can be retried as a new attempt.
5. Export rejects incomplete Shots and emits a Jianying draft only when its referenced video asset exists.
6. Unit tests cover state transitions, idempotency, failure/retry, and export preflight. An opt-in authenticated smoke test covers Vidu submission and polling.

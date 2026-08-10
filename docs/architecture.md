# Production-Oriented Architecture

AI Hospitality Team currently proves one genuine model-backed guest-message path. This document defines the boundaries needed to evolve it into a commercial multi-property system without claiming that the missing operational controls already exist.

## Runtime boundaries

```text
Inbound channel adapter
  -> application service / Vercel A2A bridge
  -> isolated Manyfold A2A orchestrator
  -> booking/property/guest context repositories
  -> Head Butler orchestration
  -> model runtime adapter
  -> specialist contributions
  -> policy and approval service
  -> memory/audit transaction
  -> outbound channel adapter
```

Replaceable interfaces are the design constraint:

- `ModelRuntime`: Manyfold-managed Codex behind an isolated A2A agent today; the provider adapter remains replaceable.
- `GuestMemoryRepository`: request-scoped transitional implementation today; durable tenant-scoped database later.
- Property knowledge repository: typed fixture today; versioned property documents/search later.
- Message adapter: local in-memory delivery today; PMS, OTA, email, or messaging channel later.
- Action adapter: absent today; audited staff-approved tasks, refunds, or maintenance later.

Core orchestration consumes typed inputs and outputs, not provider SDK objects.

## Commercial data model

A durable implementation should contain at least:

| Entity | Isolation key / purpose |
| --- | --- |
| Hospitality business | Top-level tenant and billing/security boundary |
| Staff user and role | Tenant-scoped authentication and permissions |
| Property | Tenant-scoped property identity and policy |
| Property knowledge version | Verified instructions, source, owner, and effective dates |
| Booking | Tenant + property + external reservation identity |
| Guest | Tenant-scoped identity; cross-property use only with lawful policy |
| Conversation | Booking/channel scope and delivery state |
| Message | Immutable inbound/outbound record with idempotency key |
| Guest memory | Guest + tenant scope, provenance, retention, sensitivity, deletion state |
| Issue/escalation | Booking scope, severity, owner, SLA, resolution, and approval state |
| Agent run | Route, selected agents, models, latency, outcome, and safe rationale |
| Model usage | Tokens, tier, approximate/actual cost, task, and tenant allocation |
| Audit event | Actor, action, target, before/after metadata, and timestamp |

Every query must include tenant identity. Booking, property, and guest IDs are not sufficient on their own. Database row-level controls are useful defence in depth but do not replace application authorization tests.

## Guest memory lifecycle

Memory candidates should record:

- category and normalised value
- source message and booking
- model/runtime version that proposed it
- confidence or validation outcome
- creation and expiry dates
- sensitivity classification
- guest deletion/objection state

Do not retain payment data, identity documents, medical details, or unrelated private chat as personalisation memory. Accessibility needs require explicit product policy, minimisation, and controlled access.

Memory writes should be idempotent and transactionally committed with the agent-run audit event. A future semantic deduplication process should merge equivalent facts while preserving provenance.

## Property knowledge

Knowledge records need an owner, verification timestamp, property scope, and validity state. Exact facts such as door codes and Wi-Fi credentials should be encrypted, access-controlled, and released only to an authenticated guest with an active relevant booking.

Local recommendations should distinguish stable host-curated advice from live facts such as opening hours, availability, disruption, or price. Live facts require a real tool/integration and source timestamp.

## Human approval

Recommended action state machine:

```text
proposed -> policy checked -> awaiting approval -> approved/rejected
         -> executing -> succeeded/failed -> audited
```

Refunds, discounts, compensation, emergency/security incidents, contractual commitments, and irreversible external actions default to human approval. An AI recommendation is not an executed action.

Authority rules should be deterministic, tenant-configurable, versioned, and included in the audit record. For example, a future pricing agent may offer only within host-defined stay length and discount limits.

## Observability

Operational traces should capture:

- trace and conversation IDs
- selected/skipped agents and safe selection rationale
- model/runtime/tier per call
- latency, timeout, retries, and validation failures
- input/output token usage and cost where available
- grounded knowledge keys and versions
- memory candidates and committed changes
- safety policies triggered
- escalation and approval state
- external action attempt and result

Do not store raw hidden reasoning. Message content and model inputs need retention controls and access logging.

## Failure design

- Model/provider unavailable: retry only within a bounded idempotent policy, then create human handoff.
- Malformed output: reject; never infer success from partial prose.
- Database unavailable: do not claim memory or action persistence succeeded.
- Missing knowledge: state uncertainty and request host confirmation.
- External adapter failure: keep action in failed/pending state and surface it to staff.
- Duplicate inbound webhook: return the idempotent prior result rather than repeat work.
- Concurrent messages: serialize or version memory updates per conversation/booking.

## Deployment prerequisites

The competition Preview has bounded request validation plus best-effort per-instance request, daily, and concurrency guards. The public A2A path is blocking and returns one final/error NDJSON event; only the direct local Node path streams intermediate agent events. A production service still needs distributed enforcement and the controls below.

Before public deployment:

1. Add host/staff authentication and tenant authorization.
2. Add guest/channel authentication and webhook verification.
3. Replace browser memory with a durable encrypted store and retention controls.
4. Add a least-privilege model runtime suitable for untrusted guest input.
5. Add rate limits, request budgets, abuse controls, and per-tenant cost ceilings.
6. Add durable audit, metrics, alerting, tracing, and staff escalation ownership.
7. Add privacy documentation, deletion/export workflows, and incident response.
8. Run adversarial prompt-injection, cross-tenant isolation, safety, and load evaluations.

The current architecture is production-oriented. Completion of these items, plus operational review, is required before it can be described as production-ready.

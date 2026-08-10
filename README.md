# AI Hospitality Team

AI Hospitality Team is a production-oriented prototype for post-booking hospitality operations. A model-backed Head Butler interprets each guest message, activates only useful specialists, grounds their work in guest and property context, and returns one coherent reply.

The product is not a booking marketplace. Its scope is:

```text
Booking confirmed -> Pre-arrival -> Arrival -> During stay
-> Problem resolution -> Check-out -> Review / follow-up
```

This branch replaces deterministic keyword routing as the primary intelligence layer. It is a production-oriented competition prototype, not a production-ready service: authentication, durable multi-tenant storage, a staff approval queue, distributed abuse controls, and operational monitoring remain required.

## Project identity

- Official product name: **AI Hospitality Team**
- GitHub repository: **`Yinger06/ai-hospitality-team`**
- Manifold agent: **`hospitality-builder`**
- Protected baseline: **`main`**
- Upgrade branch: **`production-ai-upgrade`**

The Sprite service label `stayline` and browser storage key `stayline-demo-v1` are legacy environment/compatibility identifiers only. They are not product names. Do not rename the storage key without a backward-compatible migration.

## Genuine AI path

For a live guest message, the application performs this sequence:

```text
Guest message + booking scope + current memory
                    |
         deterministic input validation
         and emergency safety backstop
                    |
     Head Butler model call (gpt-5.4-mini)
       semantic intents, sentiment, severity,
       specialist selection, knowledge keys,
       and structured memory candidates
                    |
       verified property knowledge lookup
                    |
       selected specialists only, in parallel
       (bounded gpt-5.4-mini model calls)
                    |
     deterministic policy and memory commit
                    |
   one contribution: return it without another call
   multiple contributions: synthesis model call
   (gpt-5.4-mini, or gpt-5.6-terra for complex/high-risk work)
                    |
       output validation + action-claim guard
                    |
       one guest reply + trace + memory update
```

Guest Memory is deliberately different from the conversational specialists. The Head Butler extracts memory candidates with a model; typed application code validates scope and writes them. A model never mutates guest state directly.

## Agent responsibilities

| Agent | Genuine responsibility |
| --- | --- |
| Head Butler | Semantic interpretation, multi-intent routing, urgency, knowledge needs, selective activation, and coordination |
| Guest Memory | Scoped retrieval and deterministic commit of model-proposed useful context |
| Front Desk | Contextual answer based on verified access, Wi-Fi, check-in, check-out, luggage, and property facts |
| Local Guide | Personalised suggestions using only supplied local knowledge and guest memory |
| Problem Solver | Complaint interpretation, severity, immediate recovery guidance, and escalation recommendation |
| Guest Experience | Welcome, sentiment-aware care, recovery follow-up, farewell, and review relationship |
| Response synthesiser | Deduplicates and prioritises several specialist contributions into one guest reply |

The local Node server streams route and specialist events while it runs orchestration directly. The public Vercel path is deliberately blocking: Manyfold A2A returns a final `Message` or completed `Task`, and the Vercel bridge returns exactly one final or error NDJSON event. The UI then renders the final selected/skipped/completed agent state, model IDs, call purpose, duration, grounding, memory changes, and safety rules. It does not currently animate live specialist progress over the public A2A path. Private model reasoning is never shown.

## Manyfold usage

The public competition path is:

```text
Browser -> Vercel /api/orchestrate -> Manyfold A2A
-> AI Hospitality Team Orchestrator -> versioned orchestration runner
-> Head Butler + selected specialists -> structured result
-> A2A Message/completed Task -> one NDJSON final event -> browser
```

The dedicated Manyfold target is **AI Hospitality Team Orchestrator** (`agt_agp6y5mgxr5qzf33egqz6sqcc4`) in `/home/sprite/.manyfold/workspaces/ai-hospitality-team-orchestrator`. It is separate from the development agent `hospitality-builder`. A2A exposure and a revocable external caller authorize Vercel; the bearer stays only in Vercel's encrypted server environment.

Hosted Manyfold A2A currently starts a Codex framework turn rather than a direct executable hook. The least-privilege mechanism available in this environment is therefore a dedicated isolated agent whose `AGENTS.md` permits only the versioned `ai-hospitality-orchestrator` skill. That skill passes the single marked JSON context to `server-dist/server/a2aRunner.js`; it forbids general chat, debugging, browsing, file changes, environment inspection, and alternate answers. The application runner, not the outer framework turn, performs Head Butler routing and specialist orchestration.

`ManyfoldCodexRuntime` invokes the Manyfold-managed provider through the installed Codex runtime. Each model call runs in a fresh temporary directory with application tools disabled, no inherited shell variables inside the model sandbox, ignored user/project instructions, read-only sandboxing, and a strict JSON output schema. The application records model, tier, task, latency, and token usage returned by each call.

The target uses Manyfold's `platform` model source. `npm run manyfold:sync` reads the official non-secret `mf model-config get` view, verifies `gpt-5.4-mini` and `gpt-5.6-terra`, and writes a mode-`0600` `manyfold-runtime.json` snapshot into the isolated workspace. This avoids both an unverified source-code URL and a runtime account-read permission on the deliberately narrow A2A identity. Provider credentials remain Manyfold-managed and are never copied.

## Quick start

Requirements:

- Node.js 20 or newer
- npm 10 or newer
- For direct local live AI: a Manyfold-managed runtime with `mf`, Codex, `MF_AGENT_ID`, and working managed model access

Install and run inside the existing Manyfold runtime:

```bash
npm ci
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`. The existing Sprite service uses port 8080.

Check the server boundary without starting a model call:

```bash
curl http://localhost:8080/api/health
```

Expected live mode:

```json
{"status":"ok","aiRuntime":"manyfold-runtime"}
```

### Explicit fixture mode

Automated browser tests use a deterministic fixture runtime. It is visibly labelled **Test fixture mode** and must never be represented as live AI:

```bash
AI_RUNTIME=fixture npm run dev
```

There is no automatic fallback from live AI to this fixture. Provider failures produce a visible safe handoff.

## Build and server

```bash
npm run build
npm start
```

`npm run build` produces:

- `dist/`: browser assets
- `server-dist/`: Node orchestration server

`npm start` serves both the UI and `/api/*`. A static-only host is no longer sufficient because model credentials and model execution must remain server-side.

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_RUNTIME` | `manyfold-codex` | Active runtime. `fixture` is test-only and visibly disclosed. |
| `AI_ECONOMY_MODEL` | `gpt-5.4-mini` | Routing and bounded specialist work |
| `AI_REASONING_MODEL` | `gpt-5.6-terra` | Complex or high-risk synthesis only |
| `AI_MODEL_CONFIG_FILE` | `./manyfold-runtime.json` if present | Generated managed-model snapshot used by the isolated runner |
| `AI_PROVIDER_BASE_URL` | unset | Development-only non-secret endpoint override |
| `MANYFOLD_A2A_RPC_URL` | required on Vercel | Non-secret RPC URL for the isolated orchestrator |
| `MF_A2A_BEARER` | required on Vercel | Secret revocable external-caller bearer; server-side only |
| `DEMO_RATE_LIMIT` | `12` | Requests per source per demo window, per warm Vercel instance |
| `DEMO_RATE_WINDOW_SECONDS` | `900` | Demo rate-window duration |
| `DEMO_DAILY_REQUEST_LIMIT` | `40` | Daily requests per source, per warm Vercel instance |
| `DEMO_MAX_CONCURRENT_REQUESTS` | `2` | Concurrent paid A2A requests per warm Vercel instance |
| `PORT` | `8080` | Production server port |

No secret belongs in a `VITE_*` variable or browser bundle. `.env` files are ignored. The A2A bearer must be configured for Vercel Preview/Production as needed and a new deployment created after changing scope. The active Manyfold adapter uses runtime-managed model authentication and never sends credentials to the browser.

### Reproducible isolated orchestrator

Synchronizing is a zero-model-credit deployment operation. The command copies the repository-pinned package/lockfile, server and domain source, installs the dedicated skill and `AGENTS.md`, snapshots the non-secret managed model view, runs `npm ci`, compiles with the repository's TypeScript `6.0.3`, and records per-file SHA-256 hashes:

```bash
MANYFOLD_ORCHESTRATOR_AGENT_ID=agt_agp6y5mgxr5qzf33egqz6sqcc4 \
MANYFOLD_ORCHESTRATOR_WORKSPACE=/home/sprite/.manyfold/workspaces/ai-hospitality-team-orchestrator \
npm run manyfold:sync

MANYFOLD_ORCHESTRATOR_AGENT_ID=agt_agp6y5mgxr5qzf33egqz6sqcc4 \
MANYFOLD_ORCHESTRATOR_WORKSPACE=/home/sprite/.manyfold/workspaces/ai-hospitality-team-orchestrator \
npm run manyfold:check
```

The sync identity needs `model-config:read` for the target. It does not need model-config edit access and does not invoke a model. A2A exposure and external caller creation are separate zero-credit platform operations. Create a caller only when a new bearer is required; its secret is shown once and must go directly into Vercel's `MF_A2A_BEARER` value.

## Tests

```bash
npm test
npm run build
```

Browser tests use explicit fixture mode. Start a fixture server on a spare port, then run:

```bash
AI_RUNTIME=fixture PORT=4173 npm start
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run test:e2e
```

The optional live evaluation calls real models and consumes normal Manyfold model quota:

```bash
npm run eval:live
```

It checks paraphrased multi-intent language, indirect urgent safety language, and irrelevant friendly chat. It reports actual selected agents, model IDs, token usage, memory changes, and safety rules.

## Data and memory

Current memory has two adapters:

- `RequestMemoryRepository` enforces `propertyId + bookingId + guestId` scope during orchestration.
- Browser `sessionStorage` retains the demo journey for the current tab using the legacy key `stayline-demo-v1`.

This is not durable commercial storage. The repository boundary is designed for a future database implementation with tenant isolation, retention/deletion controls, staff access policy, audit records, and encrypted storage. See [docs/architecture.md](docs/architecture.md).

## Property knowledge

Front Desk and Local Guide receive facts from a typed property knowledge record. The model selects knowledge keys; code retrieves exact values. Missing information must be acknowledged rather than invented.

The bundled Primrose House property, guest, Wi-Fi, access instructions, and local suggestions are demo fixtures. They are not a live knowledge-base integration, and opening hours or availability are not claimed as current.

## Safety and human approval

The application may analyse and recommend, but it does not execute refunds, discounts, compensation, bookings, maintenance dispatch, emergency calls, or messages to staff.

Deterministic policy requires human review for medium, high, and urgent issues. Emergency phrase backstops cover fire/gas, medical danger, and immediate property/security risk even if a model under-routes the message. The guest receives grounded emergency and host contact details. The UI says **Human review required**, not that a person was already notified.

Review requests must be withheld while issues remain unresolved. High-impact actions need a future staff approval workflow and audit record before any external adapter can execute them.

## Failure handling

- Model timeout/provider failure: stop the AI path, show an operational error, and send a conservative human-handoff message.
- Malformed structured output: reject it; do not use partial free-form data.
- Missing property fact: state that the host must confirm it.
- Unauthorised action claim: reject the response rather than pretending an external action happened.
- Messaging/PMS failure: not connected yet; current adapters are explicitly simulated.

No deterministic keyword engine silently replaces a failed live model call.

## Project structure

```text
api/
  orchestrate.ts         Vercel validation, demo guards, A2A bridge and envelope translation
manyfold/orchestrator/
  sync-workspace.mjs     Reproducible isolated workspace generator/checker
  skill/                 Dedicated A2A runner skill installed into the target
server/
  data/                  Grounded property and scoped memory repositories
  evals/                 Optional real-model routing evaluation
  http/                  Streaming API boundary
  orchestration/         AI Head Butler, prompts, schemas, routing, synthesis
  policy/                Deterministic safety and business guards
  runtime/               Replaceable model runtime adapters
src/
  agents/                Legacy deterministic specialists (not the live path)
  components/            Host console and agent visualisation
  data/                  Labelled demo property/guest journey
  domain/                Shared typed contracts
  hooks/                 Guest journey and orchestration state
  orchestration/         Legacy deterministic engine and regression tests
  services/              API and simulated messaging adapter boundaries
docs/
  architecture.md        Commercial data, isolation, adapter, and safety design
```

The legacy deterministic engine remains for baseline regression coverage and as a reference fixture. It is not imported by the live message path. `src/hooks/useGuestJourney.ts` calls only the server orchestration API.

## Current simulations and limitations

- Booking, guest inbox, host updates, reviews, and outbound delivery use local demo adapters.
- The initial welcome visible on first load is labelled `Sample welcome · fixture`; running the booking demo event uses the live path.
- Primrose House, Maya, access details, and local knowledge are fixtures.
- Browser memory is temporary; no commercial database is connected.
- Escalations are in-app records only; no staff notification is sent.
- There is no user authentication, role-based access control, tenant administration, webhook verification, durable audit store, or production monitoring yet.
- Vercel's demo rate/concurrency counters are best-effort and per warm function instance. They reduce accidental competition-credit use but are not a distributed production billing control.
- Model call traces are returned to this trusted host console; a guest channel adapter should receive only the final response.

## Deployment status

The `production-ai-upgrade` branch is connected to Vercel Preview deployment. A push may therefore create a Preview automatically; no command in this repository manually deploys. The Preview runs only the Vite UI and `api/orchestrate.ts`; the actual model-backed orchestration remains in the isolated Manyfold A2A target.

The public bridge enforces a 64 KiB request limit, bounded context validation, an HTTPS `api.manyfold.ai` target, and per-instance demo request/concurrency budgets. These controls are appropriate for a limited competition demonstration, not a substitute for host/staff authentication, tenant isolation, a distributed rate/cost store, durable audit, monitoring, or an approval queue.

The code is portable at the orchestration boundary: replace `ModelRuntime`, `GuestMemoryRepository`, property knowledge, and message adapters without changing agent contracts. The current `ManyfoldCodexRuntime` is appropriate for the Manyfold development/demo environment, not yet a general public hosting adapter.

## Future integrations

Planned replaceable adapters include PMS/OTA booking events, Booking.com, Airbnb, WhatsApp, email, web chat, maps, voice, payments/refunds, and staff task systems. None is represented as live today.

The reserved `pre-booking` lifecycle and `enquiry-pricing` slot remain unimplemented. A future pricing agent must use deterministic discount authority and human approval above policy limits.

## GitHub export

Repository: `https://github.com/Yinger06/ai-hospitality-team`

Normal future branch publication:

```bash
git push -u origin production-ai-upgrade
```

This saves source code and may trigger the repository's configured Vercel Preview build; it does not merge `main` or create a production deployment. Never commit `.env` files, provider tokens, OAuth files, runtime credentials, build output, or local workspace metadata.

## Asset attribution

The bundled Primrose House demo photograph is adapted from [Annie Spratt on Unsplash](https://unsplash.com/photos/M5ONrYjTP74) and is used under the Unsplash License.

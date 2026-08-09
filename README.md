# AI Hospitality Team

AI Hospitality Team is a working hackathon prototype for post-booking hospitality operations. A Head Butler orchestrates a team of specialist agents from booking confirmation through review follow-up, while the guest receives one coherent host response.

This is not a booking marketplace. The current scope begins after a booking is confirmed.

## Project identity

- Official product name: **AI Hospitality Team**
- GitHub repository: **`Yinger06/ai-hospitality-team`**
- Manifold agent: **`hospitality-builder`**

The legacy session key `stayline-demo-v1` and the Sprite development-service label `stayline` are internal compatibility/environment identifiers only. Any remaining internal `stayline` identifier is not the product name.

## What the demo includes

- A modular Head Butler router and response synthesiser
- Five independent specialist agents: Guest Memory, Front Desk, Local Guide, Problem Solver, and Guest Experience
- Multi-intent routing with visible active, working, done, and skipped states
- Session-persistent guest memory using `sessionStorage`
- Human escalation for medium, high, and urgent issues
- Review-request suppression while an issue remains unresolved
- Five selectable property communication personalities
- A ten-step sample journey from booking confirmation to public review response
- Manual guest-message input through the same pipeline as the scripted demo
- Replaceable messaging and future-agent interfaces
- Responsive desktop and mobile host consoles

## Quick start

Requirements: Node.js 20 or newer and npm 10 or newer.

```bash
npm ci
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`.

Production build:

```bash
npm run build
npm run preview
```

Tests:

```bash
npm test
```

Optional browser smoke test (install Chromium once):

```bash
npx playwright install chromium
npm run test:e2e
```

No environment variables are required. The prototype is deterministic and makes no external AI or messaging calls. `.env.example` documents the extension point for future providers.

## Deployment

AI Hospitality Team is a client-side Vite application. Any static host that supports a Node.js build step can serve it with these settings:

| Setting | Value |
| --- | --- |
| Node.js | 20 or newer |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Environment variables | None |

To verify the production output locally, run `npm run build`, then `npm run preview`. The preview command serves the generated `dist` directory and prints the local URL.

For a host that publishes the site under a repository subpath rather than at a domain root, configure Vite's `base` option for that subpath before deployment. That deployment-specific setting is intentionally not enabled in the current prototype.

## Demo flow

Use **Next demo moment** below the conversation to move through the complete sample journey. The most useful judging moment is **Multi-intent moment**:

> We had a wonderful day at the British Museum. The shower seems a little cold though. We’re going to Greenwich tomorrow.

The Head Butler detects four intents and activates Guest Memory, Guest Experience, Local Guide, and Problem Solver. Front Desk is explicitly skipped. The agents save the museum and Greenwich context, escalate the shower issue to the host, acknowledge the positive experience, add relevant Greenwich help, and return one natural response.

The left journey list can jump directly to any scenario. **Reset demo** clears session state. The voice selector in the header changes welcome, farewell, review-request, review-response, and general support wording.

## Architecture

```text
Booking / guest / host / review event
                 |
       MessageAdapter interface
                 |
        Head Butler router
      intent + stage + sentiment
                 |
       Agent registry selects only
       relevant specialist agents
          /   /   |   \   \
     Memory Desk Care Guide Problem
          \   \   |   /   /
        explicit contributions
          + memory patches
          + escalation records
                 |
        Response synthesiser
                 |
      One message sent to guest
```

Agent modules never write directly to the conversation. They return typed `AgentContribution` objects. The Head Butler merges memory patches and issue records, then gives all response parts to the synthesiser. This keeps responsibilities testable and prevents separate robotic messages reaching the guest.

## Project structure

```text
src/
  agents/                 Specialist implementations and registry
    frontDesk.ts
    guestExperience.ts
    guestMemory.ts
    localGuide.ts
    problemSolver.ts
    registry.ts            Current agents plus future registration slots
  components/              Host-console UI and live agent visualisation
  data/sampleData.ts       Property, guest, and complete demo journey
  domain/types.ts          Agent, lifecycle, memory, event, and result contracts
  hooks/useGuestJourney.ts UI workflow, animation phases, and session persistence
  orchestration/
    router.ts              Intent detection and selective activation
    headButler.ts          Specialist execution and state coordination
    synthesizer.ts         One coherent guest response
    headButler.test.ts     Core journey and policy tests
  services/
    messageAdapter.ts      Replaceable inbound/outbound integration boundary
```

## What is simulated

- Agent reasoning is deterministic, keyword and lifecycle based. This makes the demo fast, offline, reproducible, and easy to judge.
- Booking, guest inbox, host updates, and review events come from the local demo journey.
- Access instructions, Wi-Fi credentials, local recommendations, property data, and human alerts use realistic fixture data.
- “Human host notified” creates an in-app escalation record; it does not send SMS, email, or a task to an external system.
- Guest memory persists only for the current browser tab session.

The deterministic agents can later become prompt-backed or tool-using implementations without changing the `SpecialistAgent`, `AgentContribution`, routing, or UI contracts.

## Extension path

### Real AI models

Replace individual `run` functions or add an `AgentRuntime` adapter. Keep validated structured outputs matching `AgentContribution`; do not let free-form model output mutate memory directly. Add provider configuration to `.env.example`, and keep credentials server-side.

### PMS and messaging

Implement `MessageAdapter` for a PMS, OTA inbox, email, or WhatsApp provider. In production this should sit behind a server endpoint with webhook verification, retries, idempotency keys, and an outbound audit log.

### Durable storage

Move guest profile, memory, conversation, issue, and trace records to a database. Scope all reads and writes by property and booking, and add retention and deletion controls.

### Future pre-booking support

`FutureStayStage`, `FutureAgentId`, and `futureAgentSlots` reserve a `pre-booking` / `enquiry-pricing` extension without placing it in the current runtime. A future module can register against the same agent contract, then add discount authority and human-approval policies. No current booking-confirmed-to-review module needs restructuring.

## Recommended next production work

1. Add a server-side model runtime with structured output validation and trace storage.
2. Add host authentication, property isolation, and role-based escalation controls.
3. Add a durable database and audited human handoff queue.
4. Connect one real PMS or messaging adapter behind verified webhooks.
5. Add model evaluations for routing, memory precision, safety escalation, tone, and review timing.
6. Add multilingual guest communication and host-approved local knowledge.

## Export to GitHub

The repository is portable and contains no platform-specific runtime dependency. Manyfold and Sprite workspace metadata, local environment files, dependencies, builds, and test output are excluded by `.gitignore`.

For the existing `Yinger06/ai-hospitality-team` repository, authenticate with GitHub's browser flow and push over HTTPS:

```bash
gh auth login --hostname github.com --git-protocol https --web
git init
git add .
git commit -m "Build AI Hospitality Team multi-agent guest operations prototype"
git branch -M main
git remote add origin https://github.com/Yinger06/ai-hospitality-team.git
git push -u origin main
```

The GitHub login uses OAuth and does not require creating or pasting a personal access token. These commands only save the source to GitHub; they do not deploy the application. Never commit `.env` files or provider credentials.

## Asset attribution

The bundled Primrose House demo photograph is adapted from [Annie Spratt on Unsplash](https://unsplash.com/photos/M5ONrYjTP74) and is used under the Unsplash License.

# Personal AI Operator

A local-first working prototype that turns goals and dated milestones into a daily operating system across Career, Learning, Startup Lab, and Content.

## Implemented

- Multiple persisted goals with weighted, dated milestones.
- Goal-driven Today priorities with a 100% time allocation.
- Local calendar constraints, proposed focus blocks, and planning notes.
- Persistent job board with explicit LinkedIn and Gmail connector states.
- Multiple learning tracks and persistent learning queues.
- Multiple startup ideas with independent validation state.
- Content strategy summary, top-three recommendations, and backlog state.
- Inspectable Markdown-style context previews and a durable decision ledger.
- Tyrion and Samwell role briefs, retrospective proposals, and approval flow.
- Cloudflare D1-compatible schema and checked-in migrations.

External services are not simulated. Google Calendar, Gmail, LinkedIn/Chrome collection, and live model research remain visibly unconnected until their credentials or user-approved handoffs are configured.

## Local development

```bash
npm install
npm run dev
```

The site runs at `http://localhost:3000` by default.

## Validation

```bash
npm run lint
npm run build
```

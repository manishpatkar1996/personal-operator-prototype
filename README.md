# Personal AI Operator

A **local-first** operator for one person: Today, Career, Learning, Startup Lab, and Content. Data stays in a SQLite database on your machine (Cloudflare D1 via Wrangler). It is a working prototype you run yourself — not a hosted product with accounts.

## Can someone else use this?

Yes, if they can clone the repo and run Node on their laptop. They get **their own** database. They do **not** get your résumé, calendar, or API keys.

It is **not** production in the SaaS sense: no login, no multi-user isolation, no Gmail/LinkedIn automation, no Google Calendar writes. LinkedIn stays a copy-out. Calendar read is an iCal URL you paste. Models are optional.

## Run it

You need **Node 22.13+** (`node -v`). Then:

```bash
git clone https://github.com/manishpatkar1996/personal-operator-prototype.git
cd personal-operator-prototype
npm install
npm run setup
```

`npm run setup` copies `.dev.vars.example` → `.dev.vars` if that file is missing.

Optional but recommended: put a [DeepSeek](https://platform.deepseek.com) key in `.dev.vars`:

```
DEEPSEEK_API_KEY=sk-...
```

Then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A first clone lands on **You** (Setup): résumé, career filters, a **goals JSON** paste, and an optional **Connect Google Calendar** step (secret iCal URL — does not block Save context). Sample goals/jobs are a walkthrough — saving setup or importing JSON replaces them. If this machine already has your résumé and goals, Setup stays available in the sidebar and will not wipe that data unless you import with “Replace all” or use Reset.

### Goals JSON

Paste `{ "goals": [ ... ] }` on **You** or **Goals**. Dates may be `YYYY-MM-DD` or `DD/MM/YYYY`. Priority may be `1–5` or High / Medium / Low. Milestone weights may be `15` or `15%`. Copy the example on Setup (five outcome goals) and import in one paste. **Copy mine** on Goals exports the same shape.

Without a key the app still runs. Collect, drafts, and thesis validation fall back to local rules until DeepSeek is set. OpenAI stays off in `lib/operator/models.ts` (`OPENAI_LIVE = false`). Pause DeepSeek the same way with `DEEPSEEK_LIVE`.

### Optional calendar

Google Calendar → Settings → Integrate calendar → secret iCal URL. Paste it on **You** (Setup) or in Calendar controls, or set `GOOGLE_CALENDAR_ICS_URL` in `.dev.vars`. Writes stay queued in the app.

## What works vs what does not

| Works locally | Does not |
|---|---|
| Today plan, goals, calendar blocks | Sending Gmail |
| Career résumé, fit scores, full `.tex` download | Scraping or posting to LinkedIn |
| Learning RSS collect + Useful / Not for me | Background Chrome / LinkedIn crawl |
| Startup thesis canvas, challenge rail, one-pager | Google Calendar writes |
| Content desk, copy-out to LinkedIn/Medium | Multi-user / hosted accounts |

Career **Collect roles** pulls a bounded batch from public JSON boards (Remotive, Jobicy, Arbeitnow, The Muse, optional Adzuna, optional [India Jobs API](https://indianapi.in/jobs-api)) using the target roles saved on You — no Greenhouse slug required. Company boards (Greenhouse, Lever, Ashby, SmartRecruiters) and paste-URL stay available. LinkedIn is copy-out / paste-in only. Optional Adzuna / Muse / `INDIANAPI_JOBS_KEY` keys go in `.dev.vars` (see `.dev.vars.example`).

## Checks

```bash
npm test
npm run lint
```

## Secrets

Never commit `.dev.vars`. The example file is safe to share. Keys live only on the machine that runs the app.

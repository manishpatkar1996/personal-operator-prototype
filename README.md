# Personal AI Operator

A **local-first** operator for one person. It runs on your laptop, stores data in a SQLite database on that machine (Cloudflare D1 via Wrangler), and helps you move four programs: **Career**, **Learning**, **Startup Lab**, and **Content**. **Today** is the daily desk. **You** is setup.

This is a working prototype you clone and run yourself. It is **not** a hosted product: no accounts, no multi-user isolation, no cloud of *your* résumé.

Someone else can use this. They clone the repo, run Node, and get **their own** empty-to-sample database. They never see your keys, calendar, or résumé.

---

## Contents

1. [What you get](#what-you-get)
2. [What this will never do](#what-this-will-never-do)
3. [Requirements](#requirements)
4. [Install and first run](#install-and-first-run)
5. [Onboarding — make it yours](#onboarding--make-it-yours)
6. [Goals JSON](#goals-json)
7. [Optional calendar](#optional-calendar)
8. [Optional model key](#optional-model-key)
9. [Optional job-search keys](#optional-job-search-keys)
10. [The programs](#the-programs)
11. [How live models are spent](#how-live-models-are-spent)
12. [Secrets](#secrets)
13. [Checks](#checks)
14. [Reset this machine](#reset-this-machine)
15. [Troubleshooting](#troubleshooting)

---

## What you get

| Surface | What it is for |
|---|---|
| **You** (Setup) | Résumé, target roles, locations, timezone. First-run home. |
| **Today** | Three moves for the day. Calendar blocks. Approve time before it is treated as real. |
| **Goals** | Outcome goals + dated milestones. Import/export JSON. |
| **Career** | Ranked roles, fit against *your* résumé, paste a job URL, collect from public boards. |
| **Learning** | Weekly RSS queue. Useful / Not for me trains taste. |
| **Startup Lab** | YC-shaped thesis canvas. Challenge why it works / doesn’t. Talk-to-people log. One-pager. |
| **Content** | Notes → outline → draft. Copy out to LinkedIn or Medium. The app never posts. |
| **Memory** | Durable notes the operator can read later. |
| **Small Council** | Structured retrospective. You accept or reject proposals. |

Named agents (Tyrion, Varys, Aemon, Davos, Samwell) are prompts behind those programs. The **app owns state**. Models emit JSON. Typing never fires a live call.

---

## What this will never do

| Does **not** | Why |
|---|---|
| Host accounts / multi-user SaaS | One database per laptop. |
| Send Gmail | No mail grant. Career email is empty unless a local feed exists. |
| Write Google Calendar | Read is a secret iCal URL. Writes stay queued in the app. |
| Scrape or post to LinkedIn | Paste a job URL, or copy a draft out. No Chrome crawl. |
| Apply, message recruiters, or auto-enrol | Human handoff only. |
| Call a model while you type | Click **Save & check**, **Challenge this**, **Collect**, **Refresh with model**. |

---

## Requirements

- **Node 22.13+** (`node -v`)
- Git
- A laptop you are willing to keep the database on

A [DeepSeek](https://platform.deepseek.com) key is **optional**. Without it the app still runs: collect, scoring, drafts, and thesis checks fall back to local rules.

---

## Install and first run

```bash
git clone https://github.com/manishpatkar1996/personal-operator-prototype.git
cd personal-operator-prototype
npm install
npm run setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

What those commands do:

| Command | Effect |
|---|---|
| `npm run setup` | Copies `.dev.vars.example` → `.dev.vars` if that file is missing. Does not overwrite an existing `.dev.vars`. Also runs automatically before `npm run dev`. |
| `npm run dev` | Starts the local Vinext + Wrangler app. Database lives under `.wrangler/` (gitignored). |
| `npm test` | Unit tests (no live model required). |
| `npm run lint` | ESLint. |

A first clone lands on **You**. Sample goals, jobs, and content are a **labeled walkthrough pack**, not yours. Saving setup (or importing your goals JSON) replaces the sample career/voice pack. Existing personal data on this machine is not wiped unless you import with **Replace all** or use **Reset**.

---

## Onboarding — make it yours

Do this in order. Calendar and a model key can wait.

### 1. You (required)

Sidebar → **You**.

| Check | Required? | What to do |
|---|---|---|
| **Résumé** | Yes | Upload PDF / `.txt` / `.md` / `.tex`, or paste text. Scoring needs enough text (~80+ characters). |
| **Target roles** | Yes | Comma-separated. Example: `Senior Product Manager, Product Lead AI`. Collect uses these titles. |
| **A live goal** | Yes | Add one on **Goals**, or paste a JSON pack (below). Setup itself does not create goals. |
| **Locations** | Optional | Example: `Chennai, Bengaluru, Remote India`. Helps job collect pick a country/city. |
| **Work modes / skip list** | Optional | Example modes: `Remote, Hybrid`. Skip: `Account Executive, quota sales`. |
| **Timezone** | Optional | Defaults to the browser timezone. |
| **Google Calendar** | Optional | Secret iCal URL. Does **not** block **Save context**. |

Click **Save context**. That marks the operator as yours on this machine.

**Skip for now** keeps the sample pack, labeled as sample.

Career has a later **filters** editor. It is not a second onboarding form. The résumé path is You.

### 2. One goal (required to finish setup)

**Goals** → **+ Add goal**, or **Paste JSON pack**.

Until there is at least one goal, Today has nothing real to plan against.

### 3. Optional: calendar, then a model key

Connect calendar on You (or Today → Calendar controls). Add `DEEPSEEK_API_KEY` to `.dev.vars` when you want live ranking and drafts. Restart `npm run dev` after editing `.dev.vars`.

---

## Goals JSON

Paste `{ "goals": [ ... ] }` on **You** (the Goals box points you to Goals) or **Goals → + Add goal → Paste JSON pack**.

**Load example pack** in the app fills five sample outcome goals (career, interviews, AI building, public voice, startup validation). That pack is a **shape**, not your plan. Import it only if you want the walkthrough.

**Copy mine** exports your current goals in the same shape.

### Shape

```json
{
  "goals": [
    {
      "title": "Land a high-agency AI Product role",
      "desiredOutcome": "What good looks like in a paragraph.",
      "successCriteria": "How you will know it is done.",
      "targetDate": "2026-11-30",
      "priority": 5,
      "state": "active",
      "milestones": [
        {
          "title": "Build target-company and role map",
          "completionRule": "Observable done-when.",
          "targetDate": "2026-09-10",
          "weight": 15,
          "completionPercentage": 0,
          "status": "not_started"
        }
      ]
    }
  ]
}
```

| Field | Accepted values |
|---|---|
| Dates | `YYYY-MM-DD` or `DD/MM/YYYY` (`snake_case` aliases like `target_date` also work) |
| Priority | `1`–`5`, or `High` / `Medium` / `Low` |
| Goal `state` | `active`, `paused`, `completed`, `archived` |
| Milestone `status` | `not_started`, `ready`, `active`, `blocked`, `achieved`, `skipped` |
| Milestone `weight` | Number or percent (`15` or `15%`), clamped 1–100 |

**Replace all existing goals** is a checkbox on import. Sample goals are replaced on import anyway. On a personal workspace, leave it unchecked to merge (duplicates are skipped).

---

## Optional calendar

Read-only Google Calendar:

1. Google Calendar → **Settings** → the calendar → **Integrate calendar**
2. Copy **Secret address in iCal format** (not the public HTML link)
3. Paste on **You**, or **Today → Calendar controls**, or set `GOOGLE_CALENDAR_ICS_URL` in `.dev.vars`

External events stay read-only. Operator-proposed blocks land locally. Google **writes remain queued** — this app does not create events on Google.

---

## Optional model key

Edit `.dev.vars` (created by `npm run setup`):

```
DEEPSEEK_API_KEY=sk-...
```

Get a key at [platform.deepseek.com](https://platform.deepseek.com). Restart the dev server after saving.

| Flag in `lib/operator/models.ts` | Default | Meaning |
|---|---|---|
| `DEEPSEEK_LIVE` | `true` | DeepSeek is the live provider when a key exists. |
| `OPENAI_LIVE` | `false` | OpenAI is paused in code even if `OPENAI_API_KEY` is set. |

Without a key: Today still plans deterministically, Career still scores from résumé overlap, Learning still collects RSS, Startup Lab still has field guidance and a local challenge. Live colour (why-apply prose, thesis **Save & check**, **Challenge this**, content drafts, council) waits for DeepSeek.

Pause DeepSeek without deleting the key: set `DEEPSEEK_LIVE` to `false`.

---

## Optional job-search keys

**Collect roles** on Career works **without** keys. It uses public JSON:

- Remotive, Jobicy, Arbeitnow, The Muse (keyless)
- Company boards: Greenhouse, Lever, Ashby, SmartRecruiters (you type the board slug)
- **Paste URL** — LinkedIn `/jobs/view/…` or any https job link. The URL string is parsed. The page is **not** fetched.

Optional keys in `.dev.vars` (see `.dev.vars.example`):

| Variable | What it adds |
|---|---|
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | Adzuna search. Register at [developer.adzuna.com](https://developer.adzuna.com). |
| `ADZUNA_COUNTRY` | Override (`us`, `gb`, `in`, `de`, `au`, `ca`) when locations on You are ambiguous. |
| `THE_MUSE_API_KEY` | Optional. Muse is already keyless; a key only raises the hourly cap. |
| `INDIANAPI_JOBS_KEY` | [India Jobs API](https://indianapi.in/jobs-api). Collect-by-targets prefers an India city from You (Chennai, Bengaluru, …) then other sources. Stores the apply link. Does not fetch the job page. |

Add **target roles on You first**. Collect-by-targets is title-driven; a Greenhouse slug is not required.

LinkedIn stays copy-out / paste-in. There is no scrape, no session cookie, no Chrome automation.

---

## The programs

### Today

Three recommended moves from goals, capacity, and calendar. **Refresh** reloads calendar. **Refresh with model** is the live plan call (cached or deterministic otherwise). Approve calendar time that needs you before treating it as done.

If you still see a **SAMPLE DATA** banner, open You and save your résumé + a real goal.

### Career

Ranked shortlist against the résumé on You. Fit score is deterministic overlap; live “why apply” is optional colour.

- **Collect by targets** — uses You roles + locations.
- **Company board** — paste a Greenhouse/Lever/Ashby/SmartRecruiters token.
- **Paste URL** — creates a Career row from the link (plus optional title/description you type).
- **Match** — ATS-style overlap for one role. Click, not on type.
- Résumé variants / `.tex` download stay local.

Gmail on Career is read-only **if** a mailbox feed exists on this machine. There is no send.

### Learning

Tracks and interests can start from the résumé. **Collect this week** fetches RSS, then ranks a short queue against a minute budget. **Useful** / **Not for me** updates taste. Summarise is a click.

### Startup Lab

Chat is not the product. Stages:

1. **Frame** — what “clear” looks like (YC/PG-shaped: who hurts this week, wedge, insight, why now).
2. **Fill** — wide canvas: idea, problem, users, scale, market, competition, why now, unfair advantage, riskiest assumption, next experiment.
3. **Test** — log conversations with people. Evidence, not vibes.
4. **One-pager** — Copy Markdown / save a Memory note.

**Save & check** runs one validation call. **Challenge this** runs one steelman/objections call. Neither runs while you type.

### Content

Capture an idea → working notes → outline → LinkedIn post or Medium article. Copy the draft out. The operator never publishes.

### Memory and Small Council

Memory is notes you want kept. Council is a structured look-back with accept/reject — not a chatbot.

---

## How live models are spent

Policy: **no live LLM on type**. Click-only.

| You click | What runs |
|---|---|
| Today → **Refresh with model** | Daily plan (or cache / deterministic) |
| Career → match / explain (where offered) | Optional colour after deterministic score |
| Learning → **Collect this week** | RSS fetch; live pick only if a model is ready |
| Learning → summarise on a card | One summarise call |
| Startup Lab → **Save & check** | `startup_validate` |
| Startup Lab → **Challenge this** | `startup_challenge` |
| Content → generate notes / outline / draft | The matching content task |
| Small Council → run retrospective | One council call |

Disabled live tasks (always local): `job_explain` as a standalone ranking path, `voice_parse` as a required parse. See `lib/operator/token-policy.ts` and `lib/operator/models.ts`.

---

## Secrets

Never commit `.dev.vars`. It is gitignored. `.dev.vars.example` is safe to share.

Keys live only on the machine that runs the app. `npm run setup` will not clobber an existing `.dev.vars`.

---

## Checks

```bash
npm test
npm run lint
```

No API key is required for tests.

---

## Reset this machine

On **You**, at the bottom:

| Action | Effect |
|---|---|
| **Clear and start empty** | Wipes résumé, goals, jobs, and sample items on **this laptop**. GitHub is untouched. |
| **Restore sample operator** | Puts the walkthrough pack back. Deletes your current local goals and résumé. |

Neither command pushes anywhere.

---

## Troubleshooting

**`node -v` is below 22.13**  
Install Node 22 LTS, then `npm install` again.

**Port 3000 already in use**  
Stop the other process, or wait — a wedged old `npm run dev` will 500 the page. Restart from a clean terminal in this repo.

**Vite / “Unexpected end of JSON input” overlay on `/`**  
Usually a stuck SSR worker. Stop the dev server and `npm run dev` again. Hard-refresh the browser.

**Collect returns nothing useful**  
Set **target roles** (and ideally locations) on You, then Collect. Company-board collect needs the public board slug, not the company marketing URL.

**LinkedIn job did not appear**  
Paste a `/jobs/view/…` URL (and title if the slug is opaque). The app does not log into LinkedIn.

**Calendar shows stale / not connected**  
You pasted the public HTML link, or the secret iCal URL expired. Google Calendar → Integrate calendar → **secret** iCal address. Re-paste on You or Today.

**Live drafts never run**  
`.dev.vars` has `DEEPSEEK_API_KEY`, `DEEPSEEK_LIVE` is `true`, and you restarted `npm run dev`. OpenAI is off until `OPENAI_LIVE` is flipped in code.

**“Is my data on GitHub?”**  
No. The repo is the app. Your SQLite, `.dev.vars`, and `.wrangler/` stay on the laptop.

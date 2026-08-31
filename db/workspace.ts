import { env } from "cloudflare:workers";

function db() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureWorkspaceSchema() {
  const database = db();
  await database.batch([
    database.prepare("CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, decision TEXT NOT NULL, rationale TEXT NOT NULL, affected TEXT NOT NULL DEFAULT 'General', decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE TABLE IF NOT EXISTS calendar_blocks (id TEXT PRIMARY KEY, title TEXT NOT NULL, goal_id TEXT, milestone_id TEXT, start_at TEXT NOT NULL, end_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'scheduled', ownership TEXT NOT NULL DEFAULT 'operator_created', source TEXT NOT NULL DEFAULT 'local', external_event_id TEXT, event_url TEXT, last_synced_at TEXT)"),
    database.prepare("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, title TEXT NOT NULL, company TEXT NOT NULL, location TEXT NOT NULL, fit_score INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'recommended', source TEXT NOT NULL, next_action TEXT NOT NULL)"),
    database.prepare("CREATE TABLE IF NOT EXISTS learning_tracks (id TEXT PRIMARY KEY, name TEXT NOT NULL, purpose TEXT NOT NULL, weekly_budget_minutes INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'active', position INTEGER NOT NULL)"),
    database.prepare("CREATE TABLE IF NOT EXISTS learning_items (id TEXT PRIMARY KEY, track_id TEXT NOT NULL, title TEXT NOT NULL, source TEXT NOT NULL, item_type TEXT NOT NULL, duration_minutes INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'recommended', relevance TEXT NOT NULL)"),
    database.prepare("CREATE TABLE IF NOT EXISTS startup_ideas (id TEXT PRIMARY KEY, title TEXT NOT NULL, problem TEXT NOT NULL, target_user TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'captured', next_validation TEXT NOT NULL, confidence INTEGER NOT NULL DEFAULT 20, review_date TEXT NOT NULL)"),
    database.prepare("CREATE TABLE IF NOT EXISTS content_ideas (id TEXT PRIMARY KEY, title TEXT NOT NULL, pillar TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idea', score INTEGER NOT NULL, source TEXT NOT NULL, next_action TEXT NOT NULL)"),
    database.prepare("CREATE TABLE IF NOT EXISTS council_roles (id TEXT PRIMARY KEY, label TEXT NOT NULL, role_name TEXT NOT NULL, mission TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', last_run_at TEXT)"),
    database.prepare("CREATE TABLE IF NOT EXISTS council_proposals (id TEXT PRIMARY KEY, role_id TEXT NOT NULL, title TEXT NOT NULL, rationale TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE TABLE IF NOT EXISTS planning_notes (id TEXT PRIMARY KEY, note TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE TABLE IF NOT EXISTS calendar_preferences (id TEXT PRIMARY KEY, policy TEXT NOT NULL DEFAULT 'propose_only', timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', sync_window_days INTEGER NOT NULL DEFAULT 7, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE TABLE IF NOT EXISTS calendar_write_requests (id TEXT PRIMARY KEY, block_id TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'approved_pending', payload_json TEXT NOT NULL, external_event_id TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE TABLE IF NOT EXISTS email_signals (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, category TEXT NOT NULL, subject TEXT NOT NULL, sender TEXT NOT NULL, received_at TEXT NOT NULL, summary TEXT NOT NULL, next_action TEXT NOT NULL, due_at TEXT, status TEXT NOT NULL DEFAULT 'open', message_url TEXT NOT NULL, last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_blocks(start_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_jobs_status_fit ON jobs(status, fit_score)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_learning_track_status ON learning_items(track_id, status)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_content_status_score ON content_ideas(status, score)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_council_proposal_status ON council_proposals(status, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_calendar_writes_status ON calendar_write_requests(status, created_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS idx_email_signals_status_received ON email_signals(status, received_at)"),
  ]);
  const calendarColumns = new Set((await database.prepare("PRAGMA table_info(calendar_blocks)").all<{ name: string }>()).results.map(column => column.name));
  if (!calendarColumns.has("source")) await database.prepare("ALTER TABLE calendar_blocks ADD COLUMN source TEXT NOT NULL DEFAULT 'local'").run();
  if (!calendarColumns.has("external_event_id")) await database.prepare("ALTER TABLE calendar_blocks ADD COLUMN external_event_id TEXT").run();
  if (!calendarColumns.has("event_url")) await database.prepare("ALTER TABLE calendar_blocks ADD COLUMN event_url TEXT").run();
  if (!calendarColumns.has("last_synced_at")) await database.prepare("ALTER TABLE calendar_blocks ADD COLUMN last_synced_at TEXT").run();
}

async function empty(table: string) {
  const allowed = new Set(["decisions", "calendar_blocks", "jobs", "learning_tracks", "learning_items", "startup_ideas", "content_ideas", "council_roles", "connectors"]);
  if (!allowed.has(table)) return false;
  const result = await db().prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
  return (result?.count ?? 0) === 0;
}

export async function seedWorkspace() {
  await ensureWorkspaceSchema();
  const database = db();
  await database.prepare("INSERT OR IGNORE INTO calendar_preferences (id,policy,timezone,sync_window_days) VALUES ('primary','propose_only','Asia/Kolkata',7)").run();
  if (await empty("decisions")) await database.batch([
    database.prepare("INSERT INTO decisions (id,decision,rationale,affected,decided_at) VALUES (?,?,?,?,?)").bind("dec-calendar", "Calendar work should live inside Today", "Scheduling is the execution layer for goals, not a separate destination.", "Today, Goals", "2026-08-31T10:00:00Z"),
    database.prepare("INSERT INTO decisions (id,decision,rationale,affected,decided_at) VALUES (?,?,?,?,?)").bind("dec-linkedin", "LinkedIn discovery is user-triggered and read-only", "The collection session must remain visible, cancellable, and safe.", "Career", "2026-08-31T10:05:00Z"),
  ]);
  if (await empty("calendar_blocks")) await database.batch([
    database.prepare("INSERT INTO calendar_blocks (id,title,goal_id,milestone_id,start_at,end_at,state,ownership,source) VALUES (?,?,?,?,?,?,?,?,?)").bind("cal-external", "Product catch-up", null, null, "2026-08-31T12:00:00+05:30", "2026-08-31T12:45:00+05:30", "scheduled", "external_fixed", "sample"),
    database.prepare("INSERT INTO calendar_blocks (id,title,goal_id,milestone_id,start_at,end_at,state,ownership,source) VALUES (?,?,?,?,?,?,?,?,?)").bind("cal-career", "Review high-fit roles", "goal-career", "ms-pipeline", "2026-08-31T14:00:00+05:30", "2026-08-31T14:45:00+05:30", "scheduled", "operator_created", "sample"),
    database.prepare("INSERT INTO calendar_blocks (id,title,goal_id,milestone_id,start_at,end_at,state,ownership,source) VALUES (?,?,?,?,?,?,?,?,?)").bind("cal-learning", "Agentic AI deep work", "goal-expertise", "ms-foundations", "2026-08-31T16:00:00+05:30", "2026-08-31T17:00:00+05:30", "scheduled", "operator_created", "sample"),
  ]);
  if (await empty("jobs")) await database.batch([
    database.prepare("INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)").bind("job-zamp", "Senior Product Manager, AI", "Zamp", "Bengaluru", 92, "recommended", "Manually added", "Review role and tailor resume"),
    database.prepare("INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)").bind("job-agents", "Product Lead, Agents", "AI Infrastructure Co.", "Remote India", 87, "saved", "Job alert email", "Research team and product surface"),
    database.prepare("INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)").bind("job-platform", "Principal PM, AI Platform", "HealthTech", "Chennai / Hybrid", 79, "applied", "Company careers", "Follow up on 4 September"),
  ]);
  if (await empty("learning_tracks")) await database.batch([
    database.prepare("INSERT INTO learning_tracks VALUES (?,?,?,?,?,?)").bind("track-agentic", "Agentic AI", "Build practical depth in memory, planning, tools, and evaluation.", 180, "active", 0),
    database.prepare("INSERT INTO learning_tracks VALUES (?,?,?,?,?,?)").bind("track-news", "AI news & research", "Stay current on material model, product, and research changes.", 60, "active", 1),
    database.prepare("INSERT INTO learning_tracks VALUES (?,?,?,?,?,?)").bind("track-pm", "Product management", "Strengthen strategy, discovery, execution, and leadership craft.", 90, "active", 2),
    database.prepare("INSERT INTO learning_tracks VALUES (?,?,?,?,?,?)").bind("track-interview", "Interview preparation", "Practice role-specific product, behavioural, and AI fluency.", 120, "active", 3),
  ]);
  if (await empty("learning_items")) await database.batch([
    database.prepare("INSERT INTO learning_items VALUES (?,?,?,?,?,?,?,?)").bind("learn-memory", "track-agentic", "Memory architectures for long-running agents", "Research paper", "Paper", 28, "recommended", "Directly supports the working Operator milestone."),
    database.prepare("INSERT INTO learning_items VALUES (?,?,?,?,?,?,?,?)").bind("learn-evals", "track-agentic", "Evaluating tool-using agents in production", "Engineering blog", "Article", 16, "saved", "Addresses a recurring capability gap in target roles."),
    database.prepare("INSERT INTO learning_items VALUES (?,?,?,?,?,?,?,?)").bind("learn-model", "track-news", "This week in frontier model tooling", "Curated briefing", "Brief", 12, "recommended", "Material changes only; generic announcements removed."),
    database.prepare("INSERT INTO learning_items VALUES (?,?,?,?,?,?,?,?)").bind("learn-story", "track-interview", "Tell the AI Product Operator story", "Operator exercise", "Exercise", 35, "recommended", "Turns the strongest proof point into a concise interview narrative."),
  ]);
  if (await empty("startup_ideas")) await database.batch([
    database.prepare("INSERT INTO startup_ideas VALUES (?,?,?,?,?,?,?,?)").bind("idea-operator", "Personal AI Operator", "Goals, plans, information, and execution are fragmented across tools.", "Ambitious knowledge workers using multiple AI tools", "researching", "Interview five people about trust and calendar autonomy.", 36, "2026-09-07"),
    database.prepare("INSERT INTO startup_ideas VALUES (?,?,?,?,?,?,?,?)").bind("idea-career", "Career signal engine", "Job seekers cannot reliably distinguish high-fit roles from high-volume listings.", "Experienced product and AI candidates", "framing", "Test whether evidence-based fit explanations change application choices.", 20, "2026-09-10"),
  ]);
  if (await empty("content_ideas")) await database.batch([
    database.prepare("INSERT INTO content_ideas VALUES (?,?,?,?,?,?,?)").bind("content-goals", "Why personal AI agents need goals, not task lists", "Agentic products", "recommended", 94, "Operator build notes", "Review the prepared outline"),
    database.prepare("INSERT INTO content_ideas VALUES (?,?,?,?,?,?,?)").bind("content-operator", "The difference between an assistant and an operator", "AI product thinking", "recommended", 89, "Product thesis", "Add one concrete before/after example"),
    database.prepare("INSERT INTO content_ideas VALUES (?,?,?,?,?,?,?)").bind("content-approval", "Approval boundaries are a product decision", "Agent trust", "recommended", 84, "Learning stream", "Choose the strongest framework"),
    database.prepare("INSERT INTO content_ideas VALUES (?,?,?,?,?,?,?)").bind("content-rebuild", "What I learned rebuilding my work AI system for myself", "Building in public", "idea", 78, "Current project", "Capture three lessons after Story 2"),
  ]);
  if (await empty("council_roles")) await database.batch([
    database.prepare("INSERT INTO council_roles VALUES (?,?,?,?,?,?)").bind("tyrion", "Tyrion", "Chief of Staff", "Reconcile goals, milestones, capacity, new signals, and trade-offs into a feasible plan.", "active", null),
    database.prepare("INSERT INTO council_roles VALUES (?,?,?,?,?,?)").bind("samwell", "Samwell", "Content & Communications", "Apply the approved writing standards to content, email, and presentation work.", "active", null),
  ]);
  if (await empty("connectors")) await database.batch([
    database.prepare("INSERT INTO connectors VALUES (?,?,?,?,?)").bind("google-calendar", "Google Calendar", "not_connected", "Using local planning blocks until OAuth is configured.", "2026-08-31T10:00:00Z"),
    database.prepare("INSERT INTO connectors VALUES (?,?,?,?,?)").bind("gmail", "Gmail", "not_connected", "No mailbox is read until the user grants access.", "2026-08-31T10:00:00Z"),
    database.prepare("INSERT INTO connectors VALUES (?,?,?,?,?)").bind("linkedin", "LinkedIn via Chrome", "ready_for_handoff", "A user-triggered Chrome session is required for every collection run.", "2026-08-31T10:00:00Z"),
    database.prepare("INSERT INTO connectors VALUES (?,?,?,?,?)").bind("llm", "AI runtime", "not_connected", "Local rules and seeded results are active; live research requires a model key.", "2026-08-31T10:00:00Z"),
  ]);
}

async function rows(query: string) {
  return (await db().prepare(query).all<Record<string, unknown>>()).results;
}

function tomorrowPlanningWindow() {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(tomorrow);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "01";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  return { startAt: `${date}T10:00:00+05:30`, endAt: `${date}T10:45:00+05:30` };
}

export async function getWorkspace() {
  await seedWorkspace();
  const [decisions, calendar, calendarPreferences, calendarWriteRequests, emailSignals, jobs, tracks, learningItems, startupIdeas, contentIdeas, councilRoles, councilProposals, planningNotes, connectors] = await Promise.all([
    rows("SELECT id,decision,rationale,affected,decided_at FROM decisions ORDER BY decided_at DESC"),
    rows("SELECT id,title,goal_id,milestone_id,start_at,end_at,state,ownership,source,external_event_id,event_url,last_synced_at FROM calendar_blocks ORDER BY start_at"),
    rows("SELECT id,policy,timezone,sync_window_days,updated_at FROM calendar_preferences WHERE id='primary'"),
    rows("SELECT id,block_id,action,status,payload_json,external_event_id,error,created_at,updated_at FROM calendar_write_requests ORDER BY created_at DESC LIMIT 50"),
    rows("SELECT id,thread_id,category,subject,sender,received_at,summary,next_action,due_at,status,message_url,last_synced_at FROM email_signals ORDER BY received_at DESC LIMIT 100"),
    rows("SELECT id,title,company,location,fit_score,status,source,next_action FROM jobs ORDER BY fit_score DESC"),
    rows("SELECT id,name,purpose,weekly_budget_minutes,state,position FROM learning_tracks ORDER BY position"),
    rows("SELECT id,track_id,title,source,item_type,duration_minutes,status,relevance FROM learning_items ORDER BY track_id,title"),
    rows("SELECT id,title,problem,target_user,state,next_validation,confidence,review_date FROM startup_ideas ORDER BY review_date"),
    rows("SELECT id,title,pillar,status,score,source,next_action FROM content_ideas ORDER BY score DESC"),
    rows("SELECT id,label,role_name,mission,status,last_run_at FROM council_roles ORDER BY id DESC"),
    rows("SELECT id,role_id,title,rationale,status,created_at FROM council_proposals ORDER BY created_at DESC"),
    rows("SELECT id,note,result,created_at FROM planning_notes ORDER BY created_at DESC LIMIT 10"),
    rows("SELECT id,name,status,detail,updated_at FROM connectors ORDER BY name"),
  ]);
  return { decisions, calendar, calendarPreferences, calendarWriteRequests, emailSignals, jobs, tracks, learningItems, startupIdeas, contentIdeas, councilRoles, councilProposals, planningNotes, connectors };
}

export async function mutateWorkspace(action: string, data: Record<string, unknown>) {
  await seedWorkspace();
  const database = db();
  if (action === "planning_note") {
    const note = String(data.note ?? "").trim();
    if (!note) throw new Error("Planning note cannot be empty");
    const { startAt, endAt } = tomorrowPlanningWindow();
    const blockId = crypto.randomUUID();
    const result = "Captured the note and proposed a 45-minute focus block for tomorrow at 10:00.";
    await database.batch([
      database.prepare("INSERT INTO planning_notes (id,note,result) VALUES (?,?,?)").bind(crypto.randomUUID(), note, result),
      database.prepare("INSERT INTO calendar_blocks (id,title,goal_id,milestone_id,start_at,end_at,state,ownership,source) VALUES (?,?,?,?,?,?,?,?,?)").bind(blockId, note.slice(0, 72), null, null, startAt, endAt, "proposed", "operator_created", "local"),
    ]);
    return { message: result };
  }
  if (action === "update_calendar_policy") {
    const policy = String(data.policy ?? "");
    const allowed = new Set(["propose_only", "auto_create", "auto_create_and_move_owned"]);
    if (!allowed.has(policy)) throw new Error("Unknown calendar policy");
    await database.prepare("UPDATE calendar_preferences SET policy=?,updated_at=CURRENT_TIMESTAMP WHERE id='primary'").bind(policy).run();
    return { message: policy === "propose_only" ? "Calendar changes now require approval" : policy === "auto_create" ? "New goal blocks can now be added automatically" : "The Operator can add and move only its own goal blocks" };
  }
  if (action === "propose_calendar_block") {
    const title = String(data.title ?? "").trim();
    const startAt = String(data.startAt ?? "");
    const endAt = String(data.endAt ?? "");
    if (!title || !startAt || !endAt || new Date(endAt) <= new Date(startAt)) throw new Error("A title and valid start/end time are required");
    const preference = await database.prepare("SELECT policy FROM calendar_preferences WHERE id='primary'").first<{ policy: string }>();
    const blockId = crypto.randomUUID();
    const automatic = preference?.policy !== "propose_only";
    const state = automatic ? "approved_pending" : "proposed";
    const statements = [database.prepare("INSERT INTO calendar_blocks (id,title,goal_id,milestone_id,start_at,end_at,state,ownership,source) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(blockId, title, String(data.goalId ?? "") || null, String(data.milestoneId ?? "") || null, startAt, endAt, state, "operator_created", "local")];
    if (automatic) statements.push(database.prepare("INSERT INTO calendar_write_requests (id,block_id,action,status,payload_json) VALUES (?,?,?,?,?)")
      .bind(crypto.randomUUID(), blockId, "create", "approved_pending", JSON.stringify({ title, startAt, endAt, timezone: "Asia/Kolkata", description: `[AI Operator] Goal focus block · ${blockId}` })));
    await database.batch(statements);
    return { message: automatic ? "Goal block approved automatically and queued for Google Calendar" : "Goal block proposed for your approval" };
  }
  if (action === "review_calendar_block") {
    const id = String(data.id ?? "");
    const decision = String(data.decision ?? "");
    const block = await database.prepare("SELECT id,title,start_at,end_at,state,ownership FROM calendar_blocks WHERE id=?").bind(id).first<{ id: string; title: string; start_at: string; end_at: string; state: string; ownership: string }>();
    if (!block || block.ownership !== "operator_created" || block.state !== "proposed") throw new Error("Only proposed Operator blocks can be reviewed");
    if (decision === "dismiss") {
      await database.prepare("UPDATE calendar_blocks SET state='dismissed' WHERE id=?").bind(id).run();
      return { message: "Calendar proposal dismissed" };
    }
    if (decision !== "approve") throw new Error("Unknown calendar decision");
    const payload = { title: block.title, startAt: block.start_at, endAt: block.end_at, timezone: "Asia/Kolkata", description: `[AI Operator] Goal focus block · ${block.id}` };
    await database.batch([
      database.prepare("UPDATE calendar_blocks SET state='approved_pending' WHERE id=?").bind(id),
      database.prepare("INSERT INTO calendar_write_requests (id,block_id,action,status,payload_json) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), id, "create", "approved_pending", JSON.stringify(payload)),
    ]);
    return { message: "Approved — the block is queued for Google Calendar" };
  }
  if (action === "reschedule_calendar_block") {
    const id = String(data.id ?? "");
    const startAt = String(data.startAt ?? "");
    const endAt = String(data.endAt ?? "");
    const preference = await database.prepare("SELECT policy FROM calendar_preferences WHERE id='primary'").first<{ policy: string }>();
    const block = await database.prepare("SELECT id,title,ownership,external_event_id FROM calendar_blocks WHERE id=?").bind(id).first<{ id: string; title: string; ownership: string; external_event_id: string | null }>();
    if (preference?.policy !== "auto_create_and_move_owned") throw new Error("Enable automatic movement of Operator-owned blocks first");
    if (!block || block.ownership !== "operator_created" || !block.external_event_id) throw new Error("Only existing Operator-created events can be moved");
    if (!startAt || !endAt || new Date(endAt) <= new Date(startAt)) throw new Error("A valid start and end time are required");
    await database.batch([
      database.prepare("UPDATE calendar_blocks SET start_at=?,end_at=?,state='approved_pending' WHERE id=?").bind(startAt, endAt, id),
      database.prepare("INSERT INTO calendar_write_requests (id,block_id,action,status,payload_json,external_event_id) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), id, "update", "approved_pending", JSON.stringify({ title: block.title, startAt, endAt, timezone: "Asia/Kolkata" }), block.external_event_id),
    ]);
    return { message: "Operator-owned block queued for rescheduling" };
  }
  if (action === "sync_calendar") {
    const events = Array.isArray(data.events) ? data.events.slice(0, 200) as Record<string, unknown>[] : [];
    const account = String(data.account ?? "Connected Google account");
    const syncedAt = new Date().toISOString();
    const syncStart = String(data.syncStart ?? events[0]?.startAt ?? syncedAt);
    const syncEnd = String(data.syncEnd ?? events.at(-1)?.endAt ?? syncedAt);
    const existing = await database.prepare("SELECT id,external_event_id,ownership FROM calendar_blocks WHERE source='google_calendar' AND start_at>=? AND start_at<?").bind(syncStart, syncEnd).all<{ id: string; external_event_id: string; ownership: string }>();
    const existingByExternalId = new Map(existing.results.map(item => [item.external_event_id, item]));
    const activeIds = new Set(events.map(event => String(event.id ?? "")));
    const statements = events.map(event => {
      const externalId = String(event.id ?? "").trim();
      const title = String(event.title ?? "Untitled event").trim();
      const startAt = String(event.startAt ?? "");
      const endAt = String(event.endAt ?? "");
      if (!externalId || !startAt || !endAt) throw new Error("Calendar events require an id, start, and end");
      const previous = existingByExternalId.get(externalId);
      const ownership = previous?.ownership === "operator_created" ? "operator_created" : event.ownership === "external_fixed" ? "external_fixed" : event.ownership === "operator_created" ? "operator_created" : "calendar_owned";
      const blockId = previous?.id ?? `gcal:${externalId}`;
      return database.prepare("INSERT OR REPLACE INTO calendar_blocks (id,title,goal_id,milestone_id,start_at,end_at,state,ownership,source,external_event_id,event_url,last_synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(blockId, title, null, null, startAt, endAt, "synced", ownership, "google_calendar", externalId, String(event.url ?? ""), syncedAt);
    });
    for (const item of existing.results) if (item.external_event_id && !activeIds.has(item.external_event_id)) statements.push(database.prepare("DELETE FROM calendar_blocks WHERE id=? AND ownership!='operator_created'").bind(item.id));
    await database.prepare("DELETE FROM calendar_blocks WHERE source='sample' OR id LIKE 'cal-%'").run();
    if (statements.length) await database.batch(statements);
    await database.prepare("UPDATE connectors SET status='connected',detail=?,updated_at=? WHERE id='google-calendar'")
      .bind(`${account} · ${events.length} events synced · refreshes automatically`, syncedAt).run();
    return { message: `Google Calendar refreshed — ${events.length} events synced` };
  }
  if (action === "request_calendar_sync") {
    await database.prepare("UPDATE connectors SET status='sync_requested',detail='A refresh has been requested and will run with the calendar worker.',updated_at=CURRENT_TIMESTAMP WHERE id='google-calendar'").run();
    return { message: "Calendar refresh requested" };
  }
  if (action === "complete_calendar_write") {
    const requestId = String(data.requestId ?? "");
    const externalEventId = String(data.externalEventId ?? "");
    const eventUrl = String(data.eventUrl ?? "");
    const request = await database.prepare("SELECT block_id FROM calendar_write_requests WHERE id=? AND status='approved_pending'").bind(requestId).first<{ block_id: string }>();
    if (!request || !externalEventId) throw new Error("Approved calendar request not found");
    await database.batch([
      database.prepare("UPDATE calendar_write_requests SET status='completed',external_event_id=?,error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(externalEventId, requestId),
      database.prepare("UPDATE calendar_blocks SET state='synced',source='google_calendar',external_event_id=?,event_url=?,last_synced_at=CURRENT_TIMESTAMP WHERE id=?").bind(externalEventId, eventUrl, request.block_id),
    ]);
    return { message: "Google Calendar write completed" };
  }
  if (action === "fail_calendar_write") {
    const requestId = String(data.requestId ?? "");
    const error = String(data.error ?? "Calendar write failed").slice(0, 500);
    const request = await database.prepare("SELECT block_id FROM calendar_write_requests WHERE id=?").bind(requestId).first<{ block_id: string }>();
    if (!request) throw new Error("Calendar request not found");
    await database.batch([
      database.prepare("UPDATE calendar_write_requests SET status='failed',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(error, requestId),
      database.prepare("UPDATE calendar_blocks SET state='write_failed' WHERE id=?").bind(request.block_id),
    ]);
    return { message: "Calendar write failure recorded" };
  }
  if (action === "sync_email_signals") {
    const signals = Array.isArray(data.signals) ? data.signals.slice(0, 200) as Record<string, unknown>[] : [];
    const account = String(data.account ?? "Connected Gmail account");
    const syncedAt = new Date().toISOString();
    const statements = signals.map(signal => {
      const id = String(signal.id ?? "").trim();
      const threadId = String(signal.threadId ?? id).trim();
      const subject = String(signal.subject ?? "Untitled email").trim();
      if (!id || !threadId || !subject) throw new Error("Email signals require an id, thread, and subject");
      return database.prepare("INSERT INTO email_signals (id,thread_id,category,subject,sender,received_at,summary,next_action,due_at,status,message_url,last_synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET thread_id=excluded.thread_id,category=excluded.category,subject=excluded.subject,sender=excluded.sender,received_at=excluded.received_at,summary=excluded.summary,next_action=excluded.next_action,due_at=excluded.due_at,message_url=excluded.message_url,last_synced_at=excluded.last_synced_at")
        .bind(id, threadId, String(signal.category ?? "other"), subject, String(signal.sender ?? "Unknown sender"), String(signal.receivedAt ?? syncedAt), String(signal.summary ?? ""), String(signal.nextAction ?? "Review"), signal.dueAt ? String(signal.dueAt) : null, "open", String(signal.messageUrl ?? ""), syncedAt);
    });
    if (statements.length) await database.batch(statements);
    await database.prepare("UPDATE connectors SET status='connected',detail=?,updated_at=? WHERE id='gmail'").bind(`${account} · read-only · ${signals.length} career signals synced`, syncedAt).run();
    return { message: `Gmail connected — ${signals.length} career signals synced` };
  }
  if (action === "update_email_signal") {
    const status = String(data.status ?? "");
    if (!new Set(["open", "handled", "dismissed"]).has(status)) throw new Error("Unknown email signal status");
    await database.prepare("UPDATE email_signals SET status=? WHERE id=?").bind(status, String(data.id ?? "")).run();
    return { message: status === "handled" ? "Email action marked handled" : status === "dismissed" ? "Email signal dismissed" : "Email signal reopened" };
  }
  if (action === "request_gmail_sync") {
    await database.prepare("UPDATE connectors SET status='sync_requested',detail='A read-only Gmail refresh has been requested.',updated_at=CURRENT_TIMESTAMP WHERE id='gmail'").run();
    return { message: "Gmail refresh requested" };
  }
  if (action === "update_job") {
    await database.prepare("UPDATE jobs SET status=?,next_action=? WHERE id=?").bind(String(data.status), String(data.nextAction ?? "Review next action"), String(data.id)).run();
    return { message: "Job board updated" };
  }
  if (action === "request_linkedin") {
    await database.prepare("UPDATE connectors SET status='handoff_requested',detail='Waiting for a visible user-approved Chrome collection session.',updated_at=CURRENT_TIMESTAMP WHERE id='linkedin'").run();
    return { message: "LinkedIn collection request is ready for a Chrome handoff" };
  }
  if (action === "update_learning") {
    await database.prepare("UPDATE learning_items SET status=? WHERE id=?").bind(String(data.status), String(data.id)).run();
    return { message: "Learning queue updated" };
  }
  if (action === "add_startup") {
    const title = String(data.title ?? "").trim();
    if (!title) throw new Error("Idea title is required");
    await database.prepare("INSERT INTO startup_ideas VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), title, String(data.problem ?? "Problem statement needs framing."), String(data.targetUser ?? "Target user needs framing."), "captured", "Confirm the problem, target user, and riskiest assumption.", 10, String(data.reviewDate ?? "2026-09-14")).run();
    return { message: "Idea added" };
  }
  if (action === "update_startup") {
    await database.prepare("UPDATE startup_ideas SET state=? WHERE id=?").bind(String(data.state), String(data.id)).run();
    return { message: "Idea state updated" };
  }
  if (action === "update_content") {
    await database.prepare("UPDATE content_ideas SET status=? WHERE id=?").bind(String(data.status), String(data.id)).run();
    return { message: "Content backlog updated" };
  }
  if (action === "add_decision") {
    const decision = String(data.decision ?? "").trim();
    const rationale = String(data.rationale ?? "").trim();
    if (!decision || !rationale) throw new Error("Decision and rationale are required");
    await database.prepare("INSERT INTO decisions (id,decision,rationale,affected) VALUES (?,?,?,?)").bind(crypto.randomUUID(), decision, rationale, String(data.affected ?? "General")).run();
    return { message: "Decision recorded" };
  }
  if (action === "run_council") {
    const createdAt = new Date().toISOString();
    const existing = await database.prepare("SELECT COUNT(*) AS count FROM council_proposals WHERE status='proposed'").first<{ count: number }>();
    if ((existing?.count ?? 0) > 0) {
      await database.prepare("UPDATE council_roles SET last_run_at=? WHERE id IN ('tyrion','samwell')").bind(createdAt).run();
      return { message: "The current council proposals still need review" };
    }
    await database.batch([
      database.prepare("UPDATE council_roles SET last_run_at=? WHERE id IN ('tyrion','samwell')").bind(createdAt),
      database.prepare("INSERT INTO council_proposals (id,role_id,title,rationale,status,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), "tyrion", "Protect one interview-preparation block this week", "The career milestone is nearer than the content milestone and the calendar has no protected interview block.", "proposed", createdAt),
      database.prepare("INSERT INTO council_proposals (id,role_id,title,rationale,status,created_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), "samwell", "Use the Operator build as this week's primary content thread", "It advances career positioning and the agentic AI expertise goal with one shared artifact.", "proposed", createdAt),
    ]);
    return { message: "Retrospective complete — two proposals need review" };
  }
  if (action === "update_proposal") {
    const status = String(data.status);
    const id = String(data.id);
    const proposal = await database.prepare("SELECT title,rationale FROM council_proposals WHERE id=?").bind(id).first<{ title: string; rationale: string }>();
    await database.prepare("UPDATE council_proposals SET status=? WHERE id=?").bind(status, id).run();
    if (status === "accepted" && proposal) await database.prepare("INSERT INTO decisions (id,decision,rationale,affected) VALUES (?,?,?,?)").bind(crypto.randomUUID(), proposal.title, proposal.rationale, "Small Council").run();
    return { message: status === "accepted" ? "Proposal accepted and recorded as a decision" : "Proposal dismissed" };
  }
  throw new Error("Unknown workspace action");
}

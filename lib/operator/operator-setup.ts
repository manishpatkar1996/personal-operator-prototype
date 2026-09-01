export const WORKSPACE_KIND_KEY = "workspace_kind";
export const ONBOARDED_KEY = "operator_onboarded";

export const DEMO_GOAL_IDS = ["goal-career", "goal-expertise"] as const;
export const DEMO_JOB_IDS = ["job-zamp", "job-agents", "job-platform"] as const;
export const DEMO_CALENDAR_IDS = ["cal-external", "cal-career", "cal-learning"] as const;
export const DEMO_LEARNING_IDS = ["learn-memory", "learn-evals", "learn-model", "learn-story"] as const;
export const DEMO_STARTUP_IDS = ["idea-operator", "idea-career"] as const;
export const DEMO_CONTENT_IDS = ["content-goals", "content-operator", "content-approval", "content-rebuild"] as const;
export const SAMPLE_JOB_SOURCE = "Sample";
export const GENERIC_OPERATOR_TIMEZONE = "Asia/Kolkata";

export function isSampleJobId(id: string) {
  return (DEMO_JOB_IDS as readonly string[]).includes(id);
}

export function isSampleJob(job: { id?: unknown; source?: unknown }) {
  const source = String(job.source ?? "");
  return source.toLowerCase() === "sample" || isSampleJobId(String(job.id ?? ""));
}

export function inferPersonalOperator(input: { resumeChars: number; goalCount: number }) {
  return input.resumeChars > 80 && input.goalCount > 0;
}

export type SetupCheck = {
  id: "resume" | "roles" | "goal" | "place" | "calendar";
  label: string;
  done: boolean;
  required: boolean;
  status: string;
};

export function calendarSetupStatus(connected: boolean) {
  return connected
    ? { label: "Google read is live", detail: "Read-only iCal on this machine. Writes still queue." }
    : { label: "Not connected", detail: "Optional. Paste a secret iCal URL — not the public HTML link. Does not block Save context." };
}

export function setupChecklist(input: {
  resumeChars: number;
  roleCount: number;
  goalCount: number;
  locationCount: number;
  calendarConnected?: boolean;
}): SetupCheck[] {
  const calendarConnected = Boolean(input.calendarConnected);
  const calendar = calendarSetupStatus(calendarConnected);
  return [
    { id: "resume", label: "Résumé", done: input.resumeChars > 80, required: true, status: input.resumeChars > 80 ? "Ready" : "Needed" },
    { id: "roles", label: "Target roles", done: input.roleCount > 0, required: true, status: input.roleCount > 0 ? "Ready" : "Needed" },
    { id: "goal", label: "A live goal", done: input.goalCount > 0, required: true, status: input.goalCount > 0 ? "Ready" : "Needed" },
    { id: "place", label: "Locations", done: input.locationCount > 0, required: false, status: input.locationCount > 0 ? "Ready" : "Needed" },
    { id: "calendar", label: "Calendar", done: calendarConnected, required: false, status: calendar.label },
  ];
}

export function setupComplete(input: { resumeChars: number; roleCount: number; goalCount: number }) {
  return input.resumeChars > 80 && input.roleCount > 0 && input.goalCount > 0;
}

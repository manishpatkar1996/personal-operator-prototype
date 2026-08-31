/** Durable posting craft for Samwell. Platform limits from LinkedIn Help; fold/hashtag numbers are observed, not official. */

export const CONTENT_FORMATS = ["linkedin_post", "medium_article"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export type ContentVoice = {
  name: string;
  role: string;
  beat: string;
  target: string;
  tone: string;
  not: string;
};

export type LinkedInCraft = {
  platformLimitChars: number;
  hookMaxChars: number;
  hookMaxLines: number;
  targetCharsMin: number;
  targetCharsMax: number;
  hashtagsMax: number;
  structure: string[];
  formatsThatWork: string[];
  skipFormats: string[];
  avoid: string[];
  skills: string[];
  ctaStyle: string;
  spacing: string;
};

export type MediumCraft = {
  headlineChars: string;
  subtitle: string;
  lede: string;
  wordsMin: number;
  wordsMax: number;
  subheads: string;
  structure: string[];
  avoid: string[];
  skills: string[];
};

export type ContentTasteEntry = {
  at: string;
  ideaId: string;
  title: string;
  format?: ContentFormat;
  added?: string[];
  removed?: string[];
  note?: string;
};

export const DEFAULT_CONTENT_VOICE: ContentVoice = {
  name: "Manish Patkar",
  role: "Senior PM, athenahealth",
  beat: "data, AI, and agentic products",
  target: "Senior / Lead / Principal PM, AI",
  tone: "Builder/operator: first person, short sentences, one claim with proof. Write like someone shipping, not someone farming the feed.",
  not: "LinkedIn-bro growth-hack, fake vulnerability, engagement bait, carousel-as-text, or motivational platitudes.",
};

export const DEFAULT_LINKEDIN_CRAFT: LinkedInCraft = {
  platformLimitChars: 3_000,
  hookMaxChars: 140,
  hookMaxLines: 2,
  targetCharsMin: 700,
  targetCharsMax: 1_800,
  hashtagsMax: 3,
  structure: [
    "Hook in the first 1–2 lines (≤140 characters) so it survives the mobile See more fold.",
    "One idea. Name it, then prove it with a specific Operator/PM example.",
    "Blank line between ideas. 1–2 sentence paragraphs. Lists only when the items are real steps.",
    "Close with a genuine question or the next experiment — not a like/comment prompt.",
    "Optional 0–3 topical hashtags on the last line. Never a hashtag strategy.",
  ],
  formatsThatWork: [
    "Build-in-public operator note (what shipped, what broke, what stayed human-approved)",
    "One product/AI craft decision with a before/after",
    "A short framework earned from real work, not a numbered listicle",
    "Career-facing craft for Senior/Lead/Principal PM AI, grounded in evidence",
  ],
  skipFormats: [
    "Engagement-bait polls and “comment YES if you agree”",
    "Fake carousels (ASCII slides inside a text post)",
    "Hashtag-stuffed recap dumps",
    "Job-hunt desperation or generic thought-leadership templates",
    "LinkedIn articles as the default — posts first; long-form is Medium",
  ],
  avoid: [
    "I’m excited to announce… / In this post I’ll discuss…",
    "Comment YES / tag 3 people / like if you agree",
    "More than 3 hashtags, or hashtags mid-sentence",
    "Emoji walls, unicode fake-bold for “algorithm”",
    "External-link bait and “link in comments”",
    "Claims without a concrete example from work or the Operator build",
    "AI slop: polished, generic, no point of view",
  ],
  skills: [
    "Write a mobile-safe hook that earns See more",
    "Hold one idea and one proof",
    "Format for a phone: line breaks and white space",
    "Match builder/operator voice; refuse bro templates",
    "Ask a real question or name the next test",
    "Stay inside 3,000 characters; prefer 700–1,800",
  ],
  ctaStyle: "A specific question a Senior/Lead PM could actually answer, or “here’s what I’m trying next.” Never extract a reaction.",
  spacing: "One Enter for a new line; two Enters between ideas. Blank lines count toward the fold — do not burn the hook on empty lines.",
};

export const DEFAULT_MEDIUM_CRAFT: MediumCraft = {
  headlineChars: "50–70 characters; a specific promise, not a tease",
  subtitle: "One sentence that completes the headline. Claim + stakes, not a second headline.",
  lede: "First 2–3 sentences do the work. No “In this article I will.” Put the tension or decision on the table.",
  wordsMin: 800,
  wordsMax: 1_800,
  subheads: "H2 every 300–400 words as a map. Short paragraphs. Pull quotes only if the line is load-bearing.",
  structure: [
    "Headline + subtitle",
    "Lede that earns the next scroll",
    "2–5 H2 sections that argue one thesis",
    "Proof: Operator build, PM decision, or a named tradeoff",
    "Close that earns the length — what changed, what you’d repeat",
  ],
  avoid: [
    "Clickbait or listicle residue from LinkedIn",
    "Feed-style single-sentence line breaks for the whole piece",
    "Padding to hit a word count",
    "Hashtag blocks; Medium uses topics, not feed hashtags",
  ],
  skills: [
    "Headline and subtitle as a contract",
    "Lede without throat-clearing",
    "Subheads and paragraphs, not a LinkedIn post stretched out",
    "Earn 800–1,800 words; stop when the argument is done",
  ],
};

export function parseContentFormat(value: unknown): ContentFormat {
  return value === "medium_article" ? "medium_article" : "linkedin_post";
}

export function formatLabel(format: ContentFormat) {
  return format === "medium_article" ? "Medium article" : "LinkedIn posting";
}

export function parseVoice(value: unknown): ContentVoice {
  if (!value || typeof value !== "object") return { ...DEFAULT_CONTENT_VOICE };
  const row = value as Record<string, unknown>;
  return {
    name: String(row.name ?? DEFAULT_CONTENT_VOICE.name),
    role: String(row.role ?? DEFAULT_CONTENT_VOICE.role),
    beat: String(row.beat ?? DEFAULT_CONTENT_VOICE.beat),
    target: String(row.target ?? DEFAULT_CONTENT_VOICE.target),
    tone: String(row.tone ?? DEFAULT_CONTENT_VOICE.tone),
    not: String(row.not ?? DEFAULT_CONTENT_VOICE.not),
  };
}

export function parseLinkedInCraft(value: unknown): LinkedInCraft {
  if (!value || typeof value !== "object") return { ...DEFAULT_LINKEDIN_CRAFT, structure: [...DEFAULT_LINKEDIN_CRAFT.structure], formatsThatWork: [...DEFAULT_LINKEDIN_CRAFT.formatsThatWork], skipFormats: [...DEFAULT_LINKEDIN_CRAFT.skipFormats], avoid: [...DEFAULT_LINKEDIN_CRAFT.avoid], skills: [...DEFAULT_LINKEDIN_CRAFT.skills] };
  const row = value as Partial<LinkedInCraft>;
  return {
    ...DEFAULT_LINKEDIN_CRAFT,
    ...row,
    platformLimitChars: Number(row.platformLimitChars ?? DEFAULT_LINKEDIN_CRAFT.platformLimitChars),
    hookMaxChars: Number(row.hookMaxChars ?? DEFAULT_LINKEDIN_CRAFT.hookMaxChars),
    hookMaxLines: Number(row.hookMaxLines ?? DEFAULT_LINKEDIN_CRAFT.hookMaxLines),
    targetCharsMin: Number(row.targetCharsMin ?? DEFAULT_LINKEDIN_CRAFT.targetCharsMin),
    targetCharsMax: Number(row.targetCharsMax ?? DEFAULT_LINKEDIN_CRAFT.targetCharsMax),
    hashtagsMax: Number(row.hashtagsMax ?? DEFAULT_LINKEDIN_CRAFT.hashtagsMax),
    structure: Array.isArray(row.structure) ? row.structure.map(String) : [...DEFAULT_LINKEDIN_CRAFT.structure],
    formatsThatWork: Array.isArray(row.formatsThatWork) ? row.formatsThatWork.map(String) : [...DEFAULT_LINKEDIN_CRAFT.formatsThatWork],
    skipFormats: Array.isArray(row.skipFormats) ? row.skipFormats.map(String) : [...DEFAULT_LINKEDIN_CRAFT.skipFormats],
    avoid: Array.isArray(row.avoid) ? row.avoid.map(String) : [...DEFAULT_LINKEDIN_CRAFT.avoid],
    skills: Array.isArray(row.skills) ? row.skills.map(String) : [...DEFAULT_LINKEDIN_CRAFT.skills],
  };
}

export function parseMediumCraft(value: unknown): MediumCraft {
  if (!value || typeof value !== "object") return { ...DEFAULT_MEDIUM_CRAFT, structure: [...DEFAULT_MEDIUM_CRAFT.structure], avoid: [...DEFAULT_MEDIUM_CRAFT.avoid], skills: [...DEFAULT_MEDIUM_CRAFT.skills] };
  const row = value as Partial<MediumCraft>;
  return {
    ...DEFAULT_MEDIUM_CRAFT,
    ...row,
    wordsMin: Number(row.wordsMin ?? DEFAULT_MEDIUM_CRAFT.wordsMin),
    wordsMax: Number(row.wordsMax ?? DEFAULT_MEDIUM_CRAFT.wordsMax),
    structure: Array.isArray(row.structure) ? row.structure.map(String) : [...DEFAULT_MEDIUM_CRAFT.structure],
    avoid: Array.isArray(row.avoid) ? row.avoid.map(String) : [...DEFAULT_MEDIUM_CRAFT.avoid],
    skills: Array.isArray(row.skills) ? row.skills.map(String) : [...DEFAULT_MEDIUM_CRAFT.skills],
  };
}

export function parseTasteLog(value: unknown): ContentTasteEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).map(item => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      at: String(row.at ?? ""),
      ideaId: String(row.ideaId ?? ""),
      title: String(row.title ?? ""),
      format: row.format ? parseContentFormat(row.format) : undefined,
      added: Array.isArray(row.added) ? row.added.map(String) : undefined,
      removed: Array.isArray(row.removed) ? row.removed.map(String) : undefined,
      note: row.note ? String(row.note) : undefined,
    };
  });
}

export function linkedinHook(text: string) {
  const firstBlock = text.replace(/\r\n/g, "\n").split(/\n{2,}/)[0] ?? "";
  return firstBlock.split("\n").slice(0, DEFAULT_LINKEDIN_CRAFT.hookMaxLines).join("\n").trim();
}

export function hookFitsMobileFold(text: string, maxChars = DEFAULT_LINKEDIN_CRAFT.hookMaxChars) {
  return linkedinHook(text).length > 0 && linkedinHook(text).length <= maxChars;
}

export function countHashtags(text: string) {
  return (text.match(/(^|\s)#[A-Za-z0-9_]+/g) ?? []).length;
}

const BAIT = /comment yes|tag 3 people|like if you agree|i'm excited to announce|in this post i('ll| will) discuss|link in comments|agree \?/i;

export function engagementBaitHits(text: string) {
  return BAIT.test(text);
}

function sentences(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n+|(?<=[.!?])\s+/)
    .map(item => item.trim())
    .filter(item => item.length > 12);
}

export function summarizeEditDiff(generated: string, edited: string) {
  const before = new Set(sentences(generated));
  const after = new Set(sentences(edited));
  const added = [...after].filter(item => !before.has(item)).slice(0, 5);
  const removed = [...before].filter(item => !after.has(item)).slice(0, 5);
  return { added, removed };
}

export function appendTasteLog(log: ContentTasteEntry[], entry: ContentTasteEntry, max = 12): ContentTasteEntry[] {
  const compact: ContentTasteEntry = {
    ...entry,
    added: entry.added?.map(item => item.slice(0, 220)).filter(Boolean),
    removed: entry.removed?.map(item => item.slice(0, 220)).filter(Boolean),
    note: entry.note?.trim().slice(0, 400) || undefined,
  };
  if (!compact.added?.length && !compact.removed?.length && !compact.note) return log.slice(0, max);
  return [compact, ...log].slice(0, max);
}

export function formatTasteLogForPrompt(log: ContentTasteEntry[]) {
  if (!log.length) return "No edit taste recorded yet.";
  return log.slice(0, 8).map(entry => {
    const bits = [
      entry.note ? `Note: ${entry.note}` : "",
      entry.added?.length ? `Kept/added: ${entry.added.join(" | ")}` : "",
      entry.removed?.length ? `Cut: ${entry.removed.join(" | ")}` : "",
    ].filter(Boolean);
    return `• ${entry.title}${entry.format ? ` (${formatLabel(entry.format)})` : ""}${bits.length ? ` — ${bits.join("; ")}` : ""}`;
  }).join("\n");
}

export function formatVoiceForPrompt(voice: ContentVoice) {
  return `${voice.name}. ${voice.role}. Beat: ${voice.beat}. Targeting ${voice.target}.\nVoice: ${voice.tone}\nNever: ${voice.not}`;
}

export function formatLinkedInCraftForPrompt(craft: LinkedInCraft) {
  return [
    `LinkedIn posting (first-class). Hard cap ${craft.platformLimitChars} characters (LinkedIn Help). See more fold is observed ~140 characters / ${craft.hookMaxLines} lines on mobile, ~210 on desktop — write the hook for 140.`,
    `Target length ${craft.targetCharsMin}–${craft.targetCharsMax} characters. Do not pad to the cap.`,
    `Structure: ${craft.structure.join(" ")}`,
    `Spacing: ${craft.spacing}`,
    `CTA: ${craft.ctaStyle}`,
    `Hashtags: at most ${craft.hashtagsMax}, last line only, optional.`,
    `Formats that work: ${craft.formatsThatWork.join("; ")}.`,
    `Skip: ${craft.skipFormats.join("; ")}.`,
    `Avoid: ${craft.avoid.join("; ")}.`,
    `Skills: ${craft.skills.join("; ")}.`,
  ].join("\n");
}

export function formatMediumCraftForPrompt(craft: MediumCraft) {
  return [
    `Medium article (second format, distinct from a LinkedIn post). Headline ${craft.headlineChars}. Subtitle: ${craft.subtitle}`,
    `Lede: ${craft.lede}`,
    `Length: ${craft.wordsMin}–${craft.wordsMax} words. ${craft.subheads}`,
    `Structure: ${craft.structure.join(" → ")}.`,
    `Avoid: ${craft.avoid.join("; ")}.`,
    `Skills: ${craft.skills.join("; ")}.`,
  ].join("\n");
}

export function formatStrategyForPrompt(input: {
  thesis: string;
  sourceName: string;
  voice: ContentVoice;
  linkedinCraft: LinkedInCraft;
  mediumCraft: MediumCraft;
  taste: ContentTasteEntry[];
  format?: ContentFormat;
}) {
  const format = input.format ? parseContentFormat(input.format) : undefined;
  const active = format
    ? format === "medium_article"
      ? formatMediumCraftForPrompt(input.mediumCraft)
      : formatLinkedInCraftForPrompt(input.linkedinCraft)
    : `${formatLinkedInCraftForPrompt(input.linkedinCraft)}\n\n${formatMediumCraftForPrompt(input.mediumCraft)}`;
  return [
    `Live content strategy (${input.sourceName || "Working thesis"}):`,
    input.thesis.trim() || "Practical thinking on AI products, agentic workflows, and building with high ownership.",
    "",
    formatVoiceForPrompt(input.voice),
    "",
    "Formats: LinkedIn posting is first-class. Medium article is a separate long-form contract. Never treat them as the same draft.",
    active,
    "",
    "Learned taste from edits and notes (obey this over generic style):",
    formatTasteLogForPrompt(input.taste),
    "",
    "Publishing stays a human copy-out. Never post, scrape LinkedIn, apply, message, or send mail.",
  ].join("\n");
}

export function fallbackNotes(title: string, thesis: string, format: ContentFormat) {
  return [
    `Angle: ${title}`,
    `Why it matters: ${thesis.slice(0, 180) || "Operator/PM craft on AI products and agency."}`,
    "Proof to use: one concrete before/after from the Operator build or a real PM decision. No invented metrics.",
    "Audience: Senior/Lead/Principal PM, AI — builders, not a growth-hack feed.",
    format === "medium_article"
      ? "Form: Medium article — headline + subtitle, lede, H2s, 800–1,800 words."
      : "Form: LinkedIn posting — hook ≤140 characters, one idea, 700–1,800 characters, 0–3 hashtags.",
    "Claims to avoid: engagement bait, “I’m excited to announce,” generic thought-leadership.",
    "Human copy-out only. Samwell does not publish.",
  ].join("\n");
}

export function fallbackOutline(title: string, thesis: string, format: ContentFormat) {
  if (format === "medium_article") {
    return [
      `Headline promise: ${title}`,
      "Subtitle that names the stakes",
      `Lede: the decision or tension (${thesis.slice(0, 100)})`,
      "H2: what I used to do / what broke",
      "H2: the operator rule that replaced it",
      "H2: what I’d repeat vs park",
      "Close: the next honest test",
    ];
  }
  return [
    `Hook (≤140 chars): a specific claim about ${title}`,
    "Name the one idea in plain language",
    `Proof: ${thesis.slice(0, 120) || "one Operator/PM example"}`,
    "What stays human-approved",
    "CTA: a real question or the next experiment",
  ];
}

export function fallbackDraft(title: string, outline: string[], format: ContentFormat, thesis: string) {
  if (format === "medium_article") {
    const sections = outline.slice(3, 6);
    return [
      `# ${title}`,
      "",
      `The Operator is not a task list. ${thesis.slice(0, 140) || "It is a bounded system with goals, proof, and human approval."}`,
      "",
      "Most “personal AI” writing still sells magic. This piece is about the boring product decision underneath: what the system is allowed to do without you.",
      "",
      `## ${sections[0] || "What broke"}`,
      "",
      "When work lives in a chat thread, you get motion and no memory. I rebuilt around goals, a three-item day, and a content desk that cannot publish itself.",
      "",
      `## ${sections[1] || "The rule that replaced it"}`,
      "",
      outline.slice(0, 3).map(item => `${item}.`).join(" "),
      "",
      `## ${sections[2] || "What I’d repeat"}`,
      "",
      "Keep the human on the copy-out. Let the scribe draft. If a claim is not in the strategy or the build, it does not ship.",
      "",
      "This stays a local draft until you copy it to Medium yourself.",
    ].join("\n");
  }
  const hook = title.length <= 140 ? title : title.slice(0, 137).trimEnd() + "…";
  return [
    hook,
    "",
    outline[1] || "One idea: agents need goals, not a longer task list.",
    "",
    outline[2] || `Proof: ${thesis.slice(0, 160)}`,
    "",
    "The Operator will not publish this. You copy it out if it still sounds like you.",
    "",
    outline[4] || "What would you refuse to let an agent do on your behalf this week?",
  ].join("\n");
}

export function adviseOnDraft(draft: string, format: ContentFormat, message: string) {
  const notes: string[] = [];
  if (format === "linkedin_post") {
    const hook = linkedinHook(draft);
    if (!hook) notes.push("There is no hook yet. First 1–2 lines have to earn See more.");
    else if (hook.length > DEFAULT_LINKEDIN_CRAFT.hookMaxChars) notes.push(`Hook is ${hook.length} characters. Cut it to ${DEFAULT_LINKEDIN_CRAFT.hookMaxChars} so it survives mobile.`);
    if (draft.length > DEFAULT_LINKEDIN_CRAFT.platformLimitChars) notes.push(`Over the 3,000 character LinkedIn cap (${draft.length}). Cut, or this belongs on Medium.`);
    if (countHashtags(draft) > DEFAULT_LINKEDIN_CRAFT.hashtagsMax) notes.push("Too many hashtags. Keep 0–3 at the end.");
    if (engagementBaitHits(draft)) notes.push("This reads like engagement bait. Drop YES/tag/like prompts.");
    if (!/\n\n/.test(draft)) notes.push("Add blank lines. A wall of text dies on a phone.");
  } else {
    if (!/^#\s+/m.test(draft)) notes.push("Medium needs a headline (`# …`) and a subtitle under it.");
    const words = draft.trim().split(/\s+/).length;
    if (words < 400) notes.push(`This is still a post (~${words} words). Medium should argue in sections, not feed line-breaks.`);
  }
  const asked = message.trim() || "How should this change?";
  if (!notes.length) notes.push("Craft checks are clean. Change only what the user asked, keep the operator voice, and do not invent publication.");
  return `On “${asked.slice(0, 160)}”:\n${notes.map(item => `• ${item}`).join("\n")}\nI will not post this. Edit in place or ask for a rewrite of a specific passage.`;
}

export type DraftCraftCheck = {
  id: string;
  label: string;
  hint: string;
  pass: boolean | null;
  detail: string;
};

function looksLikeListicle(text: string) {
  const numbered = text.match(/^\s*\d+[.)]\s+\S+/gm) ?? [];
  const bullets = text.match(/^\s*[-*•]\s+\S+/gm) ?? [];
  return numbered.length >= 4 || bullets.length >= 6;
}

function hasLivedProof(text: string) {
  if (!text.trim() || engagementBaitHits(text)) return false;
  const firstPerson = /\b(I|I'm|I’ve|I’d|we|we're|we’re|our)\b/.test(text);
  const specific = /\b(\d{2,}|when I|after we|I shipped|I rebuilt|I cut|for example|Operator|calendar|athenahealth)\b/i.test(text);
  return firstPerson || specific;
}

export function draftLengthLabel(draft: string, format: ContentFormat) {
  if (format === "medium_article") {
    const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
    return `${words.toLocaleString()} words · 800–1,800 typical`;
  }
  return `${draft.length.toLocaleString()} characters · 700–1,800 typical · 3,000 cap`;
}

export function evaluateDraftCraft(draft: string, format: ContentFormat, linkedin = DEFAULT_LINKEDIN_CRAFT): DraftCraftCheck[] {
  const ready = Boolean(draft.trim());
  if (format === "medium_article") {
    const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
    const hasHeadline = /^#\s+\S+/m.test(draft);
    const lede = draft.replace(/^#.*$/m, "").trim().split(/\n\n+/)[0] ?? "";
    const throat = /in this article i('ll| will)|in this post i('ll| will)/i.test(lede);
    const headings = (draft.match(/^##\s+\S+/gm) ?? []).length;
    return [
      {
        id: "headline",
        label: "Headline names the promise",
        hint: "A specific claim, not a tease. Roughly 50–70 characters.",
        pass: ready ? hasHeadline : null,
        detail: ready ? (hasHeadline ? "Headline is on the first # line." : "Add a markdown headline so Medium has a title.") : "Generate the article to check this.",
      },
      {
        id: "lede",
        label: "Opening earns the scroll",
        hint: "First 2–3 sentences put the decision on the table.",
        pass: ready ? Boolean(lede) && !throat && lede.length > 40 : null,
        detail: ready ? (throat ? "Drop “in this article.” Start with the tension." : (lede.length > 40 ? "Opening is on the page." : "The opening is still too thin.")) : "Generate the article to check this.",
      },
      {
        id: "sections",
        label: "Sections argue one thesis",
        hint: "H2s as a map. Stop when the argument is done — 800–1,800 words.",
        pass: ready ? headings >= 2 && words >= 400 : null,
        detail: ready ? `${words} words, ${headings} H2s.` : "Generate the article to check this.",
      },
    ];
  }

  const hook = linkedinHook(draft);
  const listicle = looksLikeListicle(draft);
  const blocks = draft.replace(/\r\n/g, "\n").split(/\n{2,}/).filter(item => item.trim());
  const onePoint = ready && !listicle && draft.length <= linkedin.targetCharsMax && blocks.length >= 2;
  const proof = hasLivedProof(draft);
  return [
    {
      id: "hook",
      label: "First lines before See more",
      hint: `The first 1–2 lines have to earn the tap. Keep them under ${linkedin.hookMaxChars} characters.`,
      pass: ready ? hookFitsMobileFold(draft, linkedin.hookMaxChars) : null,
      detail: ready ? (hook ? `${hook.length} characters in the opening.` : "There is no opening line yet.") : "Generate a posting to check this.",
    },
    {
      id: "one_point",
      label: "One point",
      hint: "Name one claim. Prove it. Don’t stack a listicle.",
      pass: ready ? onePoint : null,
      detail: ready
        ? (listicle
          ? "This reads like a listicle. Cut back to one claim."
          : draft.length > linkedin.targetCharsMax
            ? `${draft.length} characters — long enough that a second idea is probably sneaking in.`
            : blocks.length < 2
              ? "Still a stub. Add the proof, then stop."
              : "Length and shape look like one claim.")
        : "Generate a posting to check this.",
    },
    {
      id: "proof",
      label: "A real example",
      hint: "A specific thing you shipped, broke, or decided — not a generic take.",
      pass: ready ? proof : null,
      detail: ready ? (proof ? "There’s a first-person or concrete example in the draft." : "Add a real before/after from work. Avoid bait.") : "Generate a posting to check this.",
    },
  ];
}

export function contentStatusAfterGenerate(kind: "notes" | "outline" | "draft", current: string) {
  if (kind === "notes") return current === "edited" || current === "drafted" || current === "outlined" ? current : "idea";
  if (kind === "outline") return current === "edited" || current === "drafted" ? current : "outlined";
  return "drafted";
}

export function contentStatusAfterEdit(generated: string, edited: string) {
  if (!edited.trim()) return "idea";
  if (generated.trim() && generated.trim() !== edited.trim()) return "edited";
  return "drafted";
}

const SALES_PHRASE = /\b(quota-carrying|quota carrying|enterprise hunter|enterprise grower)\b/gi;

export type ResumeLatexJob = {
  title: string;
  company: string;
  location?: string;
  fitReason?: string;
};

export type ResumeLatexProfile = {
  resumeText: string;
  strengths?: string[];
  targetRoles?: string[];
};

export function isCompleteLatex(source: string) {
  const text = source.trim();
  return /\\documentclass\b/.test(text) && /\\begin\{document\}/.test(text) && /\\end\{document\}/.test(text);
}

export function resumeTexFilename(company: string, title: string) {
  const parts = [slugPart(company), slugPart(title)].filter(Boolean);
  return `${(parts.join("-") || "resume").slice(0, 80)}.tex`;
}

export function dropQuotaSalesLanguage(text: string) {
  return text.replace(SALES_PHRASE, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
}

export function latexFromModelPayload(payload: unknown) {
  if (typeof payload === "string") return unwrapLatexFence(payload);
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const candidate = record.latex ?? record.variant;
  return typeof candidate === "string" ? unwrapLatexFence(candidate) : "";
}

export function fallbackResumeLatex(job: ResumeLatexJob, profile: ResumeLatexProfile) {
  const source = dropQuotaSalesLanguage(profile.resumeText.trim());
  const banner = [
    `% Tailored locally for ${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""}.`,
    "% Facts are copied from the stored résumé. Review before compiling or sending.",
  ].join("\n");
  if (isCompleteLatex(source)) return `${banner}\n${source}`;

  const strengths = (profile.strengths ?? []).map(item => item.trim()).filter(Boolean).slice(0, 8);
  const roles = (profile.targetRoles ?? []).map(item => item.trim()).filter(Boolean).slice(0, 6);
  const paragraphs = source.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
  const lines = [
    "\\documentclass[11pt]{article}",
    "\\pagestyle{empty}",
    "\\oddsidemargin=0pt",
    "\\evensidemargin=0pt",
    "\\textwidth=6.5in",
    "\\topmargin=-0.5in",
    "\\textheight=9in",
    "\\setlength{\\parskip}{0.45em}",
    "\\setlength{\\parindent}{0pt}",
    "\\begin{document}",
    "\\begin{center}",
    `{\\Large ${texEscape(job.title)}}\\\\[4pt]`,
    `{\\large ${texEscape(job.company)}${job.location ? ` \\textemdash{} ${texEscape(job.location)}` : ""}}`,
    "\\end{center}",
  ];
  if (roles.length) {
    lines.push("", "\\section*{Target roles}", roles.map(item => texEscape(item)).join("; ") + ".");
  }
  if (strengths.length) {
    lines.push("", "\\section*{Strengths}", "\\begin{itemize}");
    for (const item of strengths) lines.push(`  \\item ${texEscape(item)}`);
    lines.push("\\end{itemize}");
  }
  if (job.fitReason?.trim()) {
    lines.push("", "\\section*{Why this posting}", texEscape(job.fitReason.trim()));
  }
  lines.push("", "\\section*{Résumé}");
  if (paragraphs.length) {
    for (const paragraph of paragraphs) lines.push(texEscape(paragraph), "");
  } else {
    lines.push("No stored résumé text was available.");
  }
  lines.push("\\end{document}");
  return `${banner}\n${lines.join("\n")}`;
}

function slugPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function unwrapLatexFence(value: string) {
  const fenced = value.trim().match(/^```(?:latex|tex)?\s*([\s\S]*?)```$/i);
  return (fenced ? fenced[1] : value).trim();
}

function texEscape(value: string) {
  return value
    .replaceAll("\\", "\\textbackslash{}")
    .replaceAll(/[&%$#_{}]/g, "\\$&")
    .replaceAll("~", "\\textasciitilde{}")
    .replaceAll("^", "\\textasciicircum{}");
}

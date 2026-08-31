import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackResumeLatex,
  isCompleteLatex,
  latexFromModelPayload,
  resumeTexFilename,
} from "../lib/operator/resume-latex.ts";
import { DEFAULT_PROMPTS } from "../lib/operator/agents.ts";
import { OPENAI_LIVE } from "../lib/operator/models.ts";

test("resume .tex filename comes from company and role", () => {
  assert.equal(resumeTexFilename("Zamp", "Senior Product Manager, AI"), "zamp-senior-product-manager-ai.tex");
  assert.equal(resumeTexFilename("Café", "Lead PM"), "cafe-lead-pm.tex");
  assert.equal(resumeTexFilename("", ""), "resume.tex");
});

test("complete LaTeX needs a documentclass and document environment", () => {
  assert.equal(isCompleteLatex("Lead with platform work at Zamp."), false);
  const source = fallbackResumeLatex(
    { title: "Senior Product Manager", company: "Zamp", location: "Bengaluru", fitReason: "Platform and AI overlap." },
    {
      resumeText: "Product manager for AI platform teams in Bengaluru.\n\nLed the agent runtime at Northstar.",
      strengths: ["0-to-1 products", "AI strategy"],
      targetRoles: ["Senior Product Manager"],
    },
  );
  assert.equal(isCompleteLatex(source), true);
  assert.match(source, /\\documentclass\[11pt\]\{article\}/);
  assert.match(source, /\\section\*\{Résumé\}/);
  assert.match(source, /Northstar/);
  assert.match(source, /Zamp/);
  assert.doesNotMatch(source, /quota/i);
  assert.doesNotMatch(source, /Acme|invented/i);
});

test("fallback keeps stored LaTeX and does not invent employers", () => {
  const stored = [
    "\\documentclass{article}",
    "\\begin{document}",
    "Manish Patkar\\\\",
    "Northstar -- Product lead for agent tooling.",
    "\\end{document}",
  ].join("\n");
  const variant = fallbackResumeLatex(
    { title: "Product Lead", company: "Zamp" },
    { resumeText: stored },
  );
  assert.match(variant, /Tailored locally for Product Lead at Zamp/);
  assert.match(variant, /Northstar -- Product lead/);
  assert.doesNotMatch(variant, /Salesforce|HubSpot|invent/i);
  assert.equal(isCompleteLatex(variant), true);
});

test("model payload prefers latex and unwraps a fenced document", () => {
  const latex = "\\documentclass{article}\\begin{document}Hello\\end{document}";
  assert.equal(latexFromModelPayload({ latex, variant: "snippet" }), latex);
  assert.equal(latexFromModelPayload({ variant: `\`\`\`latex\n${latex}\n\`\`\`` }), latex);
  assert.equal(latexFromModelPayload({ variant: "Two sentences of overlap." }).includes("\\documentclass"), false);
});

test("Varys résumé contract asks for full LaTeX and OpenAI stays paused", () => {
  assert.equal(OPENAI_LIVE, false);
  const prompt = DEFAULT_PROMPTS.find(item => item.id === "resume_extract")?.systemPrompt ?? "";
  assert.match(prompt, /\{latex:string\}/);
  assert.match(prompt, /documentclass/);
  assert.doesNotMatch(prompt, /\{variant:string\}/);
});

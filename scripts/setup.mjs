import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const example = join(root, ".dev.vars.example");
const dest = join(root, ".dev.vars");

if (!existsSync(example)) {
  console.error("Missing .dev.vars.example — cannot set up local secrets.");
  process.exit(1);
}

if (!existsSync(dest)) {
  copyFileSync(example, dest);
  console.log("Created .dev.vars from .dev.vars.example.");
} else {
  console.log(".dev.vars already exists.");
}

const vars = readFileSync(dest, "utf8");
const deepseek = /^\s*DEEPSEEK_API_KEY\s*=\s*(.+)$/m.exec(vars)?.[1]?.trim() ?? "";
const openai = /^\s*OPENAI_API_KEY\s*=\s*(.+)$/m.exec(vars)?.[1]?.trim() ?? "";

if (!deepseek && !openai) {
  console.log("No model key yet. The app still runs on seeded local data.");
  console.log("To enable live ranking and drafts, add DEEPSEEK_API_KEY to .dev.vars (https://platform.deepseek.com).");
} else if (deepseek) {
  console.log("DeepSeek key is set. Live calls will run when DEEPSEEK_LIVE is true.");
}

console.log("Next: npm run dev  →  http://localhost:3000");
console.log("Then You (Setup) → paste or upload your résumé. Connect Google Calendar there with a secret iCal URL (optional — does not block setup). Sample jobs and goals are a walkthrough pack, not yours.");

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([0-7]{1,3})/g, (_, oct: string) => String.fromCharCode(Number.parseInt(oct, 8)))
    .replace(/\\([()])/g, "$1");
}

function decodeHexString(value: string) {
  const hex = value.replace(/[^0-9a-f]/gi, "");
  if (hex.length < 4) return "";
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.slice(2));
  if (bytes[0] === 0 && bytes.length > 4) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("latin1").decode(bytes);
}

function extractOperators(source: string) {
  const chunks: string[] = [];
  const literal = /\((?:\\.|[^\\)])*\)/g;
  const hex = /<([0-9A-Fa-f \n\r]+)>/g;
  for (const match of source.matchAll(literal)) chunks.push(decodePdfLiteral(match[0].slice(1, -1)));
  for (const match of source.matchAll(hex)) {
    const decoded = decodeHexString(match[1] ?? "");
    if (decoded.trim()) chunks.push(decoded);
  }
  return chunks.join(" ");
}

async function inflate(bytes: Uint8Array) {
  for (const format of ["deflate", "deflate-raw"] as const) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      const buffer = await new Response(stream).arrayBuffer();
      return new Uint8Array(buffer);
    } catch {
      continue;
    }
  }
  return null;
}

function latin1(bytes: Uint8Array) {
  return new TextDecoder("latin1").decode(bytes);
}

function collectText(source: string) {
  return extractOperators(source)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPdfText(bytes: Uint8Array) {
  const raw = latin1(bytes);
  if (!raw.startsWith("%PDF")) throw new Error("That file is not a PDF");
  const parts: string[] = [collectText(raw)];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of raw.matchAll(streamPattern)) {
    const payload = match[1] ?? "";
    const binary = Uint8Array.from(payload, char => char.charCodeAt(0));
    const inflated = await inflate(binary);
    if (inflated) parts.push(collectText(latin1(inflated)));
  }
  const text = parts
    .join("\n")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 1)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length < 80) throw new Error("Could not read enough text from this PDF. Paste the résumé, or upload a .txt / .md file.");
  return text.slice(0, 250_000);
}

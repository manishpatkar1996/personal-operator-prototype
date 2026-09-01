export function composeLiveSystemPrompt(persona: string, contract: string) {
  const voice = persona.trim();
  const schema = contract.trim();
  if (!voice) return schema;
  if (!schema || schema === voice) return voice;
  if (voice.includes(schema)) return voice;
  const unique = schema
    .split("\n")
    .filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !voice.includes(trimmed);
    })
    .join("\n")
    .trim();
  if (!unique) return voice;
  return `${voice}\n\n${unique}`;
}

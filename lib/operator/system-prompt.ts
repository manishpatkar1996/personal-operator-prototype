export function composeLiveSystemPrompt(persona: string, contract: string) {
  const voice = persona.trim();
  const schema = contract.trim();
  if (!voice) return schema;
  if (!schema || schema === voice) return voice;
  return `${voice}\n\n${schema}`;
}

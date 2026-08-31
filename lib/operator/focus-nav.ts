export const PROGRAM_VIEWS = ["Career", "Learning", "Startup Lab", "Content"] as const;
export type ProgramView = (typeof PROGRAM_VIEWS)[number];

export type NavItem<T extends string = string> = { name: T; mark: string; display?: string };

export function isProgramView(value: string): value is ProgramView {
  return (PROGRAM_VIEWS as readonly string[]).includes(value);
}

export function splitFocusPrograms<T extends string>(
  items: NavItem<T>[],
  current: string,
  doors: string[],
): { primary: NavItem<T>[]; secondary: NavItem<T>[] } {
  const keep = new Set(doors.filter(name => items.some(item => item.name === name)));
  if (items.some(item => item.name === current)) keep.add(current as T);
  const primary = items.filter(item => keep.has(item.name));
  const secondary = items.filter(item => !keep.has(item.name));
  return { primary, secondary };
}

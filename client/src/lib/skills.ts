/* skills.ts — pure rules shared by the Skills page, the skill editor and the
   agent editor's Skills tab (M2, specs/M2-skills.md). No React, no fetch [L1]. */
import type { AgentSkillLink, Skill, SkillSource, SkillType } from "@devdigest/shared";
import { SKILL_NAME_MAX, SKILL_NAME_PATTERN } from "@devdigest/shared";

export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Colour per skill type (CSS vars from the design system), as in the mockups. */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

/** Third-party skills: text someone else wrote, now part of the agent's prompt. */
export function isThirdPartySource(source: SkillSource): boolean {
  return source !== "manual" && source !== "extracted";
}

/** Rough client-side token estimate (the server records exact tiktoken counts in traces). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Validation message key for a skill name, or null when it is a valid slug. */
export function skillNameError(name: string): "required" | "tooLong" | "format" | null {
  if (!name.trim()) return "required";
  if (name.length > SKILL_NAME_MAX) return "tooLong";
  return SKILL_NAME_PATTERN.test(name) ? null : "format";
}

/** Case-insensitive search over name, description and type. */
export function filterSkills<T extends Pick<Skill, "name" | "description" | "type">>(
  skills: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.type.includes(q),
  );
}

/** Return a copy of `items` with the element at `from` moved to index `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** A link joined with its library skill (undefined when the skill was deleted). */
export interface AgentSkillRow {
  link: AgentSkillLink;
  skill: Skill | undefined;
}

/** Join an agent's ordered links with the library, keeping link order. */
export function joinAgentSkills(links: AgentSkillLink[], library: Skill[]): AgentSkillRow[] {
  const byId = new Map(library.map((s) => [s.id, s]));
  return links
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((link) => ({ link, skill: byId.get(link.skill_id) }));
}

/** A link reaches the prompt only when it is enabled AND its skill is enabled. */
export function reachesPrompt(row: AgentSkillRow): boolean {
  return row.link.enabled && row.skill?.enabled === true;
}

/** Library skills not yet linked to the agent (the "Attach skill" menu). */
export function unlinkedSkills(links: AgentSkillLink[], library: Skill[]): Skill[] {
  const linked = new Set(links.map((l) => l.skill_id));
  return library.filter((s) => !linked.has(s.id));
}

/** Read a browser File as base64 (no `data:` prefix) for the import preview upload. */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.onload = () => {
      const url = String(reader.result ?? "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

import { describe, it, expect } from "vitest";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import {
  estimateTokens,
  filterSkills,
  isThirdPartySource,
  joinAgentSkills,
  moveItem,
  reachesPrompt,
  skillNameError,
  unlinkedSkills,
} from "./skills";

/** M2 — pure skill rules shared by /skills and the agent Skills tab. */

const skill = (id: string, over: Partial<Skill> = {}): Skill => ({
  id,
  name: `skill-${id}`,
  description: `Use when ${id}.`,
  type: "rubric",
  source: "manual",
  body: "# b",
  enabled: true,
  version: 1,
  agent_count: 0,
  ...over,
});
const link = (skill_id: string, order: number, enabled = true): AgentSkillLink => ({
  agent_id: "a",
  skill_id,
  order,
  enabled,
});

describe("skills helpers", () => {
  it("validates skill slugs", () => {
    expect(skillNameError("")).toBe("required");
    expect(skillNameError("Not Slug")).toBe("format");
    expect(skillNameError("a--b")).toBe("format");
    expect(skillNameError("x".repeat(65))).toBe("tooLong");
    expect(skillNameError("test-coverage-gaps")).toBeNull();
  });

  it("moves items without mutating, ignoring out-of-range moves", () => {
    const src = ["a", "b", "c"];
    expect(moveItem(src, 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(src, 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(src, 0, 5)).toEqual(src);
    expect(src).toEqual(["a", "b", "c"]);
  });

  it("joins links to the library in link order; a link reaches the prompt only if both switches are on", () => {
    const lib = [skill("1"), skill("2", { enabled: false }), skill("3")];
    const rows = joinAgentSkills([link("3", 1), link("1", 0), link("2", 2), link("gone", 3)], lib);
    expect(rows.map((r) => r.link.skill_id)).toEqual(["1", "3", "2", "gone"]);
    expect(rows.map(reachesPrompt)).toEqual([true, true, false, false]);
    expect(reachesPrompt({ link: link("1", 0, false), skill: lib[0] })).toBe(false);
  });

  it("lists library skills not yet linked", () => {
    expect(unlinkedSkills([link("1", 0)], [skill("1"), skill("2")]).map((s) => s.id)).toEqual(["2"]);
  });

  it("filters by name, description or type", () => {
    const lib = [skill("1", { name: "mocking-rules" }), skill("2", { type: "security" })];
    expect(filterSkills(lib, "MOCK").map((s) => s.id)).toEqual(["1"]);
    expect(filterSkills(lib, "security").map((s) => s.id)).toEqual(["2"]);
    expect(filterSkills(lib, " ")).toHaveLength(2);
  });

  it("flags imported/community sources as third-party", () => {
    expect(isThirdPartySource("imported_file")).toBe(true);
    expect(isThirdPartySource("community")).toBe(true);
    expect(isThirdPartySource("manual")).toBe(false);
  });

  it("estimates tokens at ~4 chars each", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
  });
});

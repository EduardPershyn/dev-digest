import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import { SkillsTab } from "./SkillsTab";

/** M2 — attach / enable / reorder; each change sends the full ordered list. */

const skill = (id: string, over: Partial<Skill> = {}): Skill => ({
  id,
  name: `skill-${id}`,
  description: "d",
  type: "rubric",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  agent_count: 1,
  ...over,
});
const LIBRARY = [skill("a"), skill("b", { enabled: false }), skill("c"), skill("d")];
const LINKS: AgentSkillLink[] = [
  { agent_id: "ag", skill_id: "a", order: 0, enabled: true },
  { agent_id: "ag", skill_id: "b", order: 1, enabled: true },
  { agent_id: "ag", skill_id: "c", order: 2, enabled: false },
];
const AGENT = { id: "ag", name: "Test Quality Reviewer" } as Agent;

const mutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useAgentSkills: () => ({ data: LINKS, isLoading: false, isError: false }),
  useSkills: () => ({ data: LIBRARY }),
  useSetAgentSkills: () => ({ mutate, isPending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("agent SkillsTab", () => {
  it("lists linked skills in order and counts only those that reach the prompt", () => {
    renderTab();
    const rows = screen.getAllByTestId("agent-skill-row");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["skill-a", "skill-b", "skill-c"]);
    // a: on; b: link on but skill off globally; c: link off → 1 of 3
    expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument();
    expect(within(rows[1]!).getByText(agentsMessages.skills.disabledGlobally)).toBeInTheDocument();
  });

  it("moving a skill sends the reordered list with each link's state", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Move skill-c up" }));
    expect(mutate).toHaveBeenCalledWith([
      { skill_id: "a", enabled: true },
      { skill_id: "c", enabled: false },
      { skill_id: "b", enabled: true },
    ]);
  });

  it("toggling and detaching send the full list", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "skill-c" }));
    expect(mutate).toHaveBeenLastCalledWith([
      { skill_id: "a", enabled: true },
      { skill_id: "b", enabled: true },
      { skill_id: "c", enabled: true },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Detach skill-a" }));
    expect(mutate).toHaveBeenLastCalledWith([
      { skill_id: "b", enabled: true },
      { skill_id: "c", enabled: false },
    ]);
  });

  it("drag and drop reorders", () => {
    renderTab();
    const rows = screen.getAllByTestId("agent-skill-row");
    fireEvent.dragStart(rows[0]!);
    fireEvent.dragOver(rows[2]!);
    fireEvent.drop(rows[2]!);
    expect(mutate).toHaveBeenCalledWith([
      { skill_id: "b", enabled: true },
      { skill_id: "c", enabled: false },
      { skill_id: "a", enabled: true },
    ]);
  });
});

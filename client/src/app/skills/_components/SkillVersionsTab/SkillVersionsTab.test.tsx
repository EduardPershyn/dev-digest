import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillVersionsTab } from "./SkillVersionsTab";

/** M2 — Versions tab: "Changes" shows a diff against the previous snapshot or any other. */

const VERSIONS: SkillVersion[] = [
  {
    skill_id: "s1",
    version: 2,
    name: "branch-coverage-gaps",
    description: "Use when a PR adds branches.",
    type: "convention",
    body: "# Branch coverage\n- flag untested else\n- flag untested throw",
    created_at: "2026-11-24T11:00:00.000Z",
  },
  {
    skill_id: "s1",
    version: 1,
    name: "branch-coverage-gaps",
    description: "Use when a PR adds branches.",
    type: "rubric",
    body: "# Branch coverage\n- flag untested else",
    created_at: "2026-11-24T10:00:00.000Z",
  },
];

vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

afterEach(cleanup);

const SKILL = { id: "s1", name: "branch-coverage-gaps", version: 2 } as Skill;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillVersionsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

describe("SkillVersionsTab diff", () => {
  it("opens the changes of v2 against v1: changed type and the added body line", () => {
    const { container } = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Show changes in v2" }));
    const region = screen.getByRole("region", { name: "Changes in v2" });
    expect(within(region).getByText("rubric")).toBeInTheDocument();
    expect(within(region).getByText("convention")).toBeInTheDocument();
    const added = container.querySelectorAll('[data-kind="add"]');
    expect(added).toHaveLength(1);
    expect(added[0]).toHaveTextContent("- flag untested throw");
    expect(within(region).getByText("+1")).toBeInTheDocument();
  });

  it("compares v1 with nothing by default, so its whole body is new", () => {
    const { container } = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Show changes in v1" }));
    expect(container.querySelectorAll('[data-kind="add"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-kind="del"]')).toHaveLength(0);
  });

  it("closes the diff on a second click", () => {
    renderTab();
    const btn = screen.getByRole("button", { name: "Show changes in v2" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

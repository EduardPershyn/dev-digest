import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import type { SkillDetail } from "@/lib/hooks/skills";
import { SkillPreviewTab } from "./SkillPreviewTab";

/** M2 — a skill body is text: raw HTML / scripts in it are never rendered as DOM. */

afterEach(cleanup);

const SKILL: SkillDetail = {
  id: "s1",
  name: "evil",
  description: "Use when x.",
  type: "custom",
  source: "imported_file",
  body: '# Title\n\n<script>window.__pwned = true</script>\n\n<img src=x onerror="window.__pwned=true">\n\n- item',
  enabled: false,
  version: 1,
  agent_count: 0,
  agents: [],
  prompt_block: '<skill name="evil" type="custom" source="imported_file" version="1">\n# Title\n</skill>',
};

describe("SkillPreviewTab", () => {
  it("renders Markdown but no raw HTML elements, and shows the exact prompt block", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillPreviewTab skill={SKILL} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    expect(container.querySelector("pre")?.textContent).toBe(SKILL.prompt_block);
  });
});

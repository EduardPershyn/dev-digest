import { describe, it, expect } from "vitest";
import { confidenceColor, confidencePct, evidenceLabel, nextStatus } from "./conventions";

describe("conventions rules", () => {
  it("toggles status: clicking the active one returns to pending", () => {
    expect(nextStatus("pending", "accepted")).toBe("accepted");
    expect(nextStatus("accepted", "accepted")).toBe("pending");
    expect(nextStatus("accepted", "rejected")).toBe("rejected");
    expect(nextStatus("rejected", "rejected")).toBe("pending");
  });

  it("maps confidence to a percent and colour band", () => {
    expect(confidencePct(0.746)).toBe(75);
    expect(confidenceColor(75)).toBe("var(--ok)");
    expect(confidenceColor(50)).toBe("var(--warn)");
    expect(confidenceColor(49)).toBe("var(--text-muted)");
  });

  it("formats the evidence location", () => {
    const base = { evidence_path: "src/a.ts", evidence_start_line: 3, evidence_end_line: 7 };
    expect(evidenceLabel(base)).toBe("src/a.ts:3-7");
    expect(evidenceLabel({ ...base, evidence_end_line: 3 })).toBe("src/a.ts:3");
    expect(evidenceLabel({ ...base, evidence_start_line: null })).toBe("src/a.ts");
  });
});

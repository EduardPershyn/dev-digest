/**
 * RunCostBadge — "—" means NO DATA, never a zero cost; the full variant adds
 * tokens only when the cost is known.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { RunCostBadge } from "./RunCostBadge";
import { formatCost } from "./helpers";

afterEach(cleanup);

function renderBadge(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("formatCost", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    [Number.NaN, "—"],
    [0, "$0.00"],
    [0.0004, "<$0.001"],
    [0.014, "$0.014"],
    [0.0125, "$0.013"],
    [1.274, "$1.27"],
  ])("%s → %s", (usd, expected) => {
    expect(formatCost(usd)).toBe(expected);
  });
});

describe("RunCostBadge", () => {
  it("compact shows the cost only", () => {
    renderBadge(<RunCostBadge costUsd={0.012} tokensIn={8200} tokensOut={1300} />);
    expect(screen.getByText("$0.012")).toBeInTheDocument();
  });

  it("full adds tokens in→out", () => {
    renderBadge(<RunCostBadge variant="full" costUsd={0.014} tokensIn={15000} tokensOut={1200} />);
    expect(screen.getByText("$0.014 · 15k→1.2k")).toBeInTheDocument();
  });

  it("no cost data → '—' only, with no tokens and a 'No cost data' tooltip", () => {
    renderBadge(<RunCostBadge variant="full" costUsd={null} tokensIn={0} tokensOut={0} />);
    const el = screen.getByText("—");
    expect(el.textContent).toBe("—");
    expect(el).toHaveAttribute("title", "No cost data");
  });
});

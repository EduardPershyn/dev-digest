import { describe, it, expect } from "vitest";
import { FEATURE_MODELS as SHARED_FEATURE_MODELS } from "@devdigest/shared";
import { FEATURE_MODELS } from "./feature-models";

/** The client mirrors the shared registry (see the comment in feature-models.ts);
    Vitest can import the shared value, so drift fails here instead of in the UI. */
describe("client FEATURE_MODELS mirror", () => {
  it("equals the shared registry entry for entry", () => {
    expect(FEATURE_MODELS).toEqual(SHARED_FEATURE_MODELS);
  });

  it("defaults the intent classifier to the cheap OpenRouter model (M3)", () => {
    expect(FEATURE_MODELS.find((f) => f.id === "review_intent")).toMatchObject({
      label: "Intent classifier",
      defaultProvider: "openrouter",
      defaultModel: "deepseek/deepseek-v4-flash",
    });
  });
});

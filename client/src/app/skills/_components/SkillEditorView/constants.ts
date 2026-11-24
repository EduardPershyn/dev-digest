import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor; `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: "config" | "preview" | "versions";
  labelKey: string;
  icon: IconName;
}

export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];

/** Left skill-list column width (px), same as the agent editor. */
export const LIST_WIDTH = 280;

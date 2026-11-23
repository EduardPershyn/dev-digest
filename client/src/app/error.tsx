/* Root error boundary (R14) — catches unexpected render errors in any route
   below the root layout, so one failing screen doesn't blank the app. Expected
   failures (API errors, missing repo) are still handled inline by each view.
   Deliberately no AppShell here: if the shell itself threw, re-rendering it
   would throw again. Root-layout errors are caught by global-error.tsx. */
"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  return <ErrorState fullScreen title={t("errorPage.title")} body={t("errorPage.body")} onRetry={reset} />;
}

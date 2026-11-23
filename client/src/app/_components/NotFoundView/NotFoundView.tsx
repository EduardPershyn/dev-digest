/* NotFoundView — body of the root 404: app shell + an empty state that sends
   the user back to the root (which redirects to their first repo). */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";

export function NotFoundView() {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <AppShell crumb={[{ label: t("notFoundPage.breadcrumb") }]}>
      <EmptyState
        icon="Search"
        title={t("notFoundPage.title")}
        body={t("notFoundPage.body")}
        cta={t("notFoundPage.cta")}
        onCta={() => router.push("/")}
      />
    </AppShell>
  );
}

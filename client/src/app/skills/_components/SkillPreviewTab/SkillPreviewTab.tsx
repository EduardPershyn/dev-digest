/* SkillPreviewTab — the body rendered as the reviewing agent receives it, plus
   the exact `<skill>` block it adds to a prompt (rendered by the server with
   the same function the review engine uses). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { SkillDetail } from "@/lib/hooks/skills";
import { estimateTokens } from "@/lib/skills";
import { s } from "./styles";

export function SkillPreviewTab({ skill }: { skill: SkillDetail }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <section>
        <h2 style={s.h2}>{t("editor.preview.title")}</h2>
        <p style={s.sub}>{t("editor.preview.subtitle")}</p>
        <div className="skill-md" style={s.rendered}>
          <Markdown>{skill.body}</Markdown>
        </div>
      </section>
      <section>
        <h3 style={s.h3}>
          {t("editor.preview.blockTitle")}
          <span className="mono" style={s.tokens}>
            {t("editor.config.tokens", { count: estimateTokens(skill.prompt_block) })}
          </span>
        </h3>
        <p style={s.sub}>{t("editor.preview.blockHint")}</p>
        <pre className="mono" style={s.block}>
          {skill.prompt_block}
        </pre>
      </section>
    </div>
  );
}

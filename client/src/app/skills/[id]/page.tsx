import { SkillEditorView } from "../_components/SkillEditorView";

/* Route: /skills/:id (Skill editor, M2). Thin server entry — the view (skill
   list, Config / Preview / Versions tabs, ?tab= state) is a client component. */
export default function SkillEditorPage() {
  return <SkillEditorView />;
}

import { AgentEditorView } from "./_components/AgentEditorView";

/* Route: /agents/:id (Agent Editor). Thin server entry — the view (agent list,
   config editor, ?tab= state) lives in _components/AgentEditorView. */
export default function AgentEditorPage() {
  return <AgentEditorView />;
}

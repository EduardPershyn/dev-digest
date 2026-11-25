import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (M2 Conventions Extractor). Thin server
   entry — extraction, curation and the skill modal live in _components/. */
export default function ConventionsPage() {
  return <ConventionsView />;
}

import { PrDetailView } from "./_components/PrDetailView";

/* Route: /repos/:repoId/pulls/:number (PR detail). Thin server entry — the view
   (header, Overview/Findings/Files tabs in ?tab, run trace drawer in ?trace)
   lives in _components/PrDetailView. */
export default function PRDetailPage() {
  return <PrDetailView />;
}

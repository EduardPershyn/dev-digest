import { PullsListView } from "./_components/PullsListView";

/* Route: /repos/:repoId/pulls (PR list). Thin server entry — the view (filters
   in ?status, search, sort, live-polled list) lives in _components/PullsListView. */
export default function PullsPage() {
  return <PullsListView />;
}

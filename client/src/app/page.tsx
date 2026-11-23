import { HomeView } from "./_components/HomeView";

/* Route: / — thin server entry. The view needs the repo list (client-side
   React Query) to redirect to the first repo's PR list or show onboarding. */
export default function HomePage() {
  return <HomeView />;
}

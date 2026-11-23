import { NotFoundView } from "./_components/NotFoundView";

/* Root 404 (R14) — unknown URLs render inside the app shell with a way back,
   instead of Next's bare default page. */
export default function NotFound() {
  return <NotFoundView />;
}

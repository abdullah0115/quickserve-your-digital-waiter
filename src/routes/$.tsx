// Catch-all route — React Router v6 inside <App /> handles all paths.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$")({
  component: () => null, // Root component already renders <App /> with React Router
});

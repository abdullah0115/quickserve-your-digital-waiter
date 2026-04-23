import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => null, // React Router (in __root) handles all rendering
});

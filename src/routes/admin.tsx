import { createFileRoute } from "@tanstack/react-router";
import { Protected } from "@/components/AppShell";
export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "BluxTrade — admin" }, { name: "description", content: "BluxTrade admin" }, { property: "og:title", content: "BluxTrade — admin" }, { property: "og:description", content: "BluxTrade admin" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (<Protected><div className="mx-auto max-w-3xl p-8 text-muted-foreground">Esta tela ainda está em construção.</div></Protected>),
});

import { createFileRoute } from "@tanstack/react-router";
import { Protected } from "@/components/AppShell";
export const Route = createFileRoute("/trade")({
  head: () => ({ meta: [{ title: "BluxTrade — trade" }, { name: "description", content: "BluxTrade trade" }, { property: "og:title", content: "BluxTrade — trade" }, { property: "og:description", content: "BluxTrade trade" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (<Protected><div className="mx-auto max-w-3xl p-8 text-muted-foreground">Esta tela ainda está em construção.</div></Protected>),
});

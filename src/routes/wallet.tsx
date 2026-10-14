import { createFileRoute } from "@tanstack/react-router";
import { Protected } from "@/components/AppShell";
export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "BluxTrade — wallet" }, { name: "description", content: "BluxTrade wallet" }, { property: "og:title", content: "BluxTrade — wallet" }, { property: "og:description", content: "BluxTrade wallet" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (<Protected><div className="mx-auto max-w-3xl p-8 text-muted-foreground">Esta tela ainda está em construção.</div></Protected>),
});

import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { Memories } from "@/components/app/Memories";

export const metadata: Metadata = {
  title: "Memories · Anghkooey",
  description: "Review and correct what Anghkooey remembers, backed by confirmed Walrus Mainnet records.",
};

export default function MemoriesPage() {
  return (
    <AppShell active="memories">
      <Memories />
    </AppShell>
  );
}

import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { Taste } from "@/components/app/Taste";

export const metadata: Metadata = {
  title: "Taste · Anghkooey",
  description: "Resolve one cultural anchor through live Qloo and inspect real dining candidates.",
};

export default function TastePage() {
  return (
    <AppShell active="taste">
      <Taste />
    </AppShell>
  );
}

import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { Settings } from "@/components/app/Settings";

export const metadata: Metadata = {
  title: "Settings · Anghkooey",
  description: "Memory consent, how Walrus storage works, and this browser session.",
};

export default function SettingsPage() {
  return (
    <AppShell active="settings">
      <Settings />
    </AppShell>
  );
}

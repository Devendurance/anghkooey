import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { Chat } from "@/components/app/Chat";

export const metadata: Metadata = {
  title: "Chat · Anghkooey",
  description: "Talk to Anghkooey, your memory-powered concierge for hotels, travel, and dining.",
};

export default function ChatPage() {
  return (
    <AppShell active="chat">
      <Chat />
    </AppShell>
  );
}

import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { Profile } from "@/components/app/Profile";

export const metadata: Metadata = {
  title: "Profile · Anghkooey",
  description: "Your anonymous browser identity and the Telegram and iMessage chats linked to it.",
};

export default function ProfilePage() {
  return (
    <AppShell active="profile">
      <Profile />
    </AppShell>
  );
}

import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { VerifyTaste } from "@/components/app/VerifyTaste";

export const metadata: Metadata = {
  title: "Verify · TasteProof",
  description: "Verify AI-proposed venues against one combined Qloo Insights request with typed OBSERVED, REVIEW and NOT OBSERVED verdicts.",
};

export default function VerifyPage() {
  return (
    <AppShell active="taste">
      <VerifyTaste />
    </AppShell>
  );
}

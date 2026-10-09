import { NextResponse } from "next/server";
import { envDiagnostics } from "@/server/env";

export async function GET() {
  const env = envDiagnostics();
  const services = {
    db: env.DATABASE_URL === "present" ? "configured" : "missing",
    deepseek: env.DEEPSEEK_API_KEY === "present" ? "configured" : "missing",
    walrus:
      env.MEMWAL_PRIVATE_KEY === "present" && env.MEMWAL_ACCOUNT_ID === "present"
        ? "configured"
        : "missing",
    photon:
      env.PHOTON_PROJECT_ID === "present" ? "slice3-pending" : "missing",
  };
  return NextResponse.json({
    ok: true,
    app: "anghkooey",
    slice: 2,
    api: ["POST /api/session","GET /api/session","DELETE /api/session","POST /api/chat","GET /api/memories","PATCH /api/memories/:id","GET /api/settings","PATCH /api/settings","POST /api/link/start","POST /api/link/confirm","GET /api/health"],
    services,
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash",
    relayer: process.env.MEMWAL_SERVER_URL ?? "https://relayer.memory.walrus.xyz",
  });
}

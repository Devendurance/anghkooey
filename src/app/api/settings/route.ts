import { z } from "zod";
import { checkOrigin, err, ok, readJsonBody, requireSession } from "@/server/api";
import { getConsentAt, setConsent } from "@/server/repo";


const patchSchema = z.object({ consent: z.boolean() });

export async function GET(req: Request) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  try {
    const consentAt = await getConsentAt(auth.session.userId);
    return ok({
      userId: auth.session.userId,
      consent: consentAt !== null,
      consentAt,
      memoryWrites: consentAt !== null ? "enabled" : "disabled",
      note: "Disabling stops future Walrus writes. Existing Walrus blobs follow Walrus expiry semantics; session deletion never deletes Walrus blobs.",
    });
  } catch {
    return err(500, "internal", "Could not read settings");
  }
}

export async function PATCH(req: Request) {
  const originErr = checkOrigin(req);
  if (originErr) return originErr;
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await readJsonBody<unknown>(req);
  if (!body.ok) return body.response;
  const parsed = patchSchema.safeParse(body.value);
  if (!parsed.success) return err(400, "validation_error", "Body must be { consent: boolean }");
  try {
    const consentAt = await setConsent(auth.session.userId, parsed.data.consent);
    return ok({
      userId: auth.session.userId,
      consent: consentAt !== null,
      consentAt,
      memoryWrites: consentAt !== null ? "enabled" : "disabled",
    });
  } catch {
    return err(500, "internal", "Could not update settings");
  }
}

import "dotenv/config";
import { diagnoseHotelUrl } from "../src/server/hotel-contacts";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error(JSON.stringify({ ok: false, error: "usage: diagnose:hotel <https-url>" }));
    process.exit(2);
  }
  try {
    const result = await diagnoseHotelUrl(url);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) }));
    process.exit(1);
  }
}

main();

import { Landing } from "@/components/landing/Landing";
import { COPYRIGHT_YEAR } from "@/lib/site";

export default function Home() {
  return (
    <>
      <Landing />
      <footer className="relative border-t border-hairline px-5 py-16 sm:px-10 sm:py-24">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <p className="font-display text-[32px] leading-[38px] text-cream sm:text-[40px] sm:leading-[46px]">
            Anghkooey means remember.
          </p>
          <p className="t-caption">&copy; {COPYRIGHT_YEAR} Anghkooey. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}

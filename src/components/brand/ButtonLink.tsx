import Link from "next/link";
import type { ReactNode } from "react";

type Variant = "primary" | "glass" | "quiet";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-ui font-medium tracking-[0.02em] whitespace-nowrap transition-[box-shadow,transform,border-color,background-color] duration-200 ease-out-soft active:scale-[0.98]";

const variants: Record<Variant, string> = {
  primary:
    "h-12 px-7 text-sm bg-cream text-night hover:shadow-[0_0_32px_rgba(255,233,194,0.35)]",
  glass:
    "h-12 px-7 text-sm bg-glass border border-glass-border text-cream hover:border-hairline-strong hover:shadow-[0_0_24px_rgba(216,220,255,0.18)]",
  quiet: "h-10 px-5 text-[13px] bg-cream/10 text-cream hover:bg-cream/15",
};

type Props = {
  href: string;
  children: ReactNode;
  variant?: Variant;
  external?: boolean;
  className?: string;
  srHint?: string;
};

export function ButtonLink({ href, children, variant = "primary", external, className = "", srHint }: Props) {
  const cls = `${base} ${variants[variant]} ${className}`;
  const content = (
    <>
      {children}
      {srHint ? <span className="sr-only"> ({srHint})</span> : null}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {content}
    </Link>
  );
}

import Image from "next/image";
import { BRAND_ASSETS } from "@/lib/site";

type Props = {
  className?: string;
  alt?: string;
  eager?: boolean;
};

/** The official folded-A mark. Rendered from the supplied artwork, never redrawn. */
export function FoldedA({ className, alt = "", eager }: Props) {
  const { src, width, height } = BRAND_ASSETS.foldedA;
  return (
    <Image
      src={src}
      width={width}
      height={height}
      alt={alt}
      loading={eager ? "eager" : undefined}
      fetchPriority={eager ? "high" : undefined}
      unoptimized
      draggable={false}
      // A failed asset disappears rather than showing a broken-image glyph.
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
      className={className}
    />
  );
}

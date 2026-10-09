"use client";

import Image from "next/image";
import { useState } from "react";
import { BRAND_ASSETS } from "@/lib/site";

type Props = {
  className?: string;
  alt?: string;
  eager?: boolean;
};

/** Official Icy Periwinkle wordmark. Falls back to live Cormorant text if the asset fails. */
export function Wordmark({ className = "", alt = "", eager }: Props) {
  const [failed, setFailed] = useState(false);
  const { src, width, height } = BRAND_ASSETS.wordmark;

  if (failed) {
    return (
      <span
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={`flex h-full w-full items-center justify-center font-display font-medium leading-none tracking-[0.04em] text-brand [container-type:inline-size] ${className}`}
      >
        <span className="text-[14.5cqw]">ANGHKOOEY</span>
      </span>
    );
  }

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
      onError={() => setFailed(true)}
      className={`h-auto w-full select-none ${className}`}
    />
  );
}

import type { Ref } from "react";

/*
 * Almond aperture drawn in a 100x100 viewBox stretched to the viewport.
 * a = half width, b = apex height (both in viewBox units). b = 0 is a closed seam.
 */
export const APERTURE_OPEN = { a: 118, b: 96 } as const;
export const APERTURE_CLOSED = { a: 0, b: 0 } as const;

function almond(a: number, b: number) {
  const l = 50 - a;
  const r = 50 + a;
  return `M${l} 50Q50 ${50 - 2 * b} ${r} 50Q50 ${50 + 2 * b} ${l} 50Z`;
}

function fillPath(a: number, b: number) {
  return `M-1 -1H101V101H-1Z${a > 0 ? almond(a, b) : ""}`;
}

export function drawAperture(svg: SVGSVGElement | null, a: number, b: number) {
  if (!svg) return;
  const fill = svg.querySelector<SVGPathElement>("[data-ap-fill]");
  const edge = almond(a, b);
  fill?.setAttribute("d", fillPath(a, b));
  svg.querySelectorAll<SVGPathElement>("[data-ap-edge]").forEach((p) => p.setAttribute("d", edge));
}

type Props = {
  className?: string;
  fill: string;
  initial: "open" | "closed";
  ref?: Ref<SVGSVGElement>;
} & Record<`data-${string}`, string | boolean>;

export function Aperture({ className, fill, initial, ref, ...data }: Props) {
  const { a, b } = initial === "open" ? APERTURE_OPEN : APERTURE_CLOSED;
  return (
    <svg
      ref={ref}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
      className={className}
      {...data}
    >
      <path data-ap-fill fill={fill} fillRule="evenodd" d={fillPath(a, b)} />
      <path
        data-ap-edge
        data-ap-glow
        fill="none"
        stroke="#4F5CFF"
        strokeOpacity={0.45}
        strokeWidth={7}
        vectorEffect="non-scaling-stroke"
        opacity={0}
        d={almond(a, b)}
      />
      <path
        data-ap-edge
        data-ap-seam
        fill="none"
        stroke="#D8DCFF"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        opacity={0}
        d={almond(a, b)}
      />
    </svg>
  );
}

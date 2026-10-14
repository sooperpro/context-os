import { cn } from "cn";
import type { SVGProps } from "react";

/**
 * M3 Expressive shape library, ported from the prototype's polar radius functions.
 * Renders an SVG filled with currentColor: size it with `size-*`, color it with `text-*`.
 * Use for avatars, milestones, brand art and the morphing loader; never for status (color alone).
 */
type RadiusFn = (theta: number) => number;

const TAU = Math.PI * 2;
const SAMPLES = 180;

const SHAPES = {
  circle: () => 1,
  cookie4: (t) => 1 + 0.1 * Math.cos(4 * t),
  cookie6: (t) => 1 + 0.075 * Math.cos(6 * t),
  cookie7: (t) => 1 + 0.07 * Math.cos(7 * t),
  cookie9: (t) => 1 + 0.06 * Math.cos(9 * t),
  cookie12: (t) => 1 + 0.045 * Math.cos(12 * t),
  clover4: (t) => 1 + 0.2 * Math.abs(Math.cos(2 * t)) ** 0.85 - 0.12,
  clover8: (t) => 1 + 0.13 * Math.abs(Math.cos(4 * t)) ** 0.9 - 0.08,
  sunny: (t) => 1 + 0.05 * Math.cos(8 * t),
  flower: (t) => 1 + 0.12 * Math.cos(6 * t),
  softburst: (t) => 1 + 0.035 * Math.cos(10 * t),
  pill: (t) => {
    const b = 0.62;
    const n = 3.2;
    const c = Math.abs(Math.cos(t));
    const s = Math.abs(Math.sin(t));
    return 1 / (c ** n + (s / b) ** n) ** (1 / n);
  },
  pentagon: (t) => {
    const n = 5;
    const k = Math.cos(Math.PI / n);
    const r = k / Math.cos((((t + Math.PI / 2) % (TAU / n)) + TAU / n) % (TAU / n) - Math.PI / n);
    return 0.55 * r + 0.45 * 0.93;
  },
} satisfies Record<string, RadiusFn>;

export type ShapeKind = keyof typeof SHAPES;
export const SHAPE_KINDS = Object.keys(SHAPES) as ShapeKind[];

const pathCache = new Map<ShapeKind, string>();

/** SVG path for a shape in a 100×100 box, normalized so the widest point touches the edge. */
export function shapePath(kind: ShapeKind): string {
  const cached = pathCache.get(kind);
  if (cached) return cached;
  const radius = SHAPES[kind];
  const radii: number[] = [];
  let max = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const value = radius((i / SAMPLES) * TAU);
    radii.push(value);
    if (value > max) max = value;
  }
  let d = "";
  for (let i = 0; i < SAMPLES; i++) {
    const t = (i / SAMPLES) * TAU - Math.PI / 2;
    const r = (radii[i]! / max) * 50;
    d += `${i ? "L" : "M"}${(50 + Math.cos(t) * r).toFixed(3)} ${(50 + Math.sin(t) * r).toFixed(3)}`;
  }
  const path = `${d}Z`;
  pathCache.set(kind, path);
  return path;
}

interface ShapeProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  kind: ShapeKind;
}

function Shape({ kind, className, ...props }: ShapeProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      data-slot="shape"
      data-kind={kind}
      className={cn("block shrink-0 fill-current", className)}
      {...props}
    >
      <path d={shapePath(kind)} />
    </svg>
  );
}

export { Shape };

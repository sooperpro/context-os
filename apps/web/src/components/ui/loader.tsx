import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { useEffect, useRef } from "react";
import { pathFromRadii, shapePath, shapeRadii, type ShapeKind } from "@/components/ui/shape";

/**
 * M3 Expressive loading indicator, ported from the prototype: one shape that morphs through a
 * sequence while rotating, on the AI tone. `contained` puts it on a round container. Use for
 * indeterminate waits that are about content being produced (Context Bot thinking); use Spinner for
 * small inline waits and Progress when the amount of work is known.
 */
const SEQUENCE: ShapeKind[] = ["softburst", "cookie9", "pentagon", "pill", "sunny", "cookie4", "circle"];
const STEP_MS = 650;

const loaderVariants = cva("grid shrink-0 place-items-center", {
  variants: {
    size: { sm: "size-9", default: "size-12" },
    contained: {
      true: "rounded-full bg-ai-container text-on-ai-container",
      false: "text-ai",
    },
  },
  defaultVariants: { size: "default", contained: false },
});

interface LoaderProps extends Omit<React.ComponentProps<"span">, "children">, VariantProps<typeof loaderVariants> {
  /** Announced to assistive technology. */
  label?: string;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Loader({ className, size = "default", contained = false, label = "Loading", ...props }: LoaderProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") return;
    const shapes = SEQUENCE.map(shapeRadii);
    const blend = new Array<number>(shapes[0]!.length);
    const ease = (x: number) => 1 - (1 - x) ** 3;
    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const elapsed = Math.max(0, now - start);
      const index = Math.floor(elapsed / STEP_MS) % shapes.length;
      const from = shapes[index]!;
      const to = shapes[(index + 1) % shapes.length]!;
      const progress = ease(Math.min(1, ((elapsed % STEP_MS) / STEP_MS) * 1.6));
      for (let k = 0; k < blend.length; k++) blend[k] = from[k]! + (to[k]! - from[k]!) * progress;
      pathRef.current?.setAttribute("d", pathFromRadii(blend));
      if (svgRef.current) svgRef.current.style.transform = `rotate(${(elapsed / 4.2) % 360}deg)`;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <span
      role="progressbar"
      aria-label={label}
      data-slot="loader"
      className={cn(loaderVariants({ size, contained }), className)}
      {...props}
    >
      <svg ref={svgRef} viewBox="0 0 100 100" aria-hidden className="size-[70%] overflow-visible fill-current">
        <path ref={pathRef} d={shapePath(SEQUENCE[0]!)} />
      </svg>
    </span>
  );
}

export { Loader, loaderVariants };

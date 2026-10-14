import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SHAPE_KINDS, Shape, shapePath } from "@/components/ui/shape";

describe("Shape", () => {
  it("builds a closed, normalized path for every kind", () => {
    for (const kind of SHAPE_KINDS) {
      const path = shapePath(kind);
      expect(path.startsWith("M")).toBe(true);
      expect(path.endsWith("Z")).toBe(true);
      // Normalized: the widest sample reaches the 100x100 box edge (radius 50 from center).
      const coords = path.slice(1, -1).split(/[ML]/).map((pair) => pair.split(" ").map(Number));
      const maxRadius = Math.max(...coords.map(([x = 50, y = 50]) => Math.hypot(x - 50, y - 50)));
      expect(maxRadius).toBeGreaterThan(49.9);
      expect(maxRadius).toBeLessThanOrEqual(50.01);
    }
  });

  it("renders an svg that fills with the current color", () => {
    const { container } = render(<Shape kind="clover4" className="size-10 text-primary" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("data-kind", "clover4");
    expect(svg?.getAttribute("class")).toContain("fill-current");
  });
});

import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { MaterialIcon } from "@/components/ui/icons";
import { Shape } from "@/components/ui/shape";

export interface MapGroup {
  label: string;
  icon: MaterialIcon;
  items: Array<{ id: string; title: string; subtitle: string; to: string }>;
  /** "+3 more" and where they are. */
  more?: { count: number; to: string };
}

const AREAS = ["[grid-area:g1]", "[grid-area:g2]", "[grid-area:g3]", "[grid-area:g4]"] as const;

/**
 * "How it connects" (prototype `.kmap`): the project in the middle, up to four groups around it,
 * joined by curved lines. On narrow containers the groups stack under the center and the lines go.
 */
export function RelationshipMap({
  center,
  groups,
}: {
  center: { title: string; subtitle: string; icon: MaterialIcon };
  groups: MapGroup[];
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ d: string; width: number; height: number } | null>(null);

  // Lines follow the layout: redraw whenever the map resizes.
  useLayoutEffect(() => {
    const map = mapRef.current;
    const middle = centerRef.current;
    if (!map || !middle) return;
    const draw = () => {
      const box = map.getBoundingClientRect();
      const node = middle.getBoundingClientRect();
      const nodes = [...map.querySelectorAll<HTMLElement>("[data-map-group]")];
      // Stacked layout: the groups sit below the center, so there is nothing to connect.
      if (
        !nodes.length ||
        nodes.every((group) => group.getBoundingClientRect().top > node.bottom)
      ) {
        setLines(null);
        return;
      }
      const cx = node.left + node.width / 2 - box.left;
      const cy = node.top + node.height / 2 - box.top;
      const d = nodes
        .map((group) => {
          const rect = group.getBoundingClientRect();
          const gx =
            (rect.left + rect.width / 2 < node.left + node.width / 2 ? rect.right : rect.left) -
            box.left;
          const gy = rect.top + rect.height / 2 - box.top;
          const mx = (cx + gx) / 2;
          return `M${cx.toFixed(1)} ${cy.toFixed(1)} C${mx.toFixed(1)} ${cy.toFixed(1)} ${mx.toFixed(1)} ${gy.toFixed(1)} ${gx.toFixed(1)} ${gy.toFixed(1)}`;
        })
        .join(" ");
      setLines({ d, width: box.width, height: box.height });
    };
    draw();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(draw);
    observer.observe(map);
    return () => observer.disconnect();
  }, [groups.length]);

  const CenterIcon = center.icon;
  return (
    <div
      ref={mapRef}
      className="relative grid grid-cols-1 gap-2 py-2 [grid-template-areas:'c'_'g1'_'g2'_'g3'_'g4'] @min-[760px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @min-[760px]:items-center @min-[760px]:gap-x-12 @min-[760px]:gap-y-3 @min-[760px]:[grid-template-areas:'g1_._g2'_'._c_.'_'g3_._g4']"
    >
      {lines ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
          viewBox={`0 0 ${lines.width} ${lines.height}`}
        >
          <path
            d={lines.d}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            className="stroke-outline-variant"
          />
        </svg>
      ) : null}
      <div
        ref={centerRef}
        className="relative z-10 flex items-center gap-3 rounded-[28px] bg-ai px-5 py-4 text-on-ai [grid-area:c] @min-[760px]:flex-col @min-[760px]:gap-1 @min-[760px]:text-center"
      >
        <span
          aria-hidden
          className="relative grid size-12 shrink-0 place-items-center text-ai @min-[760px]:mb-1"
        >
          <Shape kind="sunny" className="absolute inset-0 size-full text-on-ai" />
          <span className="relative z-10 grid place-items-center [&_svg]:size-6">
            <CenterIcon />
          </span>
        </span>
        <span className="flex flex-col">
          <b className="font-heading text-base font-medium">{center.title}</b>
          <span className="text-xs">{center.subtitle}</span>
        </span>
      </div>
      {groups.slice(0, 4).map((group, index) => {
        const Icon = group.icon;
        return (
          <section
            key={group.label}
            data-map-group
            aria-label={group.label}
            className={`relative z-10 min-w-0 rounded-[20px] bg-pane p-2.5 shadow-[inset_0_0_0_1px_var(--color-outline-variant)] ${AREAS[index]}`}
          >
            <h3 className="flex items-center gap-1 px-1.5 pt-0.5 pb-2 text-xs font-medium text-on-surface-variant [&_svg]:size-3.5">
              <Icon aria-hidden /> {group.label}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    className="flex flex-col rounded-[10px] px-2 py-1.5 text-on-surface no-underline outline-none hover:bg-ai/10 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="truncate text-sm font-medium">{item.title}</span>
                    <span className="truncate text-xs text-on-surface-variant">
                      {item.subtitle}
                    </span>
                  </Link>
                </li>
              ))}
              {group.more && group.more.count > 0 ? (
                <li>
                  <Link
                    to={group.more.to}
                    className="px-2 text-xs font-medium text-primary hover:underline"
                  >
                    +{group.more.count} more
                  </Link>
                </li>
              ) : null}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

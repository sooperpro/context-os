import { cn } from "cn";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Section({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="mx-auto flex max-w-300 scroll-mt-20 flex-col gap-10 px-4 py-20 medium:px-6"
    >
      <Reveal className="flex max-w-170 flex-col gap-3">
        <span className="text-sm font-medium tracking-wide text-primary uppercase">{kicker}</span>
        <h2
          id={`${id}-title`}
          className="font-heading text-[30px] leading-9 font-[560] text-balance [font-variation-settings:'ROND'_60] medium:text-[38px] medium:leading-[46px]"
        >
          {title}
        </h2>
      </Reveal>
      {children}
    </section>
  );
}

/** Rises into view the first time it scrolls into the window. */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Without an observer (old browsers, tests) everything simply shows.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      data-visible={visible}
      className={cn("landing-reveal", className)}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}

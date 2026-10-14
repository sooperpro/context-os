import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "cn";

/**
 * M3 switch: 52×32 track with an outlined 16px thumb that grows to 24px and fills when checked.
 * `sm` is 40×24 for dense rows.
 */
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full transition-colors duration-[140ms] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-8 data-[size=default]:w-13 data-[size=sm]:h-6 data-[size=sm]:w-10 data-checked:bg-primary data-unchecked:bg-surface-container-highest data-unchecked:shadow-[inset_0_0_0_2px_var(--color-outline)] data-disabled:cursor-not-allowed data-disabled:opacity-38",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full transition-[translate,width,height,background-color] duration-[350ms] ease-spring-fast-spatial group-data-[size=default]/switch:data-unchecked:size-4 group-data-[size=default]/switch:data-unchecked:translate-x-2 group-data-[size=default]/switch:data-checked:size-6 group-data-[size=default]/switch:data-checked:translate-x-6 group-data-[size=sm]/switch:data-unchecked:size-3 group-data-[size=sm]/switch:data-unchecked:translate-x-1.5 group-data-[size=sm]/switch:data-checked:size-4.5 group-data-[size=sm]/switch:data-checked:translate-x-5 data-checked:bg-primary-foreground data-unchecked:bg-outline"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };

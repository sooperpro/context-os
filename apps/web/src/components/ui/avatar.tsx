import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import * as React from "react";
import { PersonIcon } from "@/components/ui/icons";
import { shapePath, type ShapeKind } from "@/components/ui/shape";
import { initialsOf } from "@/lib/format";

/**
 * Avatar: initials on a tonal container, emphasized brand type. Six tones so a directory does not
 * look like one color; pick by hashing the person's id, not by role. `shape` takes a rounded clip
 * (squircle, arch) or one of the prototype's M3 expressive avatar shapes, which identity avatars
 * wear: the account button and menu, profile pages and Settings (`avatarShapeFor`).
 */
const avatarVariants = cva("group/avatar relative flex shrink-0 overflow-hidden select-none", {
  variants: {
    size: {
      xs: "size-6 text-[9px]",
      sm: "size-8 text-xs",
      default: "size-10 text-sm",
      md: "size-12 text-base",
      lg: "size-14 text-xl",
      xl: "size-18 text-2xl",
    },
    tone: {
      primary: "bg-primary-container text-on-primary-container",
      ai: "bg-ai-container text-on-ai-container",
      secondary: "bg-secondary-container text-on-secondary-container",
      warning: "bg-warning-container text-on-warning-container",
      success: "bg-success-container text-on-success-container",
      neutral: "bg-surface-container-highest text-on-surface-variant",
    },
    shape: {
      circle: "rounded-full",
      squircle: "rounded-[30%]",
      arch: "rounded-[50%_50%_16%_16%_/_50%_50%_16%_16%]",
    },
  },
  defaultVariants: { size: "default", tone: "primary", shape: "circle" },
});

const AVATAR_TONES = ["primary", "ai", "secondary", "warning", "success", "neutral"] as const;

/** The prototype's avatar shapes (settings.js `SHAPES`), in its order. */
const AVATAR_SHAPES = [
  "cookie9",
  "cookie6",
  "clover4",
  "sunny",
  "flower",
  "cookie4",
  "clover8",
  "cookie12",
] as const satisfies readonly ShapeKind[];
type AvatarShape = (typeof AVATAR_SHAPES)[number];

function hashId(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

/** Stable tone for an id, so the same person always gets the same color. */
function avatarToneFor(id: string): (typeof AVATAR_TONES)[number] {
  return AVATAR_TONES[hashId(id) % AVATAR_TONES.length] ?? "primary";
}

/** Stable expressive shape for an id, for identity avatars. */
function avatarShapeFor(id: string): AvatarShape {
  return AVATAR_SHAPES[hashId(id) % AVATAR_SHAPES.length] ?? "cookie9";
}

const maskCache = new Map<AvatarShape, string>();

/** The shape as a CSS mask: the prototype clips with an SVG clip path; a mask scales the same way. */
function shapeMask(shape: AvatarShape): string {
  let mask = maskCache.get(shape);
  if (!mask) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${shapePath(shape)}"/></svg>`;
    mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`;
    maskCache.set(shape, mask);
  }
  return mask;
}

function isAvatarShape(shape: string): shape is AvatarShape {
  return AVATAR_SHAPES.some((kind) => kind === shape);
}

function Avatar({
  className,
  size = "default",
  tone = "primary",
  shape = "circle",
  style,
  ...props
}: AvatarPrimitive.Root.Props &
  Omit<VariantProps<typeof avatarVariants>, "shape"> & {
    shape?: "circle" | "squircle" | "arch" | AvatarShape;
  }) {
  const expressive = isAvatarShape(shape) ? shape : null;
  const rounded = isAvatarShape(shape) ? null : shape;
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      data-shape={shape}
      className={cn(avatarVariants({ size, tone, shape: rounded }), className)}
      style={
        expressive
          ? (state) => ({
              ...(typeof style === "function" ? style(state) : style),
              mask: shapeMask(expressive),
            })
          : style
      }
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center font-heading font-semibold tracking-wide",
        className,
      )}
      {...props}
    />
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        "absolute right-0 bottom-0 z-10 inline-flex size-3 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background select-none [&>svg]:size-2",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-card",
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-container-highest text-sm text-on-surface-variant ring-2 ring-card",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A person's avatar: initials on a tone derived from their id, so the same person always looks the
 * same across screens. Use this instead of assembling Avatar + AvatarFallback by hand.
 */
function PersonAvatar({
  person,
  ...props
}: Omit<React.ComponentProps<typeof Avatar>, "tone" | "children"> & {
  person: { id?: string; name: string };
}) {
  return (
    // Decorative: the person's name is always shown next to it.
    <Avatar tone={avatarToneFor(person.id ?? person.name)} aria-hidden {...props}>
      <AvatarFallback>
        {initialsOf(person.name) || <PersonIcon className="size-1/2" />}
      </AvatarFallback>
    </Avatar>
  );
}

export {
  PersonAvatar,
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
  avatarVariants,
  avatarToneFor,
  avatarShapeFor,
  type AvatarShape,
};

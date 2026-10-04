import { cn } from "@/lib/utils";

const HUES = [268, 330, 18, 160, 200, 40, 290, 120, 222, 350, 8, 185];

/** Same id, same color, everywhere. */
export function hueForId(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

export function InitialsAvatar({
  id,
  name,
  imageUrl,
  size = 36,
  className,
}: {
  id: string;
  name: string;
  imageUrl?: string | null;
  size?: number;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  const hue = hueForId(id);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-grid shrink-0 select-none place-items-center rounded-full font-display font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        backgroundColor: `hsl(${hue} 62% 89%)`,
        color: `hsl(${hue} 55% 28%)`,
      }}
    >
      {(name.trim()[0] || "?").toUpperCase()}
    </span>
  );
}

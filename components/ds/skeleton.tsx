import { cn } from "@/lib/utils";

/** Placeholder block for loading states; static for reduced-motion users. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block animate-pulse rounded-md bg-surface-3 motion-reduce:animate-none", className)}
    />
  );
}

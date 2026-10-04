import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/components/ds/initials-avatar";

export function Facepile({
  people,
  max = 5,
  size = 28,
  total,
}: {
  people: { id: string; name: string; imageUrl?: string | null }[];
  max?: number;
  size?: number;
  total?: number;
}) {
  const shown = people.slice(0, max);
  const extra = Math.max(0, (total ?? people.length) - shown.length);
  return (
    <span className="inline-flex items-center">
      <span className="inline-flex">
        {shown.map((p, i) => (
          <span key={p.id} className={cn("rounded-full ring-2 ring-surface", i > 0 && "-ml-2")}>
            <InitialsAvatar id={p.id} name={p.name} imageUrl={p.imageUrl} size={size} />
          </span>
        ))}
      </span>
      {extra > 0 && <span className="ml-1.5 text-[13px] font-semibold tabular-nums text-ink-2">+{extra}</span>}
    </span>
  );
}

"use client";

const STYLES = ["notionists", "personas", "lorelei", "micah"] as const;
const SEEDS = ["Logan Moyon", "Sarah Chen", "Marcus Rivera", "Aisha Patel", "Jordan Kim", "Diego Santos", "Emma Thompson", "Yuki Tanaka"];

function url(style: string, seed: string) {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

export default function AvatarPreviewPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Avatar style comparison</h1>
        <p className="text-gray-600">Same seed rendered in 4 DiceBear styles. Pick the vibe you like — we&apos;ll wire it up next.</p>
      </div>

      <div className="grid grid-cols-[120px_repeat(4,1fr)] gap-4 items-center">
        <div />
        {STYLES.map((s) => (
          <div key={s} className="text-center font-semibold capitalize">{s}</div>
        ))}

        {SEEDS.map((seed) => (
          <div key={seed} className="contents">
            <div className="text-sm text-gray-700 truncate">{seed}</div>
            {STYLES.map((s) => (
              <div key={s} className="flex justify-center">
                <img
                  src={url(s, seed)}
                  alt={`${s} - ${seed}`}
                  className="h-20 w-20 rounded-full bg-gray-100 object-cover"
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="text-sm text-gray-500 pt-4 border-t">
        <p>Notes:</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li><strong>notionists</strong> — clean line drawings, Notion-like</li>
          <li><strong>personas</strong> — flat illustrated people, modern SaaS feel</li>
          <li><strong>lorelei</strong> — soft line art, more delicate</li>
          <li><strong>micah</strong> — friendly flat humans, slightly more playful</li>
        </ul>
      </div>
    </div>
  );
}

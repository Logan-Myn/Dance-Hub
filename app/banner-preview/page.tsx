"use client";

const SAMPLES = [
  { label: "Wide landscape (16:9)", img: "https://picsum.photos/id/1011/1600/900" },
  { label: "Square (1:1)", img: "https://picsum.photos/id/1062/800/800" },
  { label: "Portrait (3:4)", img: "https://picsum.photos/id/1027/600/900" },
];

const BANNER = "https://picsum.photos/id/1015/1600/600";

function OptionOne({ imageUrl }: { imageUrl: string }) {
  return (
    <div className="relative h-56 sm:h-64 md:h-72 overflow-hidden rounded-3xl bg-black">
      <img
        src={imageUrl}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-80"
      />
      <div className="absolute inset-0 bg-black/30" />
      <img
        src={imageUrl}
        alt="Community"
        className="absolute inset-0 w-full h-full object-contain"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6 md:p-8">
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold text-white mb-2 drop-shadow-lg">
          Latin Passion
        </h1>
        <p className="text-white/90 text-sm md:text-base max-w-2xl line-clamp-2">
          Where dancers meet, learn, and grow together.
        </p>
      </div>
    </div>
  );
}

function OptionTwo({ logoUrl }: { logoUrl: string }) {
  return (
    <div className="relative h-56 sm:h-64 md:h-72 overflow-hidden rounded-3xl">
      <img
        src={BANNER}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

      <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6 md:p-8">
        <div className="flex items-end gap-4">
          <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl overflow-hidden border-4 border-white shadow-xl flex-shrink-0 bg-white">
            <img src={logoUrl} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="pb-1 min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-semibold text-white drop-shadow-lg truncate">
              Latin Passion
            </h1>
            <p className="text-white/90 text-sm md:text-base max-w-2xl line-clamp-1">
              Where dancers meet, learn, and grow together.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BannerPreviewPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      <div>
        <h1 className="text-3xl font-bold mb-2">Community banner — design options</h1>
        <p className="text-gray-600">
          Same uploaded image (left column header) rendered in <strong>Option 1</strong> (blurred-backdrop, single image)
          vs <strong>Option 2</strong> (separate wide banner + logo overlay). Three rows = three real-world aspect ratios users upload.
        </p>
      </div>

      {SAMPLES.map((sample) => (
        <section key={sample.label} className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">{sample.label}</h2>
            <span className="text-xs text-gray-500 font-mono">{sample.img.split("/").slice(-2).join("/")}</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-2"><strong>Option 1</strong> — blurred backdrop, no migration</p>
              <OptionOne imageUrl={sample.img} />
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-2"><strong>Option 2</strong> — separate banner + this image as logo</p>
              <OptionTwo logoUrl={sample.img} />
            </div>
          </div>
        </section>
      ))}

      <div className="text-sm text-gray-500 pt-6 border-t space-y-2">
        <p><strong>Option 1 tradeoff</strong>: works instantly with every existing image, but on wide landscape uploads the contained image leaves visible side-padding (you can see it on row 1).</p>
        <p><strong>Option 2 tradeoff</strong>: looks the most polished, but requires a DB migration, admin UI for banner upload, and creators have to upload a wide banner — until then their community uses a default/gradient banner.</p>
      </div>
    </div>
  );
}

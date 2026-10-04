"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, EyeOff, ImagePlus, Plus, Sparkles, Trash2, PenLine } from "lucide-react";
import Editor from "@/components/Editor";
import toast from "react-hot-toast";
import VideoUpload from "@/components/VideoUpload";
import { uploadFileToStorage, STORAGE_FOLDERS } from "@/lib/storage-client";
import { AppDialog, FIELD_INPUT, FIELD_LABEL } from "@/components/ds/app-dialog";
import { InlineConfirm } from "@/components/ds/inline-confirm";
import { BTN_GHOST, BTN_PRIMARY } from "@/components/community-feed/feed-header";
import {
  AUTO_INFO,
  AUTO_TYPES,
  TEMPLATES,
  WRITTEN_INFO,
  WRITTEN_TYPES,
  autoAvailable,
  hasContent,
  isAuto,
  type AboutBlock,
  type BlockContent,
  type BlockType,
  type Offered,
  type TemplateKey,
} from "@/lib/about/blocks";
import { cn } from "@/lib/utils";

const ICON_BTN = "grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40";

/** Edit-mode frame: where the block comes from, its name, move and remove. */
export function BlockShell({
  block,
  index,
  count,
  hidden,
  hiddenReason,
  onRename,
  onMove,
  onRemove,
  children,
}: {
  block: AboutBlock;
  index: number;
  count: number;
  hidden: boolean;
  hiddenReason: string | null;
  onRename: (title: string | null) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  const auto = isAuto(block.type);
  const name = auto ? AUTO_INFO[block.type as keyof typeof AUTO_INFO].name : WRITTEN_INFO[block.type as keyof typeof WRITTEN_INFO].name;
  const renamable = block.type !== "text" && block.type !== "quote" && block.type !== "video";
  return (
    <section className="relative flex flex-col gap-3.5 rounded-md outline-dashed outline-[1.5px] outline-offset-[12px] outline-brand-line">
      <div className="-mb-1 mt-[-4px] flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
        <span className={cn("mr-auto inline-flex items-center gap-1.5 font-semibold", auto ? "text-ok" : "text-brand-ink")}>
          {auto ? <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> : <PenLine className="h-3.5 w-3.5" aria-hidden="true" />}
          {auto ? `Automatic: ${name}` : name}
        </span>
        {hidden && (
          <span className="inline-flex items-center gap-1 text-ink-3">
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            {hiddenReason ?? "Not shown to visitors yet"}
          </span>
        )}
        <button type="button" className={ICON_BTN} aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={ICON_BTN} aria-label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cn(ICON_BTN, "hover:bg-live-soft hover:text-live")}
          aria-label={`Remove ${name}`}
          onClick={() => (!auto && hasContent(block) ? setConfirm(true) : onRemove())}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {renamable && (
        <label className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <span className="shrink-0">Section title</span>
          <input
            value={block.title ?? ""}
            placeholder={auto ? name : "No title"}
            maxLength={80}
            onChange={(e) => onRename(e.target.value || null)}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[14px] text-ink outline-none focus:border-brand"
          />
        </label>
      )}
      {confirm && (
        <InlineConfirm title="Remove this block?" confirmLabel="Remove" cancelLabel="Keep it" onCancel={() => setConfirm(false)} onConfirm={onRemove}>
          What you wrote in it goes too.
        </InlineConfirm>
      )}
      {children}
    </section>
  );
}

/** Editors for the owner's own blocks. */
export function WrittenEditor({
  block,
  communityId,
  onChange,
  onUploadingChange,
}: {
  block: AboutBlock;
  communityId: string;
  onChange: (content: BlockContent) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const c = block.content;
  const set = (patch: Partial<BlockContent>) => onChange({ ...c, ...patch });
  switch (block.type) {
    case "text":
      return (
        <div className="flex flex-col gap-2.5">
          <input
            value={c.heading ?? ""}
            onChange={(e) => set({ heading: e.target.value })}
            placeholder="Heading (optional)"
            maxLength={120}
            aria-label="Heading"
            className={cn(FIELD_INPUT, "font-display text-[19px] font-semibold")}
          />
          <Editor content={c.text ?? ""} onChange={(html) => set({ text: html })} showAlignment={false} placeholder="Write something for visitors." minHeight="120px" />
        </div>
      );
    case "image":
      return <ImageEditor content={c} set={set} />;
    case "video":
      return <VideoEditor content={c} set={set} communityId={communityId} onUploadingChange={onUploadingChange} />;
    case "quote":
      return (
        <div className="grid gap-2.5">
          <textarea
            value={c.text ?? ""}
            onChange={(e) => set({ text: e.target.value })}
            placeholder="What a member says about you"
            maxLength={600}
            aria-label="Testimonial"
            className={cn(FIELD_INPUT, "min-h-[84px] resize-y")}
          />
          <input value={c.who ?? ""} onChange={(e) => set({ who: e.target.value })} placeholder="Who said it, for example Anika, Tallinn" maxLength={80} aria-label="Who said it" className={FIELD_INPUT} />
        </div>
      );
    case "button":
      return (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <input value={c.ctaText ?? ""} onChange={(e) => set({ ctaText: e.target.value })} placeholder="Button label" maxLength={60} aria-label="Button label" className={FIELD_INPUT} />
          <input value={c.ctaLink ?? ""} onChange={(e) => set({ ctaLink: e.target.value })} placeholder="https://" aria-label="Link" className={FIELD_INPUT} />
          <input value={c.text ?? ""} onChange={(e) => set({ text: e.target.value })} placeholder="A line next to the button (optional)" maxLength={300} aria-label="Text" className={cn(FIELD_INPUT, "sm:col-span-2")} />
        </div>
      );
    case "teacher":
      return (
        <div>
          <label className={FIELD_LABEL} htmlFor={`bio-${block.id}`}>How you teach</label>
          <textarea
            id={`bio-${block.id}`}
            value={c.bio ?? ""}
            onChange={(e) => set({ bio: e.target.value })}
            placeholder="Where you teach, what your classes focus on, who they're for."
            maxLength={1200}
            className={cn(FIELD_INPUT, "min-h-[96px] resize-y")}
          />
          <p className="mt-1.5 text-[12.5px] text-ink-3">Your name and photo come from your profile.</p>
        </div>
      );
    case "faq": {
      const items = c.items ?? [];
      return (
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] text-ink-3">Answers about price, replays and private lessons are added for you. Add your own questions here.</p>
          {items.map((it, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line bg-surface p-3">
              <div className="flex gap-2">
                <input
                  value={it.q}
                  onChange={(e) => set({ items: items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })}
                  placeholder="Question, for example Do I need a partner?"
                  maxLength={200}
                  aria-label={`Question ${i + 1}`}
                  className={cn(FIELD_INPUT, "font-semibold")}
                />
                <button type="button" className={ICON_BTN} aria-label={`Remove question ${i + 1}`} onClick={() => set({ items: items.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <textarea
                value={it.a}
                onChange={(e) => set({ items: items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })}
                placeholder="Answer"
                maxLength={1200}
                aria-label={`Answer ${i + 1}`}
                className={cn(FIELD_INPUT, "min-h-[64px] resize-y")}
              />
            </div>
          ))}
          {items.length < 20 && (
            <button type="button" className={cn(BTN_GHOST, "self-start")} onClick={() => set({ items: [...items, { q: "", a: "" }] })}>
              <Plus aria-hidden="true" />
              Add a question
            </button>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

function ImageEditor({ content: c, set }: { content: BlockContent; set: (patch: Partial<BlockContent>) => void }) {
  const [uploading, setUploading] = useState(false);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    setUploading(true);
    try {
      set({ imageUrl: await uploadFileToStorage(file, STORAGE_FOLDERS.COMMUNITY_PAGES) });
    } catch {
      toast.error("Couldn't upload the image. Try again.");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="flex flex-col gap-2.5">
      <label
        className={cn(
          "relative grid cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface-2 text-ink-2 transition-colors hover:border-brand-line hover:text-brand-ink",
          c.imageUrl ? "aspect-[16/9]" : "h-44"
        )}
      >
        {c.imageUrl ? (
          <>
            <img src={c.imageUrl} alt={c.altText ?? ""} className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg bg-surface/95 px-2.5 py-1.5 text-[13px] font-semibold text-ink shadow-card">
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              {uploading ? "Uploading…" : "Replace image"}
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2 text-[14px] font-semibold">
            <ImagePlus className="h-6 w-6" aria-hidden="true" />
            {uploading ? "Uploading…" : "Upload an image"}
          </span>
        )}
        <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={pick} />
      </label>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <input value={c.caption ?? ""} onChange={(e) => set({ caption: e.target.value })} placeholder="Caption (optional)" maxLength={200} aria-label="Caption" className={FIELD_INPUT} />
        <input
          value={c.altText ?? ""}
          onChange={(e) => set({ altText: e.target.value })}
          placeholder="Describe the image for screen readers"
          maxLength={200}
          aria-label="Image description"
          className={FIELD_INPUT}
        />
      </div>
    </div>
  );
}

function VideoEditor({
  content: c,
  set,
  communityId,
  onUploadingChange,
}: {
  content: BlockContent;
  set: (patch: Partial<BlockContent>) => void;
  communityId: string;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [replacing, setReplacing] = useState(false);
  return (
    <div className="flex flex-col gap-2.5">
      {c.videoId && !replacing ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
          <img src={`https://image.mux.com/${c.videoId}/thumbnail.webp?width=240&time=1`} alt="" className="h-[54px] w-24 rounded-md bg-surface-3 object-cover" />
          <span className="min-w-0 flex-1 text-[14px] text-ink-2">Video uploaded. It plays here once it has finished processing.</span>
          <button type="button" className={BTN_GHOST} onClick={() => setReplacing(true)}>
            Replace video
          </button>
        </div>
      ) : (
        <VideoUpload
          communityId={communityId}
          onUploadingChange={onUploadingChange}
          onUploadComplete={(assetId, playbackId) => {
            set({ videoId: playbackId, videoAssetId: assetId });
            setReplacing(false);
          }}
          onUploadError={(err) => toast.error(err || "Couldn't upload the video. Try again.")}
        />
      )}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <input value={c.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="Video title (optional)" maxLength={120} aria-label="Video title" className={FIELD_INPUT} />
        <input
          value={c.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="A line under the video (optional)"
          maxLength={300}
          aria-label="Video description"
          className={FIELD_INPUT}
        />
      </div>
    </div>
  );
}

/** The "Add block" library: automatic blocks (when the community offers them) and written ones. */
export function AddBlockDialog({
  open,
  onOpenChange,
  offered,
  onPage,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offered: Offered;
  onPage: Set<BlockType>;
  onAdd: (type: BlockType) => void;
}) {
  const row = (type: BlockType, name: string, hint: string, disabled: string | null) => (
    <button
      key={type}
      type="button"
      disabled={!!disabled}
      onClick={() => {
        onAdd(type);
        onOpenChange(false);
      }}
      className="flex w-full items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left transition-colors hover:border-brand-line hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line disabled:hover:bg-surface"
    >
      <span className="min-w-0">
        <strong className="block text-[14.5px] text-ink">{name}</strong>
        <span className="text-[13px] text-ink-2">{disabled ?? hint}</span>
      </span>
    </button>
  );
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Add a block" width={600}>
      <h3 className="text-[13px] font-semibold text-ink-2">Automatic: they fill themselves from what you offer</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {AUTO_TYPES.map((t) =>
          row(t, AUTO_INFO[t].name, AUTO_INFO[t].hint, onPage.has(t) ? "Already on your page" : !autoAvailable(t, offered) ? AUTO_INFO[t].missing ?? null : null)
        )}
      </div>
      <h3 className="mt-1 text-[13px] font-semibold text-ink-2">Written by you</h3>
      <div className="grid gap-2 sm:grid-cols-2">{WRITTEN_TYPES.map((t) => row(t, WRITTEN_INFO[t].name, WRITTEN_INFO[t].hint, t === "teacher" && onPage.has(t) ? "Already on your page" : null))}</div>
    </AppDialog>
  );
}

/** Templates: an order of blocks to start from. Written blocks are kept. */
export function TemplateDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (key: TemplateKey) => void;
}) {
  const [picked, setPicked] = useState<TemplateKey | null>(null);
  return (
    <AppDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setPicked(null);
        onOpenChange(o);
      }}
      title="Start from a template"
      description="It sets which automatic blocks show and in what order. Blocks you wrote stay, at the end."
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(TEMPLATES) as TemplateKey[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={picked === k}
            onClick={() => setPicked(k)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl border px-3.5 py-3 text-left transition-colors",
              picked === k ? "border-brand-line bg-brand-soft" : "border-line bg-surface hover:border-line-strong"
            )}
          >
            <strong className="text-[14.5px] text-ink">{TEMPLATES[k].name}</strong>
            <span className="text-[13px] text-ink-2">{TEMPLATES[k].text}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className={BTN_GHOST} onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={!picked}
          onClick={() => {
            if (picked) onApply(picked);
            setPicked(null);
            onOpenChange(false);
          }}
        >
          Use this template
        </button>
      </div>
    </AppDialog>
  );
}

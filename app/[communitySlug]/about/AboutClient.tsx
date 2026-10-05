"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CalendarDays, Check, EyeOff, GraduationCap, Instagram, LayoutTemplate, Pencil, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, instagramHandle } from "@/components/community-feed/feed-header";
import { clock } from "@/components/community-calendar/format";
import { ViewBlock, autoHasData, blockHeading, blockLabel, inSentence, type AboutCtx } from "@/components/community-about/view-blocks";
import { FinalCta, JoinCard, MemberCard, MobileJoinBar, OwnerChecklist, type JoinState, type Plan } from "@/components/community-about/join-rail";
import { AddBlockDialog, BlockShell, TemplateDialog, WrittenEditor } from "@/components/community-about/editor";
import { useJoinCommunity } from "@/hooks/useJoinCommunity";
import { useNow } from "@/hooks/use-now";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import {
  AUTO_INFO,
  TEMPLATES,
  autoAvailable,
  MAX_BLOCKS,
  hasContent,
  holdsOwnContent,
  isAuto,
  makeBlock,
  templateBlocks,
  type AboutBlock,
  type BlockContent,
  type BlockType,
  type Offered,
  type TemplateKey,
} from "@/lib/about/blocks";
import type { AboutData } from "@/lib/about/data";
import { euro } from "@/lib/private-lessons/policy";
import { communityPath } from "@/lib/safe-redirect";
import { relativeDayWord } from "@/lib/time/format";
import { cn } from "@/lib/utils";

interface AboutCommunity {
  id: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  imageFocalX: number;
  imageFocalY: number;
  imageZoom: number;
  links: Array<{ title: string; url: string }>;
  membershipEnabled: boolean;
  membershipPrice: number;
  yearlyEnabled: boolean;
  yearlyPrice?: number;
  stripeAccountId: string | null;
}

type FinalCtaText = { title?: string; text?: string } | null;
type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const SAVE_DELAY = 900;

/** Why a block isn't shown to visitors right now, or null when it is. */
function hiddenReason(b: AboutBlock, ctx: AboutCtx): string | null {
  if (isAuto(b.type)) {
    if (!autoAvailable(b.type, ctx.offered)) return AUTO_INFO[b.type].missing ?? "Not shown to visitors";
    if (autoHasData(b, ctx)) return null;
    if (b.type === "schedule") return "Shows once a live class is scheduled";
    if (b.type === "course") return "Shows once a course has lessons";
    if (b.type === "lessons") return "Shows once a lesson type is active";
    if (b.type === "activity") return "Shows once members start posting";
    return null;
  }
  return hasContent(b) ? null : "Shows once you add content";
}

export default function AboutClient({
  community,
  initialBlocks,
  initialFinalCta,
  customized,
  teacher,
  offered,
  data,
  pricing,
  join: joinState,
  isOwner,
  startEditing = false,
  viewerZone,
  serverNow,
}: {
  community: AboutCommunity;
  initialBlocks: AboutBlock[];
  initialFinalCta: FinalCtaText;
  customized: boolean;
  teacher: AboutCtx["teacher"];
  offered: Offered;
  data: AboutData;
  pricing: AboutCtx["pricing"];
  join: JoinState;
  isOwner: boolean;
  /** Admin links open the page straight in edit mode. */
  startEditing?: boolean;
  viewerZone: string | null;
  serverNow: number;
}) {
  const router = useRouter();
  const now = useNow(60_000, serverNow) ?? new Date(serverNow);
  const timeZone = useViewerTimeZone(viewerZone);
  const ctx: AboutCtx = { slug: community.slug, communityName: community.name, teacher, offered, data, pricing, timeZone, now };

  const [blocks, setBlocks] = useState(initialBlocks);
  const [finalCta, setFinalCta] = useState<FinalCtaText>(initialFinalCta);
  const [editing, setEditing] = useState(startEditing);
  const [previewing, setPreviewing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [addAt, setAddAt] = useState<number | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [plan, setPlan] = useState<Plan>("monthly");

  const { join, isJoining, modals } = useJoinCommunity({
    id: community.id,
    slug: community.slug,
    name: community.name,
    membershipEnabled: community.membershipEnabled,
    membershipPrice: community.membershipPrice,
    yearlyEnabled: community.yearlyEnabled,
    yearlyPrice: community.yearlyPrice,
    stripeAccountId: community.stripeAccountId,
    isMember: joinState.isMember,
    status: joinState.status,
  });

  // ---- Autosave: every change is saved shortly after the owner stops typing.
  const latest = useRef({ blocks: initialBlocks, finalCta: initialFinalCta });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const flight = useRef<Promise<boolean> | null>(null);
  const savedOnce = useRef(false);

  const body = useCallback(
    () => JSON.stringify({ aboutPage: { version: 2, sections: latest.current.blocks, finalCta: latest.current.finalCta } }),
    []
  );

  const save = useCallback(async (): Promise<boolean> => {
    dirty.current = false;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/community/${community.slug}/about`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: body(),
      });
      if (res.ok) return true;
    } catch {
      // handled below
    }
    dirty.current = true;
    return false;
  }, [body, community.slug]);

  /** Saves what's pending, one request at a time. False when it couldn't. */
  const persist = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (flight.current) await flight.current;
    let saved = false;
    while (dirty.current) {
      const run = save();
      flight.current = run;
      const ok = await run;
      flight.current = null;
      if (!ok) {
        setSaveState("error");
        return false;
      }
      saved = true;
      savedOnce.current = true;
    }
    if (saved) setSaveState("saved");
    return true;
  }, [save]);

  const commit = (nextBlocks: AboutBlock[], nextCta: FinalCtaText = latest.current.finalCta) => {
    latest.current = { blocks: nextBlocks, finalCta: nextCta };
    setBlocks(nextBlocks);
    setFinalCta(nextCta);
    dirty.current = true;
    setSaveState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), SAVE_DELAY);
  };

  // Video uploads in progress, by block. An upload stops if its editor
  // unmounts, so leaving edit mode waits for them.
  const [uploadingIds] = useState(() => new Set<string>());
  const [uploadHandlers] = useState(() => new Map<string, (u: boolean) => void>());
  const [uploadCount, setUploadCount] = useState(0);
  const uploadHandler = (id: string) => {
    let h = uploadHandlers.get(id);
    if (!h) {
      h = (u: boolean) => {
        if (u) uploadingIds.add(id);
        else uploadingIds.delete(id);
        setUploadCount(uploadingIds.size);
      };
      uploadHandlers.set(id, h);
    }
    return h;
  };

  // Unsaved changes or an upload: ask before the tab closes; on in-app
  // navigation, send what's pending.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || flight.current || uploadingIds.size > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [uploadingIds]);
  // Leaving the page: send what's pending, then drop the router's cached copy
  // of this page so Back shows the saved version, not the one from before.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const pending = flight.current;
      if (pending) {
        // The save underway keeps going and picks up later changes itself.
        void pending.finally(() => router.refresh());
      } else if (dirty.current) {
        void fetch(`/api/community/${community.slug}/about`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: body(),
          keepalive: true,
        })
          .catch(() => {})
          .finally(() => router.refresh());
      } else if (savedOnce.current) {
        router.refresh();
      }
    },
    [body, community.slug, router]
  );

  const leaveEditing = async (then: () => void) => {
    if (uploadCount > 0) {
      toast.error("Wait for the video to finish uploading.");
      return;
    }
    if (await persist()) {
      then();
      if (savedOnce.current) router.refresh();
    } else toast.error("Couldn't save your changes. Check your connection and try again.");
  };

  // ---- Block operations
  const updateBlock = (id: string, patch: Partial<AboutBlock>) =>
    commit(latest.current.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const patchContent = (id: string, patch: Partial<BlockContent>) =>
    commit(latest.current.blocks.map((b) => (b.id === id ? { ...b, content: { ...b.content, ...patch } } : b)));
  const moveBlock = (i: number, dir: -1 | 1) => {
    const next = [...latest.current.blocks];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const removeBlock = (id: string) => {
    const b = latest.current.blocks.find((x) => x.id === id);
    commit(latest.current.blocks.filter((x) => x.id !== id));
    if (b) toast.success(`${blockLabel(b)} removed. Add it back anytime from Add block.`);
  };
  const addBlock = (type: BlockType, at: number) => {
    if (latest.current.blocks.length >= MAX_BLOCKS) {
      toast.error(`A page can have up to ${MAX_BLOCKS} blocks. Remove one to add another.`);
      return;
    }
    const next = [...latest.current.blocks];
    const block = makeBlock(type);
    next.splice(Math.min(at, next.length), 0, block);
    commit(next);
    requestAnimationFrame(() => document.getElementById(`block-${block.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const applyTemplate = (key: TemplateKey) => {
    if (uploadCount > 0) {
      toast.error("Wait for the video to finish uploading.");
      return;
    }
    // The template sets which automatic blocks show and in what order.
    // Written blocks with something in them are kept: in the template's
    // matching spot when it has one, otherwise after the template's blocks.
    const old = latest.current.blocks;
    const pool = old.filter((b) => !isAuto(b.type) && hasContent(b));
    const used = new Set<string>();
    const take = (type: BlockType) => {
      const match = pool.find((b) => b.type === type && !used.has(b.id));
      if (match) used.add(match.id);
      return match;
    };
    // The owner's own questions are written content too.
    const ownFaq = old.find((b) => b.type === "faq");
    const placed = templateBlocks(key, offered).map((b) => {
      if (!isAuto(b.type)) return take(b.type) ?? b;
      if (b.type === "faq" && ownFaq) return { ...b, title: ownFaq.title, content: ownFaq.content };
      return b;
    });
    const faqKept = ownFaq && holdsOwnContent(ownFaq) && !placed.some((b) => b.type === "faq") ? [ownFaq] : [];
    commit([...placed, ...pool.filter((b) => !used.has(b.id)), ...faqKept]);
    toast.success(`${TEMPLATES[key].name} applied. Blocks for things you don't offer stay hidden.`);
  };
  const startEditingAt = (type: "video" | "teacher") => {
    setPreviewing(false);
    setEditing(true);
    const existing = latest.current.blocks.find((b) => b.type === type);
    if (existing) {
      requestAnimationFrame(() => document.getElementById(`block-${existing.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } else {
      addBlock(type, type === "video" ? 0 : latest.current.blocks.length);
    }
  };

  // ---- What visitors see
  const showing = isOwner && editing && !previewing ? blocks : blocks.filter((b) => hiddenReason(b, ctx) === null);
  // Never an empty page: fall back to what membership includes.
  const visible = showing.length || (isOwner && editing) ? showing : [makeBlock("included", "fallback-included")];
  const onPage = new Set(blocks.map((b) => b.type));

  const pre = joinState.status === "pre_registration";
  // In the owner's preview, the page shows what a visitor who hasn't joined sees.
  const viewState: JoinState = previewing ? { ...joinState, isMember: false, isPreRegistered: false } : joinState;
  const canJoin = !viewState.isMember && !viewState.isPreRegistered && viewState.status !== "inactive";
  const showJoin = (!isOwner || previewing) && canJoin;
  const yearlyOn = pricing.paid && pricing.yearly != null && !pre;
  const amount = plan === "yearly" && yearlyOn ? pricing.yearly! : pricing.monthly;
  const saving = yearlyOn ? pricing.monthly * 12 - pricing.yearly! : 0;
  const onJoin = () => {
    if (previewing) {
      toast("Visitors join from here.");
      return;
    }
    void join({ plan });
  };
  const joinLabel = pre ? "Pre-register" : pricing.paid ? `Join ${community.name}` : "Join for free";
  const finalDefault = pre
    ? {
        title: "Be there on opening day",
        text: `${community.name} opens soon. Pre-register now, pay nothing today.`,
      }
    : offered.liveClasses && data.upcoming.length
      ? { title: "Dance with us at the next live class", text: pricing.paid ? `${euro(pricing.monthly)} a month${pricing.yearly ? ` or ${euro(pricing.yearly)} a year` : ""}. Cancel anytime.` : "Joining is free." }
      : offered.courses && data.course
        ? { title: "Start lesson 1 today", text: pricing.paid ? `${euro(pricing.monthly)} a month${pricing.yearly ? ` or ${euro(pricing.yearly)} a year` : ""}. Cancel anytime.` : "Joining is free." }
        : { title: `Join ${community.name}`, text: pricing.paid ? `${euro(pricing.monthly)} a month. Cancel anytime.` : "Joining is free." };

  const instagram = community.links.map((l) => ({ url: l.url, handle: instagramHandle(l.url) })).find((l) => l.handle);
  const next = data.upcoming[0];
  const fact =
    offered.liveClasses && next
      ? { icon: CalendarDays, text: `Next live class ${inSentence(relativeDayWord(next.startsAt, now, timeZone, "en-GB"))} at ${clock(next.startsAt, timeZone)}` }
      : offered.courses && data.courseCount
        ? { icon: BookOpen, text: `${data.courseCount} ${data.courseCount === 1 ? "course" : "courses"}` }
        : offered.privateLessons && data.lessons.length
          ? { icon: GraduationCap, text: `Private lessons from ${euro(Math.min(...data.lessons.map((l) => l.memberPrice ?? l.regularPrice)))}` }
          : null;

  const video = blocks.find((b) => b.type === "video");
  const teacherBlock = blocks.find((b) => b.type === "teacher");
  const admin = (p: string) => communityPath(community.slug, `/admin${p}`);
  const checklist = [
    { label: "Cover image", done: !!community.imageUrl, href: admin("/general") },
    { label: "A short description", done: !!community.description.trim(), href: admin("/general") },
    pricing.paid
      ? { label: "Monthly and yearly prices", done: pricing.yearly != null, href: admin("/subscriptions") }
      : { label: "Free membership", done: true },
    ...(offered.liveClasses ? [{ label: "A live class on the schedule", done: data.upcoming.length > 0, href: communityPath(community.slug, "/calendar") }] : []),
    ...(offered.courses ? [{ label: "A published course", done: !!data.course, href: communityPath(community.slug, "/classroom") }] : []),
    ...(offered.privateLessons ? [{ label: "Lesson types with open times", done: data.lessons.some((l) => l.nextFree), href: communityPath(community.slug, "/private-lessons") }] : []),
    { label: "A welcome video", done: !!video?.content.videoId, onFix: () => startEditingAt("video") },
    { label: "Teacher bio", done: !!teacherBlock?.content.bio, onFix: () => startEditingAt("teacher") },
  ];

  const editMode = isOwner && editing && !previewing;
  const mobileBar = showJoin;

  const addBetween = (at: number) => (
    <div key={`add-${at}`} className="relative z-[2] -my-[26px] flex justify-center">
      <button
        type="button"
        onClick={() => setAddAt(at)}
        className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-dashed border-brand-line bg-surface px-3 text-[13px] font-semibold text-brand-ink opacity-80 transition hover:border-solid hover:opacity-100 focus-visible:border-solid focus-visible:opacity-100"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        Add block
      </button>
    </div>
  );

  return (
    <div className={cn("mx-auto max-w-[1160px] px-4 pt-4 sm:px-6 sm:pt-6", mobileBar ? "pb-[150px] lg:pb-[72px]" : "pb-12 sm:pb-[72px]")}>
      {community.imageUrl && (
        <div className="aspect-[4/1] max-h-[200px] w-full overflow-hidden rounded-xl bg-black shadow-card sm:rounded-2xl">
          <img
            src={community.imageUrl}
            alt=""
            className="block h-full w-full object-cover"
            style={{
              objectPosition: `${community.imageFocalX}% ${community.imageFocalY}%`,
              transform: community.imageZoom !== 1 ? `scale(${community.imageZoom})` : undefined,
              transformOrigin: `${community.imageFocalX}% ${community.imageFocalY}%`,
            }}
          />
        </div>
      )}

      <header className={cn("flex flex-col gap-2 px-0.5", community.imageUrl ? "pt-4 sm:pt-5" : "pt-2")}>
        <h1 className="text-balance font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.015em] text-ink sm:text-[34px]">{community.name}</h1>
        {community.description && <p className="max-w-[60ch] text-[16px] text-ink-2 sm:text-[17px]">{community.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[14px] text-ink-2">
          <span>
            <strong className="font-semibold text-ink">{data.memberCount}</strong> {data.memberCount === 1 ? "member" : "members"}
          </span>
          {fact && (
            <span className="inline-flex items-center gap-[7px]">
              <fact.icon className="h-4 w-4 text-ink-3" aria-hidden="true" />
              {fact.text}
            </span>
          )}
          {instagram && (
            <a href={instagram.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-[7px] hover:text-brand-ink">
              <Instagram className="h-4 w-4" aria-hidden="true" />
              {instagram.handle}
            </a>
          )}
          {isOwner && !previewing && (
            <button
              type="button"
              aria-pressed={editing}
              className={cn(editing ? BTN_PRIMARY : BTN_SECONDARY, "ml-auto h-9")}
              onClick={() => (editing ? void leaveEditing(() => setEditing(false)) : setEditing(true))}
            >
              {editing ? <Check aria-hidden="true" /> : <Pencil aria-hidden="true" />}
              {editing ? "Done editing" : "Edit page"}
            </button>
          )}
        </div>
      </header>

      <div className="mt-7 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-10">
          {previewing && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-line bg-brand-soft px-4 py-3.5 text-[14px] text-ink-2">
              <p className="min-w-0 flex-1">
                <strong className="block text-[15px] text-ink">You&apos;re seeing the page as a visitor</strong>
                Blocks with nothing to show are hidden, and the join card replaces your checklist.
              </p>
              <button type="button" className={BTN_SECONDARY} onClick={() => setPreviewing(false)}>
                Exit preview
              </button>
            </div>
          )}

          {isOwner && !editing && !previewing && !customized && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-line bg-brand-soft px-4 py-3.5 text-[14px] text-ink-2">
              <p className="min-w-0 flex-1">
                <strong className="block text-[15px] text-ink">This is a starter page</strong>
                It&apos;s built from what you offer. Edit it to add a welcome video, your story and your own questions.
              </p>
              <button type="button" className={BTN_PRIMARY} onClick={() => setEditing(true)}>
                <Pencil aria-hidden="true" />
                Edit page
              </button>
            </div>
          )}

          {editMode && (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-2xl border border-brand-line bg-brand-soft px-4 py-3.5 text-[14px]">
              <p className="min-w-[220px] flex-1 text-ink-2">
                <strong className="block text-[15px] text-ink">You&apos;re editing your About page</strong>
                Automatic blocks update themselves and only appear when there&apos;s something to show. Written blocks are yours. Changes save as you go.
              </p>
              <span role="status" className="text-[13px] font-semibold text-ink-3">
                {saveState === "saving" || saveState === "pending" ? (
                  "Saving…"
                ) : saveState === "saved" ? (
                  <span className="inline-flex items-center gap-1 text-ok">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Saved
                  </span>
                ) : saveState === "error" ? (
                  <button type="button" className="text-live underline underline-offset-2" onClick={() => void persist()}>
                    Not saved. Try again
                  </button>
                ) : null}
              </span>
              <button type="button" className={cn(BTN_GHOST, "h-9")} onClick={() => setTemplateOpen(true)}>
                <LayoutTemplate aria-hidden="true" />
                Template
              </button>
              <button type="button" className={cn(BTN_PRIMARY, "h-9")} onClick={() => setAddAt(blocks.length)}>
                <Plus aria-hidden="true" />
                Add block
              </button>
            </div>
          )}

          {editMode && blocks.length > 0 && addBetween(0)}

          {visible.map((b, i) => {
            if (!editMode) {
              return (
                <section key={b.id} id={`block-${b.id}`} aria-label={blockHeading(b) || blockLabel(b)} className="flex scroll-mt-24 flex-col gap-3.5">
                  <ViewBlock block={b} ctx={ctx} />
                </section>
              );
            }
            const reason = hiddenReason(b, ctx);
            const ownsContent = !isAuto(b.type) || b.type === "faq";
            return (
              <Fragment key={b.id}>
                <div id={`block-${b.id}`} className="scroll-mt-24">
                  <BlockShell
                    block={b}
                    index={i}
                    count={blocks.length}
                    hidden={reason !== null}
                    hiddenReason={reason}
                    onRename={(title) => updateBlock(b.id, { title })}
                    onMove={(dir) => moveBlock(i, dir)}
                    onRemove={() => removeBlock(b.id)}
                  >
                    {ownsContent ? (
                      <WrittenEditor
                        block={b}
                        communityId={community.id}
                        onPatch={(patch: Partial<BlockContent>) => patchContent(b.id, patch)}
                        onUploadingChange={b.type === "video" ? uploadHandler(b.id) : undefined}
                      />
                    ) : reason === null ? (
                      <ViewBlock block={b} ctx={ctx} />
                    ) : (
                      <p className="flex items-start gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-4 py-3.5 text-[14px] text-ink-2">
                        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
                        <span>
                          <strong className="block text-ink">Not shown to visitors</strong>
                          {reason}. This block appears on its own when there&apos;s something to show.
                        </span>
                      </p>
                    )}
                  </BlockShell>
                </div>
                {addBetween(i + 1)}
              </Fragment>
            );
          })}

          {editMode && blocks.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface px-5 py-10 text-center">
              <p className="text-[15px] text-ink-2">Your page has no blocks. Visitors see what membership includes and the join card.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button type="button" className={BTN_PRIMARY} onClick={() => setAddAt(0)}>
                  <Plus aria-hidden="true" />
                  Add block
                </button>
                <button type="button" className={BTN_SECONDARY} onClick={() => setTemplateOpen(true)}>
                  <LayoutTemplate aria-hidden="true" />
                  Start from a template
                </button>
              </div>
            </div>
          )}

          {editMode && (
            <section aria-label="Last call to join" className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-brand-line p-4">
              <p className="text-[12.5px] font-semibold text-brand-ink">The last call to join, at the end of the page</p>
              <input
                value={finalCta?.title ?? ""}
                onChange={(e) => commit(latest.current.blocks, { ...(latest.current.finalCta ?? {}), title: e.target.value })}
                placeholder={finalDefault.title}
                maxLength={120}
                aria-label="Title"
                className="h-10 rounded-lg border border-line bg-surface px-3 font-display text-[17px] font-semibold text-ink outline-none focus:border-brand"
              />
              <input
                value={finalCta?.text ?? ""}
                onChange={(e) => commit(latest.current.blocks, { ...(latest.current.finalCta ?? {}), text: e.target.value })}
                placeholder={finalDefault.text}
                maxLength={300}
                aria-label="Text"
                className="h-10 rounded-lg border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand"
              />
              <p className="text-[12.5px] text-ink-3">Leave them empty to use the suggestion. Members don&apos;t see this.</p>
            </section>
          )}

          {showJoin && (
            <FinalCta
              title={finalCta?.title || finalDefault.title}
              text={finalCta?.text || finalDefault.text}
              label={joinLabel}
              onJoin={onJoin}
              isJoining={isJoining}
            />
          )}
        </div>

        <aside aria-label="Membership" className="order-first flex flex-col gap-4 lg:sticky lg:top-[calc(env(safe-area-inset-top)+80px)] lg:order-none">
          {isOwner && !previewing ? (
            <OwnerChecklist
              items={checklist}
              previewing={previewing}
              onPreview={() => void leaveEditing(() => setPreviewing(true))}
            />
          ) : joinState.isMember && !previewing ? (
            <MemberCard ctx={ctx} state={joinState} />
          ) : (
            <JoinCard ctx={ctx} state={viewState} plan={plan} onPlan={setPlan} onJoin={onJoin} isJoining={isJoining} />
          )}
        </aside>
      </div>

      {mobileBar && (
        <MobileJoinBar
          price={pricing.paid ? `${euro(amount)} ${plan === "yearly" && yearlyOn ? "a year" : "a month"}` : "Free to join"}
          sub={pricing.paid ? (plan === "yearly" && saving > 0 ? `You save ${euro(saving)}` : "Cancel anytime") : "No card needed"}
          label={pre ? "Pre-register" : "Join"}
          onJoin={onJoin}
          isJoining={isJoining}
        />
      )}

      <AddBlockDialog
        open={addAt !== null}
        onOpenChange={(o) => !o && setAddAt(null)}
        offered={offered}
        onPage={onPage}
        onAdd={(type) => addBlock(type, addAt ?? blocks.length)}
      />
      <TemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} onApply={applyTemplate} />
      {!isOwner && modals}
    </div>
  );
}

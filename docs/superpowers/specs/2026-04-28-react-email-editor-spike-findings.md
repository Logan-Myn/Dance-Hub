# React Email Editor Spike — Findings

**Date:** 2026-04-28
**Spec:** `docs/superpowers/specs/2026-04-28-react-email-editor-spike-design.md`
**Plan:** `docs/superpowers/plans/2026-04-28-react-email-editor-spike.md`
**Branch (worktree):** `spike/react-email-editor`

## Verdict

**`keep-tiptap`** — do not migrate.

Two hard blockers came up during the mechanical setup phase, before the human-driven test sequence ran. They were significant enough that we agreed to skip the HTML-quality and real-inbox tests and write findings now.

1. **TipTap v2 / v3 version mismatch** with the rest of the codebase. Causes a hard production-build failure that can only be bypassed by disabling TS checking or downgrading our entire TipTap stack.
2. **Bundle cost is severe.** The new editor route is 907 kB First Load JS (vs. 239 kB for the existing admin route), and just *installing* the package adds +100 kB to other admin routes that don't use it.

Either one alone would warrant pause. Together they make the migration cost-prohibitive at the current state of `@react-email/editor`. Revisit when the package upgrades to TipTap v3 and slims its bundle.

---

## What was actually tested

| Spike question | Answered? | How |
|---|---|---|
| Is the HTML output materially better? | **No** | Skipped — version + bundle blockers made this moot. |
| Does it render visibly better in Gmail / iCloud? | **No** | Skipped — same reason. |
| Is the image-upload integration clean? | **Yes** | Confirmed via wire-up code; see below. |
| What's the bundle cost? | **Yes** | See bundle-delta section. |

---

## Finding 1 — TipTap version incompatibility

`@react-email/editor@1.3.1` (the version published at the time of this spike) ships with `@tiptap/core@2.27.2` transitively, while the rest of our codebase uses `@tiptap/core@3.22.5`. The two major versions of TipTap have structurally incompatible `Mark<>` and `Node<>` types.

Concrete consequence: `bun run build` in the spike worktree fails with a long type-error chain in `components/Editor.tsx:156` (the existing `CustomTextStyle`-using course editor — completely unrelated to our broadcasts feature). The error is purely structural; the editor classes from the two TipTap versions look "the same shape" but TS can't unify them.

Workaround used in the spike: added `typescript: { ignoreBuildErrors: true }` to `next.config.js` to get a measurable build out the door. This is **not acceptable for production** — it would silently swallow real type errors across the entire codebase.

Real options for migration:
- **Downgrade our codebase to TipTap v2.** Regression. We'd lose v3 features and have to rewrite our existing TipTap usage (`components/emails/EmailEditor.tsx`, `components/Editor.tsx`).
- **Wait for `@react-email/editor` to upgrade to TipTap v3.** No timeline visible upstream as of this spike.
- **Accept duplicate TipTap installs at runtime + permanent type-check bypass.** Doubles the TipTap weight and trades type safety for nothing — defeats the point of using TipTap-based tooling.

None of these is good enough to justify continuing.

---

## Finding 2 — Bundle delta

Measured via `bun run build` before and after `bun add @react-email/editor`. Files: `build-baseline.txt`, `build-after.txt` in the worktree root.

### Existing admin route — `/[communitySlug]/admin/emails/new`

The route was **not modified** between the two builds. It still imports the existing `EmailComposer` / `EmailEditor.tsx` (TipTap v3). The delta is purely from the package being present in `node_modules` and pulling shared chunks.

| Metric | Baseline | After install | Delta |
|---|---|---|---|
| Route chunk | 20.8 kB | 32.8 kB | **+12.0 kB** |
| First Load JS | 239 kB | 339 kB | **+100 kB** |

This is "co-installation pollution" — every other admin route would pay this cost too, even though they don't use the new editor.

### New spike route — `/spike/email-editor`

The full footprint of mounting `<EmailEditor>` once.

| Metric | Value |
|---|---|
| Route chunk | 687 kB |
| First Load JS | **907 kB** |

For comparison, the existing TipTap-based admin/emails/new is 239 kB. A migration that swapped the editor in place would land somewhere in this 907 kB neighbourhood — roughly **3.8× heavier** than today.

### Shared chunks

| Metric | Baseline | After install | Delta |
|---|---|---|---|
| `First Load JS shared by all` | 88.2 kB | 96.7 kB | +8.5 kB |

So the spike adds ~8.5 kB to the shared chunk that loads on every page in the app, before any admin/editor work is done.

---

## Finding 3 — Image-upload integration (the part that worked)

The `onUploadImage` prop is exactly the right shape. Wire-up to the existing `/api/upload/broadcast-image` endpoint took five lines of glue. Verbatim, from `app/spike/email-editor/SpikeEditorClient.tsx`:

```tsx
const handleUploadImage = async (file: File): Promise<{ url: string }> => {
  const form = new FormData();
  form.set('file', file);
  form.set('communitySlug', COMMUNITY_SLUG);
  const res = await fetch('/api/upload/broadcast-image', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return { url: data.url };
};
```

This is the cleanest part of the spike. If the version + bundle issues are fixed upstream, the integration burden itself is trivial. Worth remembering when re-evaluating later.

Also note: the editor's `onUpdate` callback receives a ref whose `getEmailHTML()` is **async** (returns `Promise<string>`), not synchronous as the public docs implied. Minor, but easy to miss — would have caused a `[object Promise]` bug if not caught early.

---

## Other notes

- **Package version vs marketing version.** The blog post described "React Email v6" but `@react-email/editor` itself is on `1.3.1`. The editor is versioned independently from the framework; don't be misled by the v6 framing into expecting a mature, battle-tested editor. It's a 1.x release.
- **Built on TipTap + ProseMirror,** as the docs claim. So a future migration would not throw away our TipTap mental model — that's a small upside.
- **Resend send route works.** `/api/spike/send` POSTs HTML to Resend with `from: notifications@dance-hub.io`. Not actually exercised end-to-end (we'd have done that in the human tests), but the code path is straightforward and matches what `lib/broadcasts/sender.ts` does.

---

## Open questions (for revisiting later)

- When `@react-email/editor` upgrades to TipTap v3, repeat this spike. The bundle question may also change — the package has only just shipped, and 900 kB feels like room for tree-shaking improvements.
- Is there a way to import only the `composeReactEmail()` HTML serializer without the full editor UI? That would let us *author* with our existing TipTap and *output* through `@react-email/editor`'s HTML pipeline — getting the email-correct HTML benefit without the bundle cost. Worth exploring next time.
- Compare against `unlayer` / `mjml-react` / `easy-email` while we're here — they're more mature in this space and worth a smaller comparison if we want to revisit visual email editing.

---

## Recommendation

Stay on the current TipTap-based `EmailEditor.tsx`. Re-evaluate `@react-email/editor` in a few months once it stabilises and (hopefully) upgrades to TipTap v3. The throwaway worktree at `/home/debian/apps/dance-hub-spike-react-email-editor` can be removed.

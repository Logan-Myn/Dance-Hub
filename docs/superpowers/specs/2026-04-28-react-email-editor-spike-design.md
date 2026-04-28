# React Email v6 Editor Spike — Design Spec

**Date:** 2026-04-28
**Status:** Draft — awaiting user review
**Author:** Brainstormed with Claude

## Summary

A throwaway, time-boxed spike (~2-3 hours) to evaluate whether `@react-email/editor` (released April 2026 as part of React Email v6) produces materially better email HTML than our current TipTap-based `EmailEditor.tsx`, and to measure its bundle-size impact. The spike runs entirely in a git worktree, never touches production, and ends with a written recommendation. No code is merged to `main` from this work.

## Goals

- Decide cheaply, with evidence, whether to invest in migrating `components/emails/EmailEditor.tsx` to `@react-email/editor`.
- Confirm that the new editor's image-upload integration cleanly hosts our existing `/api/upload/broadcast-image` endpoint.
- Compare real-inbox rendering (Gmail web + iCloud Mail) of an identical broadcast composed in both editors.
- Measure the bundle-size delta the new package adds to the admin route.

## Non-goals

- Shipping anything to production.
- A feature flag, per-community toggle, or side-by-side option in the live admin UI.
- Schema changes to `email_broadcasts` (e.g., a `format_version` column).
- Drafts/auto-save.
- Removing or refactoring the existing `EmailEditor.tsx`.
- Outlook desktop testing (out of audience scope unless data shows otherwise).

## Background

### Current state

`components/emails/EmailEditor.tsx` (127 lines) is a TipTap StarterKit editor with a custom toolbar (bold, italic, h1, h2, bullet/ordered lists, link, image, alignment, clear-formatting). It produces generic semantic HTML (`<p>`, `<h1>`, `<ul>`, `<img>`) which is stored verbatim in `email_broadcasts.html_content` and sent via Resend (`resend@^6.0.1`). Image uploads go through `/api/upload/broadcast-image` and return `{ url }`. There is no drafts feature; the composer always sends.

### What `@react-email/editor` adds

Per https://react.email/docs (fetched 2026-04-28):

- Same engine (TipTap + ProseMirror), but ships **35+ email-aware nodes** that serialize to **table-based HTML with inlined styles** — the format mail clients actually want.
- Helper export `composeReactEmail()` for HTML + plaintext export.
- Five entry points: `/core`, `/extensions`, `/ui`, `/plugins`, `/utils`.
- Built-in support for bubble menu, slash commands, theming.

### Confirmed `EmailEditor` API

```ts
import { EmailEditor } from '@react-email/editor';

<EmailEditor
  content={initialHtmlOrJson}
  onUpdate={(ref) => { const html = ref.getEmailHTML(); /* ... */ }}
  onReady={(ref) => { /* ... */ }}
  onUploadImage={async (file) => { /* return { url } */ }}
  placeholder="Write your email…"
  theme="basic"
  // also: editable, extensions, bubbleMenu, className, children
/>
```

Key facts: requires React 18+, must be a client component (TipTap needs DOM), HTML is read via `ref.getEmailHTML()`, and image uploads are a single prop — not a custom Extension.

### Why this matters

Two of the three risks from our initial framing are now resolved by the docs: image-upload integration is a 5-line wrapper, and editing UX is unlikely to surprise (same TipTap engine). The remaining risks are real-inbox rendering quality and bundle-size cost — both of which need empirical answers, not more docs reading.

## Approach

### Worktree

Created at `/home/debian/apps/dance-hub-spike-react-email-editor` off `main`. All installs, builds, and dev-server runs happen in this worktree only — never in `/home/debian/apps/dance-hub` (pm2 serves prod from there).

Branch name: `spike/react-email-editor`.

### Spike route

A single new client-component route in the worktree at `app/spike/email-editor/page.tsx` (no auth gate beyond what the rest of admin uses; this is dev-only). Layout:

- **Top half:** mounted `<EmailEditor>` with `onUploadImage` wired to `/api/upload/broadcast-image` (existing endpoint, unchanged) and `onUpdate` capturing `ref.getEmailHTML()` into local state.
- **Bottom half:** a live `<pre>` showing the captured HTML, plus a "Send to test inbox" button that POSTs the HTML to a small ad-hoc handler at `app/api/spike/send/route.ts` which calls Resend with the captured HTML. Recipient defaults to `delivered@resend.dev`; an input lets us swap in a real Gmail or iCloud address.

No changes to `email_broadcasts`, no changes to existing admin pages, no changes to `EmailComposer.tsx`.

### Test sequence

Stop early at any step if the answer becomes obvious.

1. **Coverage send.** In the new editor, build a single message exercising every formatting feature we care about: h1, h2, paragraph with bold + italic + link, bullet list, ordered list, image upload, left/center/right alignment. Send to `delivered@resend.dev`. Inspect the raw HTML in Resend's dashboard. Confirm that output is table-based with inlined styles (the central question).
2. **Real broadcast clone.** Re-create the most recent real broadcast from `email_broadcasts` (sent_at DESC LIMIT 1) inside the new editor. Send to a Gmail inbox and an iCloud inbox we control. Compare visually against the original TipTap-rendered version, side-by-side.
3. **Bundle delta.** Run `bun run build` in the worktree before adding `@react-email/editor` (baseline) and again after the spike route is wired up. Compare First Load JS for `/admin/emails/new` and the new `/spike/email-editor` route.

### Findings document

Write `SPIKE-FINDINGS.md` in the worktree root, structured as:

- **Verdict:** one of `proceed-to-replace`, `proceed-to-feature-flag`, or `keep-tiptap`, with one paragraph of reasoning.
- **HTML output comparison:** snippets of both editors' HTML for the same content.
- **Real-inbox screenshots:** Gmail + iCloud, both editors, side-by-side.
- **Bundle delta:** First Load JS before/after, in KB.
- **Image-upload integration notes:** how clean the wire-up was; any rough edges.
- **Open questions:** anything we couldn't answer in the time-box.

The findings doc is what we hand off to whoever (likely the same session) decides the next step. The worktree is then discarded — `git worktree remove` once the doc is copied to `docs/superpowers/specs/`.

## Success criteria (decision matrix)

The spike succeeds (regardless of which way it points) if `SPIKE-FINDINGS.md` answers all four questions below with evidence:

| Question | Evidence required |
|---|---|
| Is the HTML output materially better? | Side-by-side raw HTML; tables + inline styles confirmed/denied. |
| Does it render visibly better in Gmail + iCloud? | Screenshots of identical content in both editors. |
| Is the image-upload integration clean? | The actual integration code, ≤20 lines. |
| What's the bundle cost? | First Load JS delta in KB on `/admin/emails/new`. |

## Risks and mitigations

- **Risk:** `@react-email/editor` is brand-new; we hit a bug that blocks the spike. **Mitigation:** time-box is 2-3 hours; if blocked, that itself is a finding (`keep-tiptap`).
- **Risk:** The new editor's HTML output is *similar* to TipTap, not dramatically better. **Mitigation:** that's a valid outcome; verdict becomes `keep-tiptap` and we save the migration cost.
- **Risk:** Building in the wrong directory and disturbing pm2-served prod. **Mitigation:** worktree is the entire point — every `bun add`, `bun run build`, and `bun dev` runs only inside the worktree path.

## Out of scope (explicit)

- Any change to `email_broadcasts` schema.
- Any change to `EmailComposer.tsx`, `BroadcastHistoryList.tsx`, `QuotaBadge.tsx`, or any other production file.
- Outlook (web or desktop) rendering tests.
- Drafts, scheduling, segmentation, analytics — same as v1 broadcast non-goals.
- A merge to `main`. The findings doc may be copied into `docs/superpowers/specs/` as a follow-up commit; the worktree itself is discarded.

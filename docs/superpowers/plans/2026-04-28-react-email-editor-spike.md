# React Email v6 Editor Spike — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a 2–3 hour worktree spike that mounts `@react-email/editor` against our existing image-upload endpoint, sends two test broadcasts (coverage + real-broadcast clone), measures the bundle delta, and produces a written verdict on whether to migrate from the current TipTap editor.

**Architecture:** Everything lives in a throwaway git worktree at `/home/debian/apps/dance-hub-spike-react-email-editor`. The worktree adds three small files (a server entry page, a client component mounting `EmailEditor`, and an ad-hoc Resend send route) and one findings doc. No production code is modified, no schema changes, no merge to main.

**Tech Stack:** Next.js 14 App Router, `@react-email/editor` (new in v6), `resend@^6.0.1`, Bun, the existing `/api/upload/broadcast-image` endpoint, Resend's `delivered@resend.dev` test address.

**Spec:** [`docs/superpowers/specs/2026-04-28-react-email-editor-spike-design.md`](../specs/2026-04-28-react-email-editor-spike-design.md)

---

## File structure

**Created in the worktree only (never in `/home/debian/apps/dance-hub`):**

```
app/spike/email-editor/page.tsx              # Server entry, renders the client component
app/spike/email-editor/SpikeEditorClient.tsx # 'use client' — mounts EmailEditor, captures HTML, send button
app/api/spike/send/route.ts                  # POST handler that calls Resend with the captured HTML
SPIKE-FINDINGS.md                            # Written at the end (worktree root)
build-baseline.txt                           # Captured `bun run build` output before adding the new package
build-after.txt                              # Captured `bun run build` output after the spike route is wired up
```

**Modified:** `package.json` and `bun.lockb` (only inside the worktree, only because of the `bun add` in Task 3).

**Not modified anywhere:** `components/emails/EmailEditor.tsx`, `components/emails/EmailComposer.tsx`, `app/[communitySlug]/admin/emails/**`, `email_broadcasts` schema, any production route. The existing `/api/upload/broadcast-image` is reused unchanged.

---

## Important environment notes

- **PM2 ports already in use on this box:** 3001 and 3100. The spike's dev server therefore runs on **port 3200** (`PORT=3200 bun dev`).
- **Auth on the image-upload endpoint:** `/api/upload/broadcast-image` calls `authorizeBroadcastAccess(communitySlug)`, which requires a logged-in user with admin access to a real community. The spike must therefore be tested while logged into a community you own. Use your own community's slug for `communitySlug`.
- **Resend `from` address:** the verified domain is `dance-hub.io`. Use `notifications@dance-hub.io` (matches the default in `lib/resend/email-service.ts`).
- **Env file:** copy `.env.local` from the main repo into the worktree at task 1. The worktree is throwaway, so any local edits are isolated.

---

## Task 1: Create the worktree and install dependencies

**Files:** none yet (we're creating the worktree itself).

- [ ] **Step 1: Create the worktree off `main`**

```bash
git -C /home/debian/apps/dance-hub worktree add -b spike/react-email-editor /home/debian/apps/dance-hub-spike-react-email-editor main
```

Expected: `Preparing worktree (new branch 'spike/react-email-editor') ... HEAD is now at <sha>`.

- [ ] **Step 2: Copy env file from main repo into the worktree**

```bash
cp /home/debian/apps/dance-hub/.env.local /home/debian/apps/dance-hub-spike-react-email-editor/.env.local
```

Expected: no output. This is one-way (main → worktree). Do not copy anything back.

- [ ] **Step 3: Install dependencies inside the worktree**

```bash
cd /home/debian/apps/dance-hub-spike-react-email-editor && bun install
```

Expected: `Done in <X>ms`. No errors. (If you see peer-dep warnings about React 18, ignore — Next 14 ships React 18.)

- [ ] **Step 4: Sanity-check the worktree boots**

```bash
cd /home/debian/apps/dance-hub-spike-react-email-editor && PORT=3200 bun dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3200
kill %1 2>/dev/null
```

Expected: HTTP 200 (or 307 if redirected to login — both confirm the server is up). If you see "Address already in use", another worktree is on 3200; pick 3201 and use that for the rest of the plan.

- [ ] **Step 5: Commit (worktree state)**

No files changed yet beyond `.env.local` (which is gitignored). Skip the commit — the next task produces the first commit-worthy change.

---

## Task 2: Capture the baseline production build (before adding the new package)

**Files:**
- Create: `build-baseline.txt` (worktree root, gitignored — kept locally for the findings doc)

- [ ] **Step 1: Run a production build and capture the output**

```bash
cd /home/debian/apps/dance-hub-spike-react-email-editor && bun run build 2>&1 | tee build-baseline.txt
```

Expected: build succeeds, route table prints with sizes per route. The line for `/[communitySlug]/admin/emails/new` shows a `First Load JS` value (e.g. `~340 kB`). If the build fails for any reason, stop and resolve it before continuing — a non-baseline build invalidates the bundle measurement.

- [ ] **Step 2: Verify the relevant route is in the output**

```bash
grep -E "admin/emails/new|First Load JS" build-baseline.txt | head -10
```

Expected: at least one line containing `admin/emails/new` with a size next to it.

---

## Task 3: Add `@react-email/editor`

**Files:**
- Modify: `package.json` (worktree)
- Modify: `bun.lockb` (worktree)

- [ ] **Step 1: Add the package**

```bash
cd /home/debian/apps/dance-hub-spike-react-email-editor && bun add @react-email/editor
```

Expected: package added; version is `^6.x`. If install fails because of peer-dep on React 19, stop — that's a real finding for the spec, write it into `SPIKE-FINDINGS.md` immediately and abort the rest of the plan.

- [ ] **Step 2: Confirm the install**

```bash
grep '"@react-email/editor"' package.json
```

Expected: a line like `"@react-email/editor": "^6.0.0"` (or whatever the current published version is).

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "spike: add @react-email/editor for evaluation"
```

---

## Task 4: Build the spike client component

**Files:**
- Create: `app/spike/email-editor/SpikeEditorClient.tsx`

- [ ] **Step 1: Create the client component**

Replace `YOUR-COMMUNITY-SLUG` with your own community slug — the image-upload endpoint requires a real community for which you have admin access.

```tsx
'use client';

import { useState } from 'react';
import { EmailEditor } from '@react-email/editor';

const COMMUNITY_SLUG = 'YOUR-COMMUNITY-SLUG';

export function SpikeEditorClient() {
  const [html, setHtml] = useState('');
  const [recipient, setRecipient] = useState('delivered@resend.dev');
  const [subject, setSubject] = useState('Spike: React Email v6 editor');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const handleUploadImage = async (file: File): Promise<{ url: string }> => {
    const form = new FormData();
    form.set('file', file);
    form.set('communitySlug', COMMUNITY_SLUG);
    const res = await fetch('/api/upload/broadcast-image', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return { url: data.url };
  };

  const handleSend = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/spike/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipient, html, subject }),
      });
      const data = await res.json();
      setSendResult(res.ok ? `Sent — id: ${data.id ?? '(no id)'}` : `Error: ${data.error ?? res.statusText}`);
    } catch (e) {
      setSendResult(`Error: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold">React Email v6 editor — spike</h1>
        <p className="text-sm text-muted-foreground">
          Throwaway evaluation. Logged-in admin required for image uploads (community slug: {COMMUNITY_SLUG}).
        </p>
      </header>

      <div className="border rounded-lg overflow-hidden">
        <EmailEditor
          content={"<h1>Hello</h1><p>Type something here.</p>"}
          onUpdate={(ref) => setHtml(ref.getEmailHTML())}
          onUploadImage={handleUploadImage}
          placeholder="Write your email…"
        />
      </div>

      <div className="space-y-3">
        <div className="flex gap-3">
          <label className="flex-1">
            <span className="block text-sm font-medium mb-1">Recipient</span>
            <input
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            />
          </label>
          <label className="flex-1">
            <span className="block text-sm font-medium mb-1">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            />
          </label>
        </div>
        <button
          onClick={handleSend}
          disabled={sending || !html}
          className="px-4 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send test'}
        </button>
        {sendResult && <p className="text-sm">{sendResult}</p>}
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-medium">Captured HTML</summary>
        <pre className="mt-2 bg-muted p-4 rounded text-xs overflow-x-auto whitespace-pre-wrap">{html}</pre>
      </details>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/spike/email-editor/SpikeEditorClient.tsx
git commit -m "spike: client component mounting @react-email/editor"
```

---

## Task 5: Build the spike route page

**Files:**
- Create: `app/spike/email-editor/page.tsx`

- [ ] **Step 1: Create the server entry**

```tsx
import { SpikeEditorClient } from './SpikeEditorClient';

export const dynamic = 'force-dynamic';

export default function SpikeEmailEditorPage() {
  return <SpikeEditorClient />;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/spike/email-editor/page.tsx
git commit -m "spike: route page for the email-editor evaluation"
```

---

## Task 6: Build the spike send-email API route

**Files:**
- Create: `app/api/spike/send/route.ts`

- [ ] **Step 1: Create the send route**

```ts
import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const FROM = 'Dance Hub Spike <notifications@dance-hub.io>';

export async function POST(req: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const to = body?.to as string | undefined;
  const html = body?.html as string | undefined;
  const subject = (body?.subject as string | undefined) ?? 'Spike test';

  if (!to || !html) {
    return NextResponse.json({ error: 'Missing to or html' }, { status: 400 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const result = await resend.emails.send({ from: FROM, to, subject, html });
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 502 });
    }
    return NextResponse.json({ id: result.data?.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/spike/send/route.ts
git commit -m "spike: ad-hoc send route for editor evaluation"
```

---

## Task 7: Capture the post-install bundle

**Files:**
- Create: `build-after.txt` (worktree root, gitignored, kept locally)

- [ ] **Step 1: Run a production build and capture the output**

```bash
cd /home/debian/apps/dance-hub-spike-react-email-editor && bun run build 2>&1 | tee build-after.txt
```

Expected: build succeeds. Note: `bun run build` for the spike worktree must NOT run inside `/home/debian/apps/dance-hub` (the main repo) — pm2 serves prod from there and a build there is a known footgun.

- [ ] **Step 2: Compute the bundle delta**

```bash
cd /home/debian/apps/dance-hub-spike-react-email-editor
echo "BASELINE:"
grep -E "admin/emails/new|/spike/email-editor" build-baseline.txt | head -5
echo "AFTER:"
grep -E "admin/emails/new|/spike/email-editor" build-after.txt | head -5
```

Expected: the `admin/emails/new` line appears in both (size unchanged — we didn't modify it). The `/spike/email-editor` line appears only in `build-after.txt`. Note both First Load JS numbers — the `/spike/email-editor` size is the cost the new editor would add to a route that imports it.

---

## Task 8: 🛑 Pause — request user join for the human-driven test sequence

**The spike is now fully wired and measured. Tasks 9–10 need the user to drive: composing in the editor, sending to real Gmail/iCloud inboxes, and judging inbox rendering side-by-side.**

- [ ] **Step 1: Tell the user the spike is ready**

Message verbatim:

> The spike is wired up and bundle-measured. The dev server starts at `http://localhost:3200/spike/email-editor`. To run the test sequence (Tasks 9 and 10), I need you alongside — you'll be composing the test broadcasts and judging the inbox rendering. Ready to start?

- [ ] **Step 2: Wait for user**

Do not proceed to Task 9 until the user confirms.

---

## Task 9: Smoke test + Coverage send (with the user)

**Files:** none — this is a manual evaluation step.

**Test goal:** verify the spike works end-to-end (smoke), then verify the new editor's HTML output is table-based with inline styles (the central question) by exercising every formatting feature we use today.

- [ ] **Step 1: Start the dev server on port 3200**

```bash
cd /home/debian/apps/dance-hub-spike-react-email-editor && PORT=3200 bun dev
```

Expected: Next.js prints `Local: http://localhost:3200` and the editor route compiles when first hit.

- [ ] **Step 2: User logs in on `localhost:3200`**

In your browser, go through the normal login flow on the worktree dev server. Auth cookies are scoped per port, so this is independent of any session on the production site.

- [ ] **Step 3: Visit `http://localhost:3200/spike/email-editor` and smoke-check**

Expected: the editor mounts, toolbar/bubble menu is visible, the placeholder text shows, the `Captured HTML` `<details>` updates as you type. If the editor doesn't mount, stop here and debug — no point continuing the test sequence with broken wiring.

- [ ] **Step 4: User composes a coverage message in the editor**

Compose a message that hits every feature we use today:

- An H1
- An H2
- A paragraph with **bold**, *italic*, and a [link to https://dance-hub.io](https://dance-hub.io)
- A bullet list with 3 items
- An ordered list with 3 items
- An uploaded image (drag-drop a small JPEG — this also smoke-tests the image-upload integration; a 401/403 means the `COMMUNITY_SLUG` constant is wrong)
- A paragraph aligned center
- A paragraph aligned right

Watch the `Captured HTML` `<details>` as you type. First impression: does it look like email HTML (tables, inline `style=""`) or plain `<p>`/`<h1>`?

- [ ] **Step 5: Send to `delivered@resend.dev`**

Set recipient to `delivered@resend.dev` and click `Send test`. Expected: `Sent — id: ...` appears, and the email shows up in the Resend dashboard within a few seconds. (You won't receive a real inbox email — that test address is for delivery confirmation only.)

- [ ] **Step 6: Inspect the raw HTML in the Resend dashboard**

Open https://resend.com/emails and click into the just-sent email. Copy the rendered HTML body into a local file in the worktree (gitignored — for the findings doc):

```bash
cd /home/debian/apps/dance-hub-spike-react-email-editor
$EDITOR coverage-send-output.html
```

- [ ] **Step 7: Decide whether to continue**

If the HTML output is clearly NOT table-based (i.e. the new editor produces the same generic HTML as TipTap), the verdict is `keep-tiptap` — skip Task 10 and jump to Task 11 (write findings).

If the HTML output IS table-based with inlined styles, continue to Task 10 for the real-inbox comparison.

---

## Task 10: Test 2 — Real broadcast clone (with the user)

**Files:** none.

**Test goal:** see the new editor's output rendered in real Gmail and real iCloud inboxes, side-by-side with the existing TipTap output of an identical broadcast.

- [ ] **Step 1: Pick a recent broadcast to clone**

User selects one of their recent real broadcasts — ideally one with mixed content (heading + paragraph + list + image). Pull the rendered HTML so we have a reference for what the existing editor produces:

```bash
psql "$DATABASE_URL" -c "SELECT id, subject, html_content FROM email_broadcasts ORDER BY sent_at DESC NULLS LAST LIMIT 1" > recent-broadcast.txt
```

(Or use whatever DB client is convenient. Exact tool doesn't matter — we just need the source content to re-author from, not the rendered HTML for diffing.)

- [ ] **Step 2: Re-author the same content in the new editor**

User types/pastes the broadcast's text into the new editor on `localhost:3200`, applying the same headings, lists, images, alignment as the original. Aim for visual parity with the original message.

- [ ] **Step 3: Send the new-editor version to a Gmail and an iCloud inbox**

User provides two real addresses they control. Send twice (one per address) using the `Send test` button. Subject: `Spike v6 - <original subject>` so it's distinguishable.

- [ ] **Step 4: Find or send the original (TipTap) version to the same two inboxes**

Either: locate the original in those inboxes (if the user was already a recipient when it was sent), or: re-send the original from the production admin UI to the same Gmail/iCloud addresses.

- [ ] **Step 5: Compare side-by-side and screenshot**

Open both messages in Gmail (web), then in iCloud (web at icloud.com or the iOS Mail app). Take screenshots of each, side-by-side. Save into the worktree:

```bash
cd /home/debian/apps/dance-hub-spike-react-email-editor
mkdir -p findings-screenshots
# Save: gmail-tiptap.png, gmail-v6.png, icloud-tiptap.png, icloud-v6.png
```

- [ ] **Step 6: User judges**

User compares: heading rendering, list spacing, image sizing, link colors, dark-mode behavior, any obvious breakages. The user's verdict drives the recommendation in `SPIKE-FINDINGS.md`.

---

## Task 11: Write `SPIKE-FINDINGS.md`

**Files:**
- Create: `SPIKE-FINDINGS.md` (worktree root)

- [ ] **Step 1: Write the findings doc using this exact structure**

```markdown
# React Email v6 Editor Spike — Findings

**Date:** 2026-04-28
**Spec:** docs/superpowers/specs/2026-04-28-react-email-editor-spike-design.md

## Verdict

One of: `proceed-to-replace` / `proceed-to-feature-flag` / `keep-tiptap`.

[One paragraph of reasoning citing evidence from the sections below.]

## HTML output comparison

### TipTap (current)
```html
[Excerpt of html_content from a recent real broadcast — first ~30 lines]
```

### @react-email/editor (v6)
```html
[Excerpt from coverage-send-output.html — first ~30 lines]
```

[1–2 sentences pointing out the structural difference: tables vs. semantic, inline styles vs. classes.]

## Real-inbox screenshots

Saved in `findings-screenshots/`:
- `gmail-tiptap.png` / `gmail-v6.png`
- `icloud-tiptap.png` / `icloud-v6.png`

[1–2 sentences summarising what the screenshots show.]

## Bundle delta

- `/admin/emails/new` First Load JS — baseline: `XXX kB`, after spike: `YYY kB` (delta: `±Z kB`).
- `/spike/email-editor` First Load JS (new route): `WWW kB`.

[Note: the spike route adds the editor's full footprint; a real migration would replace TipTap so the net delta on `/admin/emails/new` would differ.]

## Image-upload integration

Wire-up code (verbatim from `SpikeEditorClient.tsx`):
```tsx
const handleUploadImage = async (file: File): Promise<{ url: string }> => { ... };
```

[1–2 sentences on whether the integration was clean. Any rough edges, error-handling gaps, or DX surprises.]

## Open questions

- [Anything that came up that the spike couldn't answer in the time-box.]
```

- [ ] **Step 2: Commit (worktree branch)**

```bash
cd /home/debian/apps/dance-hub-spike-react-email-editor
git add SPIKE-FINDINGS.md
git commit -m "spike: findings document"
```

Note: `coverage-send-output.html`, `recent-broadcast.txt`, `findings-screenshots/`, `build-baseline.txt`, `build-after.txt` are kept locally only — they're scratch artefacts that don't belong in version control.

---

## Task 12: Decide next step and clean up

**Files:** depending on the decision.

- [ ] **Step 1: Tell the user the findings are ready**

Message verbatim:

> Findings written to `SPIKE-FINDINGS.md` in the worktree. Verdict: `<value>`. Want to: (a) copy the findings doc into `docs/superpowers/specs/` of the main repo for posterity then drop the worktree, or (b) keep the worktree alive while we plan the next step?

- [ ] **Step 2 (option a — recommended): Copy findings into main repo and remove the worktree**

```bash
# From the main repo
cp /home/debian/apps/dance-hub-spike-react-email-editor/SPIKE-FINDINGS.md \
   /home/debian/apps/dance-hub/docs/superpowers/specs/2026-04-28-react-email-editor-spike-findings.md
cd /home/debian/apps/dance-hub
git add -f docs/superpowers/specs/2026-04-28-react-email-editor-spike-findings.md
git commit -m "docs: findings from React Email v6 editor spike"

# Then remove the worktree
git worktree remove /home/debian/apps/dance-hub-spike-react-email-editor
git branch -D spike/react-email-editor
```

- [ ] **Step 2 (option b): Keep the worktree**

Do nothing further. The worktree and `spike/react-email-editor` branch remain available for follow-on experiments.

- [ ] **Step 3: If the verdict is `proceed-to-replace` or `proceed-to-feature-flag`, brainstorm the migration**

That's a separate project — it gets its own spec via `superpowers:brainstorming`, then its own plan via `superpowers:writing-plans`. Do not start migration work in the spike worktree.

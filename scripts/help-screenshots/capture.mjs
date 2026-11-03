// Takes every help center screenshot, on a phone and on a computer, from the
// demo community on a local build that uses the PREPROD env. See README.md.
//
//   BASE_URL=http://localhost:3917 DATABASE_URL=... node scripts/help-screenshots/capture.mjs [shot-id ...]
//
// Saves public/help/shots/{phone,desktop}/<id>.webp and records each image's
// size in lib/help/shots.json.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.BASE_URL ?? "http://localhost:3917";
const COMMUNITY = `${BASE}/salsa-with-ana`;
const DB = process.env.DATABASE_URL;
const EMAIL = "delivered+help-demo@resend.dev";
const PASSWORD = process.env.HELP_DEMO_PASSWORD ?? readFileSync(path.join(homedir(), ".config/dance-hub/help-demo.pw"), "utf8").trim();
const MANIFEST = path.join(ROOT, "lib/help/shots.json");

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1.5 },
};

/** Runs SQL on the preprod database, passing the credentials in the environment (not in ps). */
const sql = (query) => {
  if (!DB) throw new Error("DATABASE_URL (preprod) is needed for this shot");
  const url = new URL(DB);
  if (!url.pathname.includes("preprod")) throw new Error(`Refusing to touch ${url.pathname.slice(1)}: the screenshots use preprod only`);
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1),
  };
  return execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-c", query], { env }).toString().trim();
};

/** The card around a section heading (the admin pages' sections). */
const section = (page, labelId) => page.locator(`section[aria-labelledby="${labelId}"]`);

async function open(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}

async function tap(page, device, locator) {
  if (device === "phone") await locator.tap();
  else await locator.click();
  await page.waitForTimeout(700);
}

/** Each shot: where to go, what to do, and what to capture (a locator, or the screen when it returns nothing). */
const SHOTS = {
  "open-admin": {
    async take(page, device) {
      await open(page, COMMUNITY);
      if (device === "phone") {
        await tap(page, device, page.getByRole("button", { name: "More" }).last());
        return null;
      }
      const button = page.getByRole("link", { name: "Manage community" }).or(page.getByRole("button", { name: "Manage community" })).first();
      await button.scrollIntoViewIfNeeded();
      return { band: button, above: 160, below: 120 };
    },
  },
  "who-can-join": {
    async take(page) {
      await open(page, `${COMMUNITY}/admin/general`);
      return section(page, "st-h");
    },
  },
  "about-closed": {
    visitor: true,
    async before() {
      this.status = sql("SELECT status FROM communities WHERE slug = 'salsa-with-ana'");
      sql("UPDATE communities SET status = 'inactive' WHERE slug = 'salsa-with-ana'");
    },
    async after() {
      if (this.status) sql(`UPDATE communities SET status = '${this.status.replace(/[^a-z_]/g, "")}' WHERE slug = 'salsa-with-ana'`);
    },
    async take(page) {
      await open(page, `${COMMUNITY}/about`);
      return page.getByRole("heading", { name: "Not taking new members" }).locator("xpath=..");
    },
  },
  "about-owner": {
    async take(page) {
      await open(page, `${COMMUNITY}/about`);
      return null;
    },
  },
  "about-edit": {
    async take(page) {
      await open(page, `${COMMUNITY}/about?edit=1`);
      const banner = page.getByText("You're editing your About page");
      await banner.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -90));
      return null;
    },
  },
  "add-block": {
    async take(page, device) {
      await open(page, `${COMMUNITY}/about?edit=1`);
      await tap(page, device, page.getByRole("button", { name: /Add block/ }).first());
      return device === "phone" ? null : page.getByRole("dialog");
    },
  },
  "about-visitor": {
    // The owner's preview, which is what the step describes.
    async take(page, device) {
      await open(page, `${COMMUNITY}/about`);
      await tap(page, device, page.getByRole("button", { name: "See it as a visitor" }));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      return null;
    },
  },
  "classroom-owner": {
    async take(page) {
      await open(page, `${COMMUNITY}/classroom`);
      return null;
    },
  },
  "create-course": {
    async take(page, device) {
      await open(page, `${COMMUNITY}/classroom`);
      await tap(page, device, page.getByRole("button", { name: "Create course" }).first());
      return device === "phone" ? null : page.getByRole("dialog");
    },
  },
  "lessons-edit": {
    async take(page, device) {
      await open(page, `${COMMUNITY}/classroom/salsa-basics`);
      await tap(page, device, page.getByRole("button", { name: "Edit content" }));
      if (device === "phone") {
        await tap(page, device, page.getByRole("button", { name: /^Lessons/ }));
        return null;
      }
      return page.locator('nav[aria-label="Lessons"]:visible').first();
    },
  },
  "lesson-edit": {
    async take(page, device) {
      await open(page, `${COMMUNITY}/classroom/salsa-basics`);
      await tap(page, device, page.getByRole("button", { name: "Edit content" }));
      if (device === "phone") return null;
      return page.locator("div.min-w-0.flex-col.gap-5").filter({ has: page.getByText("Add a video") }).first();
    },
  },
  "course-settings": {
    async take(page, device) {
      await open(page, `${COMMUNITY}/classroom/salsa-basics`);
      await tap(page, device, page.getByRole("button", { name: "Course settings" }));
      return device === "phone" ? null : page.getByRole("dialog");
    },
  },
  "course-order": {
    async take(page) {
      await open(page, `${COMMUNITY}/classroom`);
      return page.locator("article").filter({ hasText: "Turns and Partnerwork" });
    },
  },
  onboarding: {
    async take(page) {
      await open(page, `${BASE}/onboarding`);
      return null;
    },
  },
  offerings: {
    async take(page) {
      await open(page, `${COMMUNITY}/admin/offerings`);
      return null;
    },
  },
  "admin-overview": {
    async take(page) {
      await open(page, `${COMMUNITY}/admin`);
      return null;
    },
  },
  "calendar-owner": {
    async take(page) {
      await open(page, `${COMMUNITY}/calendar`);
      return null;
    },
  },
  "schedule-class": {
    async take(page, device) {
      await open(page, `${COMMUNITY}/calendar`);
      await tap(page, device, page.getByRole("button", { name: "Schedule class" }).first());
      return device === "phone" ? null : page.getByRole("dialog");
    },
  },
  "class-details": {
    async take(page, device) {
      await open(page, `${COMMUNITY}/calendar`);
      await tap(page, device, page.getByRole("button", { name: /^(Details for Salsa Basics|Salsa Basics: live practice,)/ }).first());
      return device === "phone" ? null : page.getByRole("dialog");
    },
  },
  "lessons-owner": {
    async take(page) {
      await open(page, `${COMMUNITY}/private-lessons`);
      return null;
    },
  },
  "lesson-type": {
    async take(page, device) {
      await open(page, `${COMMUNITY}/private-lessons`);
      await tap(page, device, page.getByRole("button", { name: "Add lesson type" }).first());
      return device === "phone" ? null : page.getByRole("dialog");
    },
  },
  "open-times": {
    async take(page, device) {
      await open(page, `${COMMUNITY}/private-lessons`);
      await tap(page, device, page.getByRole("button", { name: "Open times" }).first());
      return device === "phone" ? null : page.getByRole("dialog");
    },
  },
  "feed-composer": {
    async take(page, device) {
      await open(page, COMMUNITY);
      await tap(page, device, page.getByText("Share a question or a win…").first());
      const post = page.getByRole("button", { name: "Post", exact: true });
      await post.scrollIntoViewIfNeeded();
      return device === "phone" ? null : page.locator("form").filter({ has: post }).first();
    },
  },
  "post-topics": {
    async take(page, device) {
      await open(page, `${COMMUNITY}/admin/thread-categories`);
      await tap(page, device, page.getByRole("button", { name: "Add topic" }).first());
      // A named topic reads better than an empty row; it's never saved.
      await page.getByPlaceholder("Topic name").last().fill("Technique");
      return null;
    },
  },
  members: {
    async take(page) {
      await open(page, `${COMMUNITY}/admin/members`);
      return null;
    },
  },
  "new-email": {
    async take(page) {
      await open(page, `${COMMUNITY}/admin/emails/new`);
      return null;
    },
  },
  "promo-codes": {
    // The form needs a paid membership; the demo gets a pretend one for the
    // shot (no codes exist, so nothing asks the payment provider about them).
    async before() {
      this.saved = sql(
        "SELECT json_build_object('enabled', membership_enabled, 'price', membership_price, 'account', stripe_account_id, 'priceId', stripe_price_id) FROM communities WHERE slug = 'salsa-with-ana'"
      );
      sql("UPDATE communities SET membership_enabled = true, membership_price = 25, stripe_account_id = 'acct_help_demo', stripe_price_id = 'price_help_demo' WHERE slug = 'salsa-with-ana'");
    },
    async after() {
      if (!this.saved) return;
      const v = JSON.parse(this.saved);
      const lit = (x) => (x === null ? "NULL" : `'${String(x).replace(/'/g, "''")}'`);
      sql(`UPDATE communities SET membership_enabled = ${v.enabled === null ? "NULL" : v.enabled}, membership_price = ${v.price === null ? "NULL" : Number(v.price)}, stripe_account_id = ${lit(v.account)}, stripe_price_id = ${lit(v.priceId)} WHERE slug = 'salsa-with-ana'`);
    },
    async take(page) {
      await open(page, `${COMMUNITY}/admin/promo-codes`);
      return null;
    },
  },
  "toolbar-names": {
    async take(page, device) {
      await open(page, COMMUNITY);
      await tap(page, device, page.getByText("Share a question or a win…").first());
      const bold = page.locator('button[aria-label="Bold"]:visible').first();
      await bold.scrollIntoViewIfNeeded();
      if (device === "phone") await bold.tap();
      else await bold.hover();
      await page.waitForTimeout(device === "phone" ? 250 : 900);
      return { band: bold, above: 140, below: 160 };
    },
  },
  payouts: {
    async take(page) {
      await open(page, `${COMMUNITY}/admin/subscriptions`);
      return section(page, "pay-h");
    },
  },
  pricing: {
    async take(page) {
      await open(page, `${COMMUNITY}/admin/subscriptions`);
      return section(page, "price-h");
    },
  },
};

async function capture(page, target) {
  if (!target) return page.screenshot();
  if (target.band) {
    // A full-width strip of the screen around an element, for context.
    const box = await target.band.boundingBox();
    const vp = page.viewportSize();
    const y = Math.max(0, box.y - target.above);
    return page.screenshot({ clip: { x: 0, y, width: vp.width, height: Math.min(vp.height - y, box.height + target.above + target.below) } });
  }
  await target.scrollIntoViewIfNeeded();
  return target.screenshot();
}

const only = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
// The pixels per CSS pixel of each device, so the pages show every image at its real size at most.
manifest.scale = Object.fromEntries(Object.entries(DEVICES).map(([d, o]) => [d, o.deviceScaleFactor]));
manifest.shots ??= {};
const saveManifest = () => writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
// CHROMIUM_PATH: a browser binary, when Playwright's own download is missing.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

// One signed-in session for the teacher, reused by every owner shot.
const login = await browser.newContext();
const res = await login.request.post(`${BASE}/api/auth/sign-in/email`, { headers: { Origin: BASE }, data: { email: EMAIL, password: PASSWORD } });
if (!res.ok()) throw new Error(`Demo teacher sign-in failed: ${res.status()}`);
const ownerState = await login.storageState();
await login.close();

for (const [id, shot] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(id)) continue;
  await shot.before?.();
  try {
    for (const [device, options] of Object.entries(DEVICES)) {
      const context = await browser.newContext({ ...options, ...(shot.visitor ? {} : { storageState: ownerState }) });
      // The welcome tour that a new owner gets on the feed, marked as seen.
      await context.addInitScript(() => localStorage.setItem("onboarding-tour-completed-salsa-with-ana", "true"));
      const page = await context.newPage();
      const png = await capture(page, await shot.take(page, device));
      await context.close();
      const dir = path.join(ROOT, "public/help/shots", device);
      mkdirSync(dir, { recursive: true });
      const { width, height } = await sharp(png).webp({ quality: 80 }).toFile(path.join(dir, `${id}.webp`));
      manifest.shots[id] = { ...manifest.shots[id], [device]: [width, height] };
      // Saved after every image, so a failure later leaves no stale size.
      saveManifest();
      console.log(`${id} ${device} ${width}x${height}`);
    }
  } finally {
    await shot.after?.();
  }
}

await browser.close();

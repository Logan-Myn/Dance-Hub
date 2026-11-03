# Help center screenshots

The guides in `lib/help/articles` show screenshots of a demo community, taken
on a phone and on a computer. Retake them whenever the screens they show
change.

They come from **preprod data only**: a demo teacher, Ana Ruiz
(`delivered+help-demo@resend.dev`, a Resend test address), and her community
`salsa-with-ana`. Her password lives outside the repo, in
`~/.config/dance-hub/help-demo.pw` on the server (or `HELP_DEMO_PASSWORD`).

## Retake them

1. Build a worktree with the preprod env, with `BETTER_AUTH_URL` and
   `NEXT_PUBLIC_APP_URL` set to `http://localhost:3917`, and start it on that
   port (`bun run start -p 3917`).
2. If the demo community is missing, sign up Ana through the app, set her
   `emailVerified` to true, create the community "Salsa with Ana", then run
   `psql "$PREPROD_DATABASE_URL" -f scripts/help-screenshots/seed-demo.sql`.
3. Take the screenshots:

   ```sh
   BASE_URL=http://localhost:3917 DATABASE_URL="$PREPROD_DATABASE_URL" \
     node scripts/help-screenshots/capture.mjs            # all of them
   node scripts/help-screenshots/capture.mjs pricing     # or only some
   ```

   They're saved as `public/help/shots/{phone,desktop}/<id>.webp`, and their
   sizes in `lib/help/shots.json`. `about-closed` closes the demo community to
   new members for a moment, then opens it again.

A new screenshot needs an entry in `SHOTS` (capture.mjs) and an alt text in
`HELP_SHOT_ALT` (`lib/help/shots.ts`).

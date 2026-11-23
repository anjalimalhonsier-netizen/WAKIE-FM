# Wakie FM — ready-to-deploy public song request website

A mobile-friendly public request page with a shared queue, duplicate checks,
one vote per browser/device, Now Playing, and password-protected DJ controls.

## What it does / does not do

- Members submit requests using the public URL.
- Everyone sees the shared queue and can vote.
- Duplicate active requests are blocked.
- The DJ uses a private password to mark a track finished, skip, or play the next request.
- It does **not** read Wakie Club chat, post into Wakie, or stream audio.
- The DJ plays music separately using a music source they are authorised to use.
- Voting is one vote per browser/device, not verified Wakie identity.

## Step 1 — Create the database (Supabase)

1. Go to https://supabase.com/ and sign in.
2. Create a new project. Save the database password somewhere private.
3. Open **SQL Editor** → **New query**.
4. Open `supabase.sql` from this project, copy all of it, paste into the editor and click **Run**.
5. Open **Project Settings → API** (or **Data API / API Keys**, depending on the dashboard).
6. Copy the Project URL and the **service_role / secret** key. Keep the secret private.

## Step 2 — Put the project on GitHub

1. Go to https://github.com/ and create a repository called `wakie-fm`.
2. Upload the files and folders from this ZIP. Keep `server.js`, `package.json`, `supabase.sql`, and the `public` folder at the repository root.
3. Do not upload `.env` or any secret keys. `.gitignore` prevents this if you use git locally.

## Step 3 — Deploy on Render

1. Go to https://render.com/ and sign in.
2. Choose **New → Web Service** and connect your GitHub account/repository.
3. Select `wakie-fm`.
4. Runtime: **Node**. Build command: `npm install`. Start command: `npm start`.
5. In the service's **Environment** settings, add:
   - `SUPABASE_URL` = your Supabase Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service-role/secret key
   - `DJ_PASSWORD` = a long unique password (at least 16 characters)
6. Click **Create Web Service** and wait for deployment.
7. Open the `onrender.com` URL shown by Render. Your public request site should load.

## Step 4 — Open it on iPhone

1. Open the Render HTTPS URL in Safari.
2. Tap the Share icon.
3. Choose **Add to Home Screen**.
4. Name it **Wakie FM** and tap **Add**.
5. Share the same public URL in your Wakie club chat or club description.

## Step 5 — Run a club session

1. Members open the URL and submit song title + artist.
2. Members vote in the shared queue.
3. The DJ opens the DJ controls and enters the private DJ password.
4. The DJ plays the top request in their authorised music player.
5. Tap **Mark finished** when it ends, then **Play next** to put the next request in Now Playing. Or use **Skip current track**.

## Security and launch notes

- Never put `SUPABASE_SERVICE_ROLE_KEY` or `DJ_PASSWORD` in `public/index.html`, GitHub, or a public message.
- Keep DJ password private. Rotate it in Render environment settings if shared accidentally.
- This starter includes basic rate limits. Before a large public launch, add moderation/reporting, stronger anti-abuse controls, and monitoring.
- Ask Wakie for written permission before attempting any direct Wakie chat integration.
- Free hosting/database tiers may pause, sleep, or have usage limits. Check current provider terms before launch.

## Local test (optional)

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and fill in your Supabase values.
3. Run `npm install`, then `npm start`.
4. Open `http://localhost:3000`.

## Files

- `server.js` — API, rate limits, and DJ password checks
- `public/index.html` — purple mobile interface
- `public/manifest.webmanifest` and `public/icon.svg` — installable home-screen metadata/icon
- `supabase.sql` — database schema and atomic queue/vote functions

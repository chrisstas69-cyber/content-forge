# Deploying Dog Content Automation System to Vercel

This guide walks you through deploying the app to Vercel and setting up social media API keys from the dashboard UI.

---

## Prerequisites

- A free [Vercel account](https://vercel.com/signup)
- A GitHub account (Vercel deploys from Git)
- This project pushed to a GitHub repo

---

## Step 1: Push to GitHub

If you haven't already, push this project to a GitHub repository:

```bash
git init
git add .
git commit -m "Dog Content Automation System"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/dog-content-automation.git
git push -u origin main
```

---

## Step 2: Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select your `dog-content-automation` repo
4. Vercel auto-detects Next.js — leave the defaults
5. Click **Deploy**

Wait 2–3 minutes for the build to complete. You'll get a URL like `dog-content-automation-xyz.vercel.app`.

---

## Step 3: Set the Encryption Key on Vercel

This is the ONE environment variable you must set on Vercel — it encrypts all your API keys at rest in the database.

1. Open your terminal and generate a random 32-byte key:
   ```bash
   openssl rand -hex 32
   ```
   (Copy the output — it'll be 64 hex characters like `97e443cc...`)

2. In Vercel, go to your project → **Settings** → **Environment Variables**

3. Add a new variable:
   - **Key**: `ENCRYPTION_KEY`
   - **Value**: (paste the key you generated)
   - **Environment**: select all (Production, Preview, Development)

4. Click **Save**

5. Go to **Deployments** → click the **⋯** next to your latest deployment → **Redeploy**

---

## Step 4: Set Up the Database

Vercel doesn't have a persistent filesystem, so SQLite (the default) won't work in production. You need a real database.

### Easiest option: Vercel Postgres (free tier)

1. In your Vercel project → **Storage** tab → **Create Database** → **Postgres** (free)
2. Name it `dog-content-db` and click **Create**
3. Vercel auto-adds a `POSTGRES_URL` env var to your project
4. Update the `DATABASE_URL` env var in Vercel to use the Postgres URL (or just rename `POSTGRES_URL` → `DATABASE_URL`)

### Then update the Prisma datasource

Edit `prisma/schema.prisma` and change:
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```
to:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Then commit and push — Vercel will redeploy with Postgres.

---

## Step 5: Add API Keys from the Dashboard

Now the fun part. Open your deployed app at `https://your-app.vercel.app`:

1. Click the **API Keys** tab
2. For each platform you want to publish to:
   - Click the **Get keys** link to open that platform's developer portal
   - Create a developer app there
   - Set the OAuth Redirect URL in their console to:
     ```
     https://your-app.vercel.app/api/social/callback/[platform]
     ```
     (Replace `[platform]` with `youtube`, `tiktok`, `instagram`, `facebook`, or `x`)
   - Copy the Client ID and Client Secret from the platform
   - Paste them into the API Keys form
   - Click **Save [Platform] keys**

Repeat for each platform. Keys are encrypted before being stored in the database.

---

## Step 6: Connect Your Social Accounts

1. Go to the **Social** tab
2. For each platform that shows **API Ready**, click **Connect**
3. You'll be redirected to that platform's login page
4. Authorize the app
5. You'll be redirected back — the account now shows as connected with your handle

---

## Step 7: Upload Videos and Publish

1. Go to **Upload** tab → drag-and-drop your dog videos
2. The system auto-transcribes, edits (captions/watermark/music), scores, and prepares them
3. Go to **Library** → click **Publish** on any ready video
4. Select platforms → click **Publish to N**

🎉 Done!

---

## Platform-Specific Setup Notes

### YouTube (Google Cloud)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → enable **YouTube Data API v3**
3. Go to **APIs & Services → Credentials** → **Create Credentials → OAuth client ID**
4. Application type: **Web application**
5. Authorized redirect URIs: `https://your-app.vercel.app/api/social/callback/youtube`
6. Copy the Client ID and Client Secret

### TikTok
1. Go to [TikTok Developers](https://developers.tiktok.com/app/quickstart)
2. Create an app
3. Add scopes: `video.upload`, `video.publish`, `user.info.basic`
4. Redirect URI: `https://your-app.vercel.app/api/social/callback/tiktok`
5. Copy the Client Key and Client Secret

### Instagram + Facebook (Meta)
1. Go to [Meta Developers](https://developers.facebook.com/apps/)
2. Create an app with **Instagram** and **Facebook Pages** products
3. Add permissions: `instagram_content_publish`, `pages_manage_posts`, `pages_read_engagement`
4. Redirect URI: `https://your-app.vercel.app/api/social/callback/instagram` and `.../facebook`
5. Copy the App ID and App Secret
6. **Note**: IG/FB publishing requires videos hosted on a public URL. You'll need to set up S3 or Cloudinary storage for this to work fully.

### X (Twitter)
1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a project + app
3. Enable OAuth 2.0 with these scopes: `tweet.read`, `tweet.write`, `users.read`, `media.write`
4. Redirect URI: `https://your-app.vercel.app/api/social/callback/x`
5. Copy the Client ID and Client Secret

---

## Troubleshooting

**"YouTube API credentials are not set"** — Make sure you saved the keys in the API Keys tab and the platform shows "Configured" before clicking Connect.

**OAuth redirect fails** — Double-check the redirect URI matches exactly (including `https://` and `/api/social/callback/[platform]`).

**Database errors after Vercel deploy** — Make sure you switched from SQLite to Postgres (see Step 4).

**Build fails on Vercel** — Vercel needs to install FFmpeg. Add this to your `package.json`:
```json
"scripts": {
  "vercel-build": "apt-get update && apt-get install -y ffmpeg && prisma generate && prisma db push && next build"
}
```
Or use a `vercel.json` build config.

---

## Security Notes

- All API secrets are encrypted with AES-256-GCM before being stored in the database
- The encryption key (`ENCRYPTION_KEY`) is the only env var you need on Vercel
- **Keep your `ENCRYPTION_KEY` safe** — if you lose it, all stored secrets become undecryptable
- OAuth tokens for connected accounts are stored in the database (also encrypted at rest if you enable transparent disk encryption on your DB host)
- The app has no user authentication — anyone with the URL can access it. Add NextAuth.js login if you want to restrict access.

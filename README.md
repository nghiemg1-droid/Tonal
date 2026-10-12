# Tonal

[![CI](https://github.com/nghiemg1-droid/Tonal/actions/workflows/ci.yml/badge.svg)](https://github.com/nghiemg1-droid/Tonal/actions/workflows/ci.yml)

A social app built around **voice, photos, short videos and drawings**. Share a 60-second voice clip, a photo with music that plays while it's on screen, or a short video — and talk to friends in real-time chats with voice messages, stickers and view-once photos.

**Live app: [tonal-six.vercel.app](https://tonal-six.vercel.app)** — installable on phones as a web app (PWA).

## Features

**Posts, clips and feed**
- Voice posts (up to 60 s), photo posts and **short videos** (up to 60 s) with a full-screen vertical Clips feed
- Photos can play a song from an open-license music library (with credits) or your own recording while on screen
- Profile pages with bio, followers/following lists and a post grid; Explore grid and a page for every post
- Captions as text, a drawing or a voice note
- Likes with an animated heart, and comments as text, voice, photo or drawing
- Notifications for likes, comments and new followers, updated in real time

**Stories**
- 24-hour stories with an editor for text, stickers, multiple photos, music or your own voice
- Red ring for new stories, gray ring once you've seen them all
- "Seen by" list on your own stories

**Messages**
- One-to-one and group chats (up to 32 people) with real-time delivery
- Text, voice messages, photos, drawings, stickers and files up to 10 MB
- Reactions, replies, unsend, typing indicator and "Seen" status
- **View-once photos**: each person can open them one time, then the file is deleted

**Safety and privacy**
- Block (hides content both ways and stops messages), report, and full account deletion
- Photos are re-drawn in the browser before upload, which strips GPS and other hidden data
- Chat files live in a private bucket and are only served through links that expire
- [Privacy Policy](https://tonal-six.vercel.app/privacy) and [Terms](https://tonal-six.vercel.app/terms)

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Motion |
| Backend | Python, FastAPI (token-verified API) |
| Data | Supabase: Postgres, Auth, Storage, Realtime |
| Quality | Oxlint, TypeScript strict checks, Node test runner, pytest, GitHub Actions CI |

## How it works

- **Security lives in the database.** Every table has Row Level Security. Sensitive actions (creating groups, unsending, opening a view-once photo, deleting an account) go through Postgres functions that check permissions themselves, so a modified client can't bypass the rules.
- **Real time without a custom server.** New messages, reactions, "Seen" updates and notifications stream through Supabase Realtime; typing indicators use short-lived broadcast events that are never stored.
- **Cheap to run.** Inbox previews are kept up to date by a database trigger, feeds use cursor pagination, and images are resized and converted to WebP in the browser before upload.
- **View-once photos** are enforced server-side: the file can only be read for one minute after the database records that you opened it, and never again.

## Project structure

```
frontend/            React app (PWA)
  src/components/    UI pieces (post card, story viewer, chat parts…)
  src/pages/         One file per screen
  src/lib/           Supabase client and small helpers
  tests/             Unit tests (node --test)
backend/             FastAPI service
supabase/migrations/ Database schema, policies and functions, in order
.github/workflows/   CI
```

## Run locally

You need Node 22+, Python 3.12+ and a free Supabase project.

### 1. Database

In the Supabase dashboard, open **SQL Editor** and run every file in `supabase/migrations/` **in order** (`0001` → latest).

### 2. Frontend

```bash
cd frontend
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev            # http://localhost:5173
```

### 3. Backend (optional)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # fill in your Supabase values
uvicorn app.main:app --reload --port 8000   # docs at http://localhost:8000/docs
```

## Tests

```bash
cd frontend && npm run lint && npm run typecheck && npm test
cd backend && pytest
```

CI runs all of these, plus a production build, on every push.

## Roadmap

- Hashtags, mentions and saved posts
- Voice and video calls
- Native mobile app

## License

Personal portfolio project. All rights reserved.

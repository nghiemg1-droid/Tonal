# Tonal

A social media app where posts, comments and direct messages are shared through **voice and images** instead of text.

## Features (planned)

- Voice posts (up to 60 seconds) and image posts
- Feed, likes, and voice/image comments
- Real-time one-to-one messaging with voice and images
- Block, report, and full account deletion
- Installable on mobile as a web app

## Tech stack

- Frontend: React + TypeScript (Vite), Tailwind CSS
- Backend: Python + FastAPI
- Database, auth, storage, real-time: Supabase

## Status

In development, week 1 of 8 complete: sign up, log in and log out work end to end, and the FastAPI backend verifies Supabase login tokens.

## Run locally

### Frontend

```bash
cd frontend
cp .env.example .env   # then fill in your Supabase values
npm install
npm run dev
```

Opens at http://localhost:5173

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in your Supabase values
uvicorn app.main:app --reload --port 8000
```

API docs at http://localhost:8000/docs
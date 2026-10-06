import os

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_PUBLISHABLE_KEY"]

app = FastAPI(title="Tonal API")

# Allow the frontend (localhost:5173) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


async def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    """Check the Supabase login token sent by the frontend."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing login token")

    token = authorization.removeprefix("Bearer ")

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {token}"},
        )

    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired login")

    return res.json()


@app.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "email": user.get("email")}
import os

# Fake settings so the app can start without a real .env (e.g. on GitHub Actions)
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "test-key")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_me_needs_a_login_token():
    res = client.get("/me")
    assert res.status_code == 401
    assert res.json()["detail"] == "Missing login token"


def test_me_rejects_a_wrong_header():
    res = client.get("/me", headers={"Authorization": "Basic abc"})
    assert res.status_code == 401

from pathlib import Path

import pytest

from tests.conftest import make_client


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    root = tmp_path / "static"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("<!doctype html><title>Caronte</title>", encoding="utf-8")
    (root / "assets" / "app-abc123.js").write_text("console.log(1)", encoding="utf-8")
    (root / "favicon.svg").write_text("<svg/>", encoding="utf-8")
    (tmp_path / "secreto.txt").write_text("no deberías verme", encoding="utf-8")
    return root


@pytest.fixture
def web(sqlite_chinook, static_dir):
    with make_client(sqlite_chinook, static_dir=static_dir) as client:
        yield client


def test_index_and_spa_fallback(web):
    for path in ("/", "/login", "/c/chinook/t/Track?sort=-Name", "/c/chinook/estigia"):
        resp = web.get(path)
        assert resp.status_code == 200, path
        assert "<title>Caronte</title>" in resp.text
        assert "content-security-policy" in resp.headers


def test_assets_are_cached_forever(web):
    resp = web.get("/assets/app-abc123.js")
    assert resp.status_code == 200
    assert "immutable" in resp.headers["cache-control"]
    assert web.get("/favicon.svg").text == "<svg/>"


def test_unknown_api_routes_are_404_not_index(web):
    resp = web.get("/api/no-existe")
    assert resp.status_code == 404
    assert "Caronte" not in resp.text
    assert web.get("/api/health").json() == {"status": "ok"}


@pytest.mark.parametrize(
    "path", ["/../secreto.txt", "/%2e%2e/secreto.txt", "/assets/../../secreto.txt"]
)
def test_no_path_traversal(web, path):
    resp = web.get(path)
    assert "no deberías verme" not in resp.text


def test_without_static_dir_only_api(sqlite_chinook):
    with make_client(sqlite_chinook) as client:
        assert client.get("/").status_code == 404

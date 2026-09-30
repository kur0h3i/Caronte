from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import make_settings

CHINOOK_TABLES = [
    "Album",
    "Artist",
    "Customer",
    "Employee",
    "Genre",
    "Invoice",
    "InvoiceLine",
    "MediaType",
    "Playlist",
    "PlaylistTrack",
    "Track",
    "TrackReview",
]


def _meta(client, chinook, table: str) -> dict:
    resp = client.get(f"/api/connections/chinook/tables/{chinook.n(table)}/meta")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _types(meta: dict) -> dict[str, str]:
    return {c["name"]: c["type"] for c in meta["columns"]}


def _fks(meta: dict) -> dict[str, dict]:
    return {fk["columns"][0]: fk for fk in meta["foreign_keys"]}


def test_list_tables(client, chinook):
    resp = client.get("/api/connections/chinook/tables")
    assert resp.status_code == 200
    tables = {t["name"]: t for t in resp.json()}
    assert sorted(tables) == sorted(chinook.n(t) for t in CHINOOK_TABLES)

    track = tables[chinook.n("Track")]
    assert track["kind"] == "table"
    assert track["fk_count"] == 3
    assert tables[chinook.n("Artist")]["fk_count"] == 0
    assert tables[chinook.n("TrackReview")]["fk_count"] == 2
    # Aproximado: InnoDB estima, Postgres usa reltuples y SQLite cuenta.
    assert 3000 <= track["approx_rows"] <= 4000
    if chinook.engine != "mariadb":
        assert track["approx_rows"] == 3503


def test_track_meta(client, chinook):
    n = chinook.n
    meta = _meta(client, chinook, "Track")
    assert meta["name"] == n("Track")
    assert meta["primary_key"] == [n("TrackId")]

    types = _types(meta)
    assert types[n("TrackId")] == "int"
    assert types[n("Name")] == "text"
    assert types[n("Milliseconds")] == "int"
    assert types[n("UnitPrice")] == "numeric"

    fks = _fks(meta)
    assert set(fks) == {n("AlbumId"), n("GenreId"), n("MediaTypeId")}
    album = fks[n("AlbumId")]
    assert album["ref_table"] == n("Album")
    assert album["ref_columns"] == [n("AlbumId")]
    assert album["display_column"] == n("Title")
    assert album["joinable"] is True
    assert fks[n("GenreId")]["display_column"] == n("Name")
    assert fks[n("MediaTypeId")]["display_column"] == n("Name")


def test_display_column_fallbacks(client, chinook):
    n = chinook.n
    # Employee no tiene name/nombre pero sí Title (cargo).
    assert _fks(_meta(client, chinook, "Customer"))[n("SupportRepId")]["display_column"] == n(
        "Title"
    )
    # FK a sí misma.
    reports_to = _fks(_meta(client, chinook, "Employee"))[n("ReportsTo")]
    assert reports_to["ref_table"] == n("Employee")
    assert reports_to["display_column"] == n("Title")
    # Invoice no tiene ninguna columna prioritaria: primera columna de texto.
    invoice_fk = _fks(_meta(client, chinook, "InvoiceLine"))[n("InvoiceId")]
    assert invoice_fk["display_column"] == n("BillingAddress")
    # TrackReview -> Customer: Email está en la lista de prioridad.
    review_fks = _fks(_meta(client, chinook, "TrackReview"))
    assert review_fks[n("CustomerId")]["display_column"] == n("Email")


def test_type_normalization(client, chinook):
    n = chinook.n
    types = _types(_meta(client, chinook, "TrackReview"))
    assert types[n("Rating")] == "int"
    assert types[n("Verified")] == "bool"
    assert types[n("Details")] == "json"
    assert types[n("CreatedAt")] == "datetime"
    assert types[n("Comment")] == "text"
    # SQLite no tiene ENUM: la columna es texto con un CHECK.
    assert types[n("Mood")] == ("text" if chinook.engine == "sqlite" else "enum")

    invoice = _types(_meta(client, chinook, "Invoice"))
    assert invoice[n("InvoiceDate")] == "datetime"
    assert invoice[n("Total")] == "numeric"


def test_enum_values(client, chinook):
    if chinook.engine == "sqlite":
        return
    meta = _meta(client, chinook, "TrackReview")
    mood = next(c for c in meta["columns"] if c["name"] == chinook.n("Mood"))
    assert mood["enum_values"] == ["love", "like", "meh", "dislike"]


def test_unknown_table_is_400(client, chinook):
    for name in ["NoExiste", "track; DROP TABLE track", '"Track"', "Track--"]:
        resp = client.get(f"/api/connections/chinook/tables/{name}/meta")
        assert resp.status_code == 400, name


def test_unknown_connection_is_404(client):
    assert client.get("/api/connections/otra/tables").status_code == 404


def test_display_column_override(chinook):
    settings = make_settings()
    environ = {"CARONTE_DB_CHINOOK": chinook.url}
    app = create_app(settings, environ)
    registry = app.state.registry
    registry.get("chinook").config.display_columns = {chinook.n("Employee"): chinook.n("LastName")}
    with TestClient(app) as client:
        fks = _fks(_meta(client, chinook, "Customer"))
    assert fks[chinook.n("SupportRepId")]["display_column"] == chinook.n("LastName")

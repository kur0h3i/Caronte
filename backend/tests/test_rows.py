import json
from datetime import datetime

import pytest


def get_rows(client, chinook, table: str, **params):
    if "filters" in params and not isinstance(params["filters"], str):
        params["filters"] = json.dumps(params["filters"])
    return client.get(f"/api/connections/chinook/tables/{chinook.n(table)}/rows", params=params)


def rows_ok(client, chinook, table: str, **params) -> dict:
    resp = get_rows(client, chinook, table, **params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def f(chinook, column: str, op: str, value=None) -> dict:
    return {"column": chinook.n(column), "op": op, "value": value}


def test_default_page(client, chinook):
    data = rows_ok(client, chinook, "Track")
    assert data["limit"] == 100
    assert data["offset"] == 0
    assert data["total"] == 3503
    assert len(data["rows"]) == 100
    assert data["columns"][0] == chinook.n("TrackId")
    # Sin orden explícito se ordena por la PK.
    assert [r[chinook.n("TrackId")] for r in data["rows"][:3]] == [1, 2, 3]


def test_pagination(client, chinook):
    data = rows_ok(client, chinook, "Track", limit=10, offset=3500)
    assert len(data["rows"]) == 3
    assert data["total"] == 3503
    assert rows_ok(client, chinook, "Track", limit=500)["rows"].__len__() == 500


def test_foreign_keys_have_id_and_label(client, chinook):
    n = chinook.n
    row = rows_ok(client, chinook, "Track", limit=1)["rows"][0]
    assert row[n("AlbumId")] == {"id": 1, "label": "For Those About To Rock We Salute You"}
    assert row[n("GenreId")] == {"id": 1, "label": "Rock"}
    assert row[n("MediaTypeId")] == {"id": 1, "label": "MPEG audio file"}
    assert row[n("Name")] == "For Those About To Rock (We Salute You)"


def test_self_referencing_fk_and_nulls(client, chinook):
    rows = rows_ok(client, chinook, "Employee", limit=3)["rows"]
    reports_to = chinook.n("ReportsTo")
    assert rows[0][reports_to] is None
    assert rows[1][reports_to] == {"id": 1, "label": "General Manager"}
    assert rows[2][reports_to] == {"id": 2, "label": "Sales Manager"}


def test_value_serialization(client, chinook):
    n = chinook.n
    track = rows_ok(client, chinook, "Track", limit=1)["rows"][0]
    assert float(track[n("UnitPrice")]) == pytest.approx(0.99)

    review = rows_ok(client, chinook, "TrackReview", limit=5)["rows"]
    first = review[0]
    assert first[n("Verified")] is True
    assert first[n("Mood")] == "like"
    assert first[n("Details")]["source"] == "app"  # JSON ya decodificado en los 3 motores
    assert isinstance(first[n("Details")]["tags"], list)
    assert review[4][n("Details")] is None  # g % 5 == 0 -> NULL
    datetime.fromisoformat(first[n("CreatedAt")])
    assert "T" in first[n("CreatedAt")]


def test_sort_desc_and_tiebreak(client, chinook):
    ms = chinook.n("Milliseconds")
    rows = rows_ok(client, chinook, "Track", sort=f"-{ms}", limit=20)["rows"]
    values = [r[ms] for r in rows]
    assert values == sorted(values, reverse=True)


def test_sort_by_fk_uses_label(client, chinook):
    album_id, title = chinook.n("AlbumId"), chinook.n("Title")
    # La colación cambia entre motores: comparamos con el orden de Album en el mismo motor.
    first_album = rows_ok(client, chinook, "Album", sort=title, limit=1)["rows"][0][title]
    rows = rows_ok(client, chinook, "Track", sort=album_id, limit=5)["rows"]
    assert rows[0][album_id]["label"] == first_album
    last = rows_ok(client, chinook, "Track", sort=f"-{album_id}", limit=1)["rows"][0]
    assert last[album_id]["label"] != first_album


@pytest.mark.parametrize(
    ("table", "flt", "expected_total"),
    [
        ("Track", ("GenreId", "eq", 1), 1297),
        ("Track", ("GenreId", "eq", "1"), 1297),  # el texto "1" se convierte a entero
        ("Track", ("Composer", "is_null", None), 977),
        ("Track", ("Composer", "not_null", None), 3503 - 977),
        ("Track", ("Name", "contains", "LOVE"), 114),  # sin distinguir mayúsculas
        ("Invoice", ("Total", "gt", "20"), 4),
        ("TrackReview", ("Verified", "eq", True), 667),
        ("TrackReview", ("Verified", "eq", "false"), 333),
        ("TrackReview", ("Mood", "eq", "love"), 250),
        ("TrackReview", ("Mood", "ne", "love"), 750),
        ("TrackReview", ("Details", "contains", "api"), 266),
        ("TrackReview", ("Rating", "gte", 5), 200),
    ],
)
def test_filters(client, chinook, table, flt, expected_total):
    column, op, value = flt
    data = rows_ok(client, chinook, table, filters=[f(chinook, column, op, value)], limit=2)
    assert data["total"] == expected_total


def test_filter_on_fk_label(client, chinook):
    album = chinook.n("AlbumId")
    data = rows_ok(
        client, chinook, "Track", filters=[f(chinook, "AlbumId", "contains", "zeppelin")], limit=500
    )
    assert data["total"] > 0
    assert all("zeppelin" in r[album]["label"].lower() for r in data["rows"])


def test_date_filters(client, chinook):
    date_col = chinook.n("InvoiceDate")
    data = rows_ok(
        client,
        chinook,
        "Invoice",
        filters=[
            f(chinook, "InvoiceDate", "gte", "2025-01-01"),
            f(chinook, "InvoiceDate", "lt", "2025-02-01T00:00:00"),
        ],
        limit=500,
    )
    assert data["total"] > 0
    assert all(r[date_col].startswith("2025-01") for r in data["rows"])


def test_combined_filters_are_anded(client, chinook):
    data = rows_ok(
        client,
        chinook,
        "TrackReview",
        filters=[f(chinook, "Mood", "eq", "love"), f(chinook, "Verified", "eq", True)],
        limit=1,
    )
    # love: g % 4 == 0; verificado: g % 3 != 0 -> 250 menos los 83 múltiplos de 12
    assert data["total"] == 167


@pytest.mark.parametrize(
    "flt",
    [
        ("GenreId", "eq", "abc"),
        ("GenreId", "eq", 1.5),
        ("Name", "eq", None),
        ("Milliseconds", "gt", True),
        ("UnitPrice", "lt", "NaN"),
    ],
)
def test_invalid_filter_values_are_400(client, chinook, flt):
    column, op, value = flt
    resp = get_rows(client, chinook, "Track", filters=[f(chinook, column, op, value)])
    assert resp.status_code == 400, resp.text


def test_json_only_supports_contains(client, chinook):
    resp = get_rows(client, chinook, "TrackReview", filters=[f(chinook, "Details", "eq", "x")])
    assert resp.status_code == 400
    resp = get_rows(client, chinook, "TrackReview", sort=chinook.n("Details"))
    assert resp.status_code == 400


def test_invalid_enum_value_is_400(client, chinook):
    if chinook.engine == "sqlite":
        pytest.skip("En SQLite Mood es texto")
    resp = get_rows(client, chinook, "TrackReview", filters=[f(chinook, "Mood", "eq", "hate")])
    assert resp.status_code == 400


@pytest.mark.parametrize(("limit", "offset"), [(0, 0), (501, 0), (10, -1), ("x", 0)])
def test_limit_and_offset_bounds(client, chinook, limit, offset):
    resp = get_rows(client, chinook, "Track", limit=limit, offset=offset)
    assert resp.status_code == 422

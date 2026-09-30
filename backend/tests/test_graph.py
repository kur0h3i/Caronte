import pytest


def graph(client) -> dict:
    resp = client.get("/api/connections/chinook/graph")
    assert resp.status_code == 200, resp.text
    return resp.json()


def neighbors(client, chinook, table: str, row_id, **params):
    return client.get(
        f"/api/connections/chinook/tables/{chinook.n(table)}/neighbors",
        params={"id": row_id, **params},
    )


def neighbors_ok(client, chinook, table: str, row_id, **params) -> dict:
    resp = neighbors(client, chinook, table, row_id, **params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_schema_graph(client, chinook):
    n = chinook.n
    data = graph(client)
    tables = {t["name"]: t for t in data["tables"]}
    assert len(tables) == 12
    assert len(data["relations"]) == 13

    assert tables[n("Track")]["explorable"] is True
    assert tables[n("Track")]["display_column"] == n("Name")
    assert tables[n("PlaylistTrack")]["junction"] is True
    assert tables[n("PlaylistTrack")]["explorable"] is False
    assert tables[n("InvoiceLine")]["junction"] is False

    rel = next(
        r
        for r in data["relations"]
        if r["from_table"] == n("Track") and r["from_columns"] == [n("AlbumId")]
    )
    assert rel["to_table"] == n("Album")
    assert rel["to_columns"] == [n("AlbumId")]


def test_track_neighbors(client, chinook):
    n = chinook.n
    data = neighbors_ok(client, chinook, "Track", 1)
    assert data["node"] == {
        "table": n("Track"),
        "id": 1,
        "label": "For Those About To Rock (We Salute You)",
    }
    assert data["row"][n("Name")] == "For Those About To Rock (We Salute You)"

    outgoing = {o["table"]: o for o in data["outgoing"]}
    assert outgoing[n("Album")]["label"] == "For Those About To Rock We Salute You"
    assert outgoing[n("Album")]["column"] == n("AlbumId")
    assert outgoing[n("Genre")]["label"] == "Rock"
    assert outgoing[n("MediaType")]["id"] == 1

    incoming = {(g["table"], g["via"]): g for g in data["incoming"]}
    lines = incoming[(n("InvoiceLine"), None)]
    assert lines["total"] == 1
    assert lines["column"] == n("TrackId")
    # La pivote playlist_track se atraviesa: la pista enlaza directamente con sus playlists.
    playlists = incoming[(n("Playlist"), n("PlaylistTrack"))]
    assert playlists["total"] == 3
    assert sorted(i["id"] for i in playlists["items"]) == [1, 8, 17]
    assert {i["label"] for i in playlists["items"]} == {"Music", "Heavy Metal Classic"}
    # Relaciones sin filas no aparecen (no hay reseñas de la pista 1).
    assert (n("TrackReview"), None) not in incoming


def test_self_reference_and_limit(client, chinook):
    n = chinook.n
    data = neighbors_ok(client, chinook, "Employee", 2)
    subordinates = next(g for g in data["incoming"] if g["table"] == n("Employee"))
    assert sorted(i["id"] for i in subordinates["items"]) == [3, 4, 5]
    assert subordinates["column"] == n("ReportsTo")
    assert {o["table"] for o in data["outgoing"]} == {n("Employee")}  # su jefe

    data = neighbors_ok(client, chinook, "Employee", 3, limit=5)
    customers = next(g for g in data["incoming"] if g["table"] == n("Customer"))
    assert customers["total"] == 21
    assert len(customers["items"]) == 5


def test_neighbors_errors(client, chinook):
    # Tabla con PK compuesta: no se explora fila a fila.
    assert neighbors(client, chinook, "PlaylistTrack", 1).status_code == 400
    # Fila inexistente.
    assert neighbors(client, chinook, "Track", 999999).status_code == 404
    # Límite fuera de rango.
    assert neighbors(client, chinook, "Track", 1, limit=51).status_code == 422


@pytest.mark.parametrize(
    "payload", ["1 OR 1=1", "1; DROP TABLE Track", "' OR '1'='1", "1)--", "abc", "1.5"]
)
def test_neighbors_id_injection(client, chinook, payload):
    assert neighbors(client, chinook, "Track", payload).status_code == 400
    total = client.get(
        f"/api/connections/chinook/tables/{chinook.n('Track')}/rows", params={"limit": 1}
    ).json()["total"]
    assert total == 3503


@pytest.mark.parametrize("payload", ["Track; DROP TABLE Track", "(SELECT 1)", "sqlite_master"])
def test_neighbors_table_injection(client, payload):
    resp = client.get(f"/api/connections/chinook/tables/{payload}/neighbors", params={"id": 1})
    assert resp.status_code == 400

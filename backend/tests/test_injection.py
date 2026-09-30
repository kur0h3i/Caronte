"""Intentos de inyección SQL por nombre de tabla, columna, orden y filtros.

Todos deben fallar de forma controlada (400) o tratarse como datos (0 filas), y la BD
debe quedar intacta.
"""

import json

import pytest

TABLE_PAYLOADS = [
    "Track; DROP TABLE Track",
    "Track; DROP TABLE Track --",
    'Track" --',
    "Track' OR '1'='1",
    "Track UNION SELECT 1",
    "Track%0A--",
    "Track%00",
    "(SELECT 1)",
    "track WHERE 1=1",
    "`Track`",
    "[Track]",
    "sqlite_master",
    "information_schema.tables",
    "pg_catalog.pg_user",
]

COLUMN_PAYLOADS = [
    "Name; DROP TABLE Track",
    "Name --",
    'Name" --',
    "Name) OR (1=1",
    "1",
    "(SELECT 1)",
    "Name DESC",
    "Name, TrackId",
    "CASE WHEN 1=1 THEN Name END",
    "`Name`",
    "*",
]


def rows_url(chinook, table: str | None = None) -> str:
    return f"/api/connections/chinook/tables/{table or chinook.n('Track')}/rows"


def assert_track_intact(client, chinook):
    data = client.get(rows_url(chinook), params={"limit": 1}).json()
    assert data["total"] == 3503


@pytest.mark.parametrize("payload", TABLE_PAYLOADS)
def test_table_name_injection(client, chinook, payload):
    assert client.get(rows_url(chinook, payload)).status_code == 400
    assert client.get(f"/api/connections/chinook/tables/{payload}/meta").status_code == 400
    assert_track_intact(client, chinook)


@pytest.mark.parametrize("payload", COLUMN_PAYLOADS)
def test_sort_column_injection(client, chinook, payload):
    for sort in (payload, f"-{payload}"):
        resp = client.get(rows_url(chinook), params={"sort": sort})
        assert resp.status_code == 400, (sort, resp.text)
    assert_track_intact(client, chinook)


def test_sort_direction_injection(client, chinook):
    name = chinook.n("Name")
    for sort in (f"{name} ASC; DROP TABLE x", f"--{name}", f"+{name}", f"{name}-"):
        assert client.get(rows_url(chinook), params={"sort": sort}).status_code == 400, sort


@pytest.mark.parametrize("payload", COLUMN_PAYLOADS)
def test_filter_column_injection(client, chinook, payload):
    filters = json.dumps([{"column": payload, "op": "eq", "value": "x"}])
    resp = client.get(rows_url(chinook), params={"filters": filters})
    assert resp.status_code == 400
    assert_track_intact(client, chinook)


@pytest.mark.parametrize(
    "op", ["= 1 OR 1=1 --", "LIKE", "eq; DROP TABLE Track", "IS NULL OR 1=1", "", "EQ"]
)
def test_filter_operator_injection(client, chinook, op):
    filters = json.dumps([{"column": chinook.n("Name"), "op": op, "value": "x"}])
    assert client.get(rows_url(chinook), params={"filters": filters}).status_code == 400


@pytest.mark.parametrize(
    "value",
    [
        "' OR '1'='1",
        "' OR 1=1 --",
        "x'; DROP TABLE Track; --",
        '" OR ""="',
        "\\' OR 1=1 #",
        "1 UNION SELECT name FROM sqlite_master",
    ],
)
@pytest.mark.parametrize("op", ["eq", "contains", "gt"])
def test_filter_value_is_data_not_sql(client, chinook, value, op):
    filters = json.dumps([{"column": chinook.n("Name"), "op": op, "value": value}])
    resp = client.get(rows_url(chinook), params={"filters": filters})
    assert resp.status_code == 200
    data = resp.json()
    if op != "gt":
        assert data["total"] == 0  # el valor se busca literalmente: no hay coincidencias
    assert_track_intact(client, chinook)


def test_filter_value_injection_on_numeric_column(client, chinook):
    filters = json.dumps([{"column": chinook.n("TrackId"), "op": "eq", "value": "1 OR 1=1"}])
    assert client.get(rows_url(chinook), params={"filters": filters}).status_code == 400


def test_like_wildcards_are_escaped(client, chinook):
    name = chinook.n("Name")
    for wildcard, expected in (("%", 2), ("_", 0)):
        filters = json.dumps([{"column": name, "op": "contains", "value": wildcard}])
        data = client.get(rows_url(chinook), params={"filters": filters, "limit": 500}).json()
        assert data["total"] == expected
        assert all(wildcard in r[name] for r in data["rows"])


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        '{"column": "Name"}',
        '[{"column": "Name", "op": "eq", "value": "x", "sql": "1=1"}]',
        '[{"column": ["Name"], "op": "eq", "value": "x"}]',
        '[{"column": "Name", "op": "eq", "value": {"$gt": ""}}]',
    ],
)
def test_malformed_filters_are_400(client, chinook, raw):
    assert client.get(rows_url(chinook), params={"filters": raw}).status_code == 400

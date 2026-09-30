import pytest
from sqlalchemy import types as sa
from sqlalchemy.dialects import mysql, postgresql, sqlite

from app.introspection.display import choose_display_column
from app.introspection.models import ColumnInfo, TableInfo
from app.introspection.types import normalize_type


def _table(*cols: tuple[str, str], pk: list[str] | None = None) -> TableInfo:
    return TableInfo(
        name="t",
        kind="table",
        columns=[ColumnInfo(name=n, type=t, raw_type="X", nullable=True) for n, t in cols],
        primary_key=pk if pk is not None else [cols[0][0]],
        foreign_keys=[],
        approx_rows=None,
    )


@pytest.mark.parametrize(
    ("columns", "expected"),
    [
        # Prioridad: name > nombre > title > titulo > email > username
        ((("id", "int"), ("email", "text"), ("title", "text"), ("name", "text")), "name"),
        ((("id", "int"), ("username", "text"), ("Titulo", "text")), "Titulo"),
        ((("id", "int"), ("EMAIL", "text"), ("username", "text")), "EMAIL"),
        # Sin distinguir tildes ni mayúsculas
        ((("id", "int"), ("Título", "text")), "Título"),
        ((("Id", "int"), ("Nombre", "text")), "Nombre"),
        # Primera columna de texto
        ((("id", "int"), ("total", "numeric"), ("address", "text"), ("city", "text")), "address"),
        # En último caso, la PK
        ((("id", "int"), ("total", "numeric")), "id"),
    ],
)
def test_display_column_priority(columns, expected):
    assert choose_display_column(_table(*columns)) == expected


def test_display_column_override():
    table = _table(("id", "int"), ("name", "text"), ("last_name", "text"))
    assert choose_display_column(table, "last_name") == "last_name"
    # Un override que no existe se ignora
    assert choose_display_column(table, "no_existe") == "name"


@pytest.mark.parametrize(
    ("sa_type", "expected"),
    [
        (sa.Integer(), "int"),
        (sa.BigInteger(), "int"),
        (mysql.TINYINT(display_width=4), "int"),
        (mysql.TINYINT(display_width=1), "bool"),
        (sa.Boolean(), "bool"),
        (sa.Numeric(10, 2), "numeric"),
        (sa.Float(), "numeric"),
        (mysql.DOUBLE(), "numeric"),
        (sa.Date(), "date"),
        (sa.DateTime(), "datetime"),
        (postgresql.TIMESTAMP(timezone=True), "datetime"),
        (sqlite.DATETIME(), "datetime"),
        (sa.JSON(), "json"),
        (postgresql.JSONB(), "json"),
        (postgresql.ARRAY(sa.Integer()), "json"),
        (sa.String(40), "text"),
        (sa.Text(), "text"),
        (sa.Uuid(), "text"),
        (sa.Time(), "text"),
        (sa.LargeBinary(), "text"),
        (sa.NullType(), "text"),
    ],
)
def test_normalize_type(sa_type, expected):
    assert normalize_type(sa_type) == (expected, None)


def test_normalize_enum():
    assert normalize_type(postgresql.ENUM("a", "b", name="e")) == ("enum", ["a", "b"])
    assert normalize_type(mysql.ENUM("x", "y")) == ("enum", ["x", "y"])

"""Genera dev/data/chinook.sqlite a partir de los scripts SQL de Chinook + tabla demo.

Uso: python dev/build_sqlite.py [ruta_salida]
"""

import sqlite3
import sys
from pathlib import Path

DEV_DIR = Path(__file__).resolve().parent
SCRIPTS = [
    DEV_DIR / "chinook" / "Chinook_Sqlite.sql",
    DEV_DIR / "sqlite" / "02-demo.sql",
]


def build(target: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.unlink(missing_ok=True)
    conn = sqlite3.connect(target)
    try:
        for script in SCRIPTS:
            sql = script.read_text(encoding="utf-8-sig")
            # Una única transacción por script: miles de INSERT sin un fsync por fila.
            conn.executescript(f"BEGIN;\n{sql}\nCOMMIT;")
    finally:
        conn.close()
    return target


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEV_DIR / "data" / "chinook.sqlite"
    print(f"SQLite generado en {build(out)}")

import unicodedata

from app.introspection.models import TableInfo

DISPLAY_PRIORITY = ("name", "nombre", "title", "titulo", "email", "username")


def _fold(name: str) -> str:
    """Minúsculas y sin tildes: "Título" -> "titulo", "Name" -> "name"."""
    decomposed = unicodedata.normalize("NFKD", name)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).lower()


def choose_display_column(table: TableInfo, override: str | None = None) -> str | None:
    """Columna que representa una fila de `table` cuando otra tabla la referencia.

    1. La indicada en la configuración (`display_columns`), si existe.
    2. La primera de DISPLAY_PRIORITY (sin distinguir mayúsculas ni tildes).
    3. La primera columna de texto.
    4. La (primera columna de la) PK.
    """
    names = [c.name for c in table.columns]
    if override in names:
        return override

    folded = {_fold(n): n for n in reversed(names)}  # reversed: ante empate, la primera
    for candidate in DISPLAY_PRIORITY:
        if candidate in folded:
            return folded[candidate]

    first_text = next((c.name for c in table.columns if c.type == "text"), None)
    if first_text:
        return first_text
    if table.primary_key:
        return table.primary_key[0]
    return names[0] if names else None

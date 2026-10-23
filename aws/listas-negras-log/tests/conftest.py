"""src/ e importar los tests entre sí, para todos los archivos de tests."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def secreto(monkeypatch):
    import app
    monkeypatch.setattr(app, "API_SECRET", "secreto-prueba")

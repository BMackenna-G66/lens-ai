"""La guardia que impide subir un paquete con binarios que no son de arm64.

`cryptography` es nativa y la Lambda es arm64. Un `.so` de x86 o de un Mac no
falla al desplegar: la Lambda revienta al importar, con la API entera caída. Se
prueba con cabeceras sintéticas, sin binarios reales.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import verificar_binarios as vb  # noqa: E402


def _elf(maquina: int) -> bytes:
    """Una cabecera ELF de 64 bits con ese `e_machine`, y relleno."""
    return b"\x7fELF\x02\x01\x01" + b"\x00" * 11 + maquina.to_bytes(2, "little") + b"\x00" * 40


def test_un_binario_aarch64_pasa(tmp_path):
    (tmp_path / "ok.so").write_bytes(_elf(vb.EM_AARCH64))
    assert vb.revisar(tmp_path) == []


def test_un_binario_x86_se_rechaza(tmp_path):
    """El caso de un CodeBuild de esta cuenta, que es x86_64."""
    (tmp_path / "x86.so").write_bytes(_elf(62))   # EM_X86_64
    assert "no de arm64" in vb.revisar(tmp_path)[0]


def test_un_binario_de_mac_se_rechaza(tmp_path):
    (tmp_path / "mac.so").write_bytes(b"\xcf\xfa\xed\xfe" + b"\x00" * 40)   # Mach-O
    assert "no es un binario de Linux" in vb.revisar(tmp_path)[0]


def test_se_revisan_tambien_los_binarios_en_subcarpetas(tmp_path):
    (tmp_path / "cryptography" / "hazmat").mkdir(parents=True)
    (tmp_path / "cryptography" / "hazmat" / "_rust.abi3.so").write_bytes(_elf(62))
    assert vb.revisar(tmp_path), "el .so de cryptography vive en una subcarpeta"


def test_un_solo_binario_malo_alcanza_para_abortar(tmp_path, monkeypatch, capsys):
    (tmp_path / "ok.so").write_bytes(_elf(vb.EM_AARCH64))
    (tmp_path / "malo.so").write_bytes(_elf(62))
    monkeypatch.setattr(sys, "argv", ["verificar_binarios.py", str(tmp_path)])
    assert vb.main() == 1
    assert "Se aborta" in capsys.readouterr().out

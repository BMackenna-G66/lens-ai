"""¿Todo binario nativo del paquete es para Linux arm64? Sale con 1 si no.

    python3 scripts/verificar_binarios.py <carpeta-del-paquete>

La Lambda `lens-analisis` es arm64, y `cryptography` —que hace falta para abrir
los PDF cifrados— trae una extensión nativa. Un paquete armado en una máquina
x86 sin `--platform manylinux2014_aarch64 --only-binary=:all:` deja el `.so` en
x86, y la Lambda no falla al desplegar: revienta al importar, con la API entera
caída. Los CodeBuild de esta cuenta son x86_64, y un Mac arma Mach-O.

Se mira la cabecera ELF y no el comando `file`, para que funcione igual en un
Mac y en un CodeBuild sin ese comando instalado.
"""

from __future__ import annotations

import sys
from pathlib import Path

#: `e_machine` de la cabecera ELF para AArch64.
EM_AARCH64 = 183


def problema(binario: Path) -> str | None:
    """Por qué este binario no sirve en Lambda arm64, o `None` si sirve."""
    cabecera = binario.read_bytes()[:20]
    if cabecera[:4] != b"\x7fELF":
        return "no es un binario de Linux (¿Mach-O de un Mac?)"
    if int.from_bytes(cabecera[18:20], "little") != EM_AARCH64:
        return "es un binario de Linux, pero no de arm64 (¿x86_64?)"
    return None


def revisar(carpeta: Path) -> list[str]:
    """Los binarios que NO sirven, con su motivo. Vacío = el paquete está bien."""
    malos = []
    for so in sorted(carpeta.rglob("*.so")):
        motivo = problema(so)
        if motivo:
            malos.append(f"{so.relative_to(carpeta)}: {motivo}")
    return malos


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    carpeta = Path(sys.argv[1])
    binarios = list(carpeta.rglob("*.so"))
    malos = revisar(carpeta)
    for m in malos:
        print(f"✗ {m}")
    if malos:
        print("Se aborta: la Lambda es arm64 y este paquete revienta al importar.")
        return 1
    print(f"✓ {len(binarios)} binarios nativos, todos ELF aarch64")
    return 0


if __name__ == "__main__":
    sys.exit(main())

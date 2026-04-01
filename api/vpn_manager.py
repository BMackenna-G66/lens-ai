"""
VPN Manager para Docker/Linux — OpenVPN Access Server Global66
Conecta automáticamente al contenedor antes de acceder a la DB.
"""
import subprocess
import time
import os
import socket
import tempfile
import logging

log = logging.getLogger("vpn_manager")

OVPN_PROFILE   = os.path.join(os.path.dirname(__file__), "profile.ovpn")
VPN_USER       = os.environ.get("VPN_USER", "benjamin.mackenna")
VPN_PASS       = os.environ.get("VPN_PASS", "")
DB_HOST        = os.environ.get("DB_HOST", "db-prod-ro.global66.com")
DB_PORT        = int(os.environ.get("DB_PORT", 3306))
VPN_WAIT_SECS  = 40
CHECK_INTERVAL = 1

_vpn_process = None


def _db_reachable() -> bool:
    try:
        with socket.create_connection((DB_HOST, DB_PORT), timeout=4):
            return True
    except OSError:
        return False


def _write_credentials() -> str:
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
    tmp.write(f"{VPN_USER}\n{VPN_PASS}\n")
    tmp.flush()
    tmp.close()
    os.chmod(tmp.name, 0o600)
    return tmp.name


def connect() -> bool:
    global _vpn_process

    if _db_reachable():
        log.info("VPN: DB ya accesible.")
        return True

    if not os.path.isfile(OVPN_PROFILE):
        log.error(f"profile.ovpn no encontrado en {OVPN_PROFILE}")
        return False

    creds_file = _write_credentials()

    cmd = [
        "openvpn",
        "--config",         OVPN_PROFILE,
        "--auth-user-pass", creds_file,
        "--script-security", "2",
        "--connect-retry",  "2",
        "--connect-timeout", "10",
        "--resolv-retry",   "infinite",
        "--verb",           "3",
        "--daemon",
        "--log",            "/tmp/openvpn.log",
    ]

    log.info("VPN: Iniciando OpenVPN...")
    try:
        subprocess.run(cmd, check=True, timeout=15)
    except Exception as e:
        log.error(f"VPN: Error al iniciar: {e}")
        try:
            os.unlink(creds_file)
        except Exception:
            pass
        return False

    print("Esperando VPN", end="", flush=True)
    for _ in range(VPN_WAIT_SECS):
        time.sleep(CHECK_INTERVAL)
        print(".", end="", flush=True)
        if _db_reachable():
            print(" OK")
            log.info("VPN: Conectado.")
            try:
                os.unlink(creds_file)
            except Exception:
                pass
            return True

    print(" TIMEOUT")
    log.error("VPN: Timeout esperando DB.")
    try:
        os.unlink(creds_file)
    except Exception:
        pass
    return False


def connect_or_exit():
    if not connect():
        log.error("No se pudo conectar a la VPN. Abortando.")
        import sys
        sys.exit(1)

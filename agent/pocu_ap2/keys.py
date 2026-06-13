from __future__ import annotations

import json
import os
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ec
from jwcrypto.jwk import JWK

_KEYS_DIR = Path(__file__).resolve().parent.parent / ".ap2_keys"
_TRUSTED_KEY_FILE = _KEYS_DIR / "trusted_surface.pem"
_AGENT_KEY_FILE = _KEYS_DIR / "agent_signing.pem"


def _load_or_create_key(path: Path, env_var: str, kid: str) -> JWK:
    env_val = os.getenv(env_var, "").strip()
    if env_val:
        return JWK.from_json(env_val)
    if path.is_file():
        return JWK.from_json(path.read_text(encoding="utf-8"))
    raw = ec.generate_private_key(ec.SECP256R1())
    key = JWK.from_pyca(raw)
    jwk_dict = json.loads(key.export())
    jwk_dict["kid"] = kid
    key = JWK.from_json(json.dumps(jwk_dict))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(key.export(), encoding="utf-8")
    return key


def get_trusted_surface_key() -> JWK:
    """Platform key — signs open mandates after user consent (Trusted Surface)."""
    return _load_or_create_key(_TRUSTED_KEY_FILE, "AP2_TRUSTED_SURFACE_KEY", "pocu-trusted-1")


def get_agent_signing_key() -> JWK:
    """Agent key — signs closed payment mandates; public key in open mandate cnf."""
    return _load_or_create_key(_AGENT_KEY_FILE, "AP2_AGENT_SIGNING_KEY", "pocu-agent-1")

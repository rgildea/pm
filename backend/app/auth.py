import hashlib
import secrets


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return f"{salt}:{key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, key_hex = stored.split(":", 1)
    except ValueError:
        return False
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return secrets.compare_digest(key.hex(), key_hex)


def generate_token() -> str:
    return secrets.token_urlsafe(32)

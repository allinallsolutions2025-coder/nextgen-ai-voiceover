import hmac


def matches_configured_api_key(expected: str | None, supplied: str | None) -> bool:
    """Return True only when a non-empty configured key matches the supplied key."""
    configured = (expected or "").strip()
    if not configured:
        return False
    candidate = supplied or ""
    return hmac.compare_digest(configured.encode("utf-8"), candidate.encode("utf-8"))

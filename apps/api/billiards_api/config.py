"""Explicit local CORS configuration; no credentials or production defaults."""

import json
import os
from urllib.parse import urlsplit

DEFAULT_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")


def read_cors_origins() -> list[str]:
    raw = os.environ.get("EIGHTBALL_CORS_ORIGINS")
    if raw is None:
        return list(DEFAULT_ORIGINS)
    try:
        origins = json.loads(raw)
        if not isinstance(origins, list):
            raise ValueError
        for origin in origins:
            if not isinstance(origin, str):
                raise ValueError
            url = urlsplit(origin)
            if (
                url.scheme not in ("http", "https")
                or not url.hostname
                or "*" in url.hostname
                or url.username is not None
                or url.password is not None
                or url.path
                or url.query
                or url.fragment
                or url.port == 0
                or any(character.isspace() for character in origin)
            ):
                raise ValueError
    except (ValueError, TypeError) as error:
        raise ValueError(
            "EIGHTBALL_CORS_ORIGINS must be a JSON array of HTTP(S) origins "
            "without paths, credentials or wildcards; use [] to disable CORS."
        ) from error
    return origins

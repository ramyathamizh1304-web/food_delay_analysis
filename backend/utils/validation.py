from __future__ import annotations

import math
from typing import Any

from fastapi import HTTPException
import pandas as pd


MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_ROWS = 100_000
MAX_COLUMNS = 200
MAX_PREVIEW_PAGE_SIZE = 200


def json_safe(value: Any) -> Any:
    """Convert pandas/numpy values to JSON-compatible Python values."""
    if value is None:
        return None
    try:
        missing = pd.isna(value)
        if not hasattr(missing, "__len__") and bool(missing):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(value, "item"):
        value = value.item()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def dataset_not_found(dataset_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"Dataset '{dataset_id}' was not found. It may have expired after a backend restart.")

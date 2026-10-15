from __future__ import annotations

import re
from collections.abc import Iterable

ALIASES: dict[str, tuple[str, ...]] = {
    "delivery_duration": ("delivery_time", "delivery_duration", "time_taken", "duration"),
    "traffic": ("traffic", "traffic_level", "traffic_condition"),
    "weather": ("weather", "weather_condition"),
    "distance": ("distance", "delivery_distance", "distance_km"),
    "preparation_time": ("preparation_time", "prep_time", "restaurant_prep_time"),
    "rating": ("rating", "customer_rating", "delivery_rating"),
    "vehicle": ("vehicle_type", "delivery_vehicle"),
    "order_timestamp": ("order_time", "order_date", "timestamp"),
    "hour": ("hour", "hour_of_day", "delivery_hour", "order_hour"),
    "deadline": ("delivery_deadline", "promised_delivery_time", "expected_delivery_time", "delivery_due_at"),
    "actual_timestamp": ("actual_delivery_time", "delivered_at", "delivery_timestamp"),
    "delayed": ("is_delayed", "delayed", "delay_status", "on_time"),
}


def normalize_column(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.casefold())


def detect_columns(columns: Iterable[str]) -> dict[str, str | None]:
    originals = list(columns)
    normalized = {name: normalize_column(name) for name in originals}
    detected: dict[str, str | None] = {}
    for feature, aliases in ALIASES.items():
        candidates = {normalize_column(alias) for alias in aliases}
        match = next((name for name in originals if normalized[name] in candidates), None)
        if match is None:
            match = next(
                (name for name in originals if any(alias in normalized[name] for alias in candidates)),
                None,
            )
        detected[feature] = match
    return detected

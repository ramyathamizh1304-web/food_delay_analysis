from __future__ import annotations

from typing import Any

import pandas as pd

from backend.services.eda_service import delivery_time, overview, ratings, traffic_weather
from backend.services.data_cleaning import cleaning_summary
from backend.utils.column_detection import detect_columns


def report_summary(frame: pd.DataFrame) -> dict[str, Any]:
    fields = detect_columns(frame.columns)
    base = overview(frame)
    traffic = traffic_weather(frame)
    rating = ratings(frame)
    duration = delivery_time(frame)
    findings: list[str] = []
    if traffic.get("traffic"):
        slowest = max(traffic["traffic"], key=lambda item: item["average_duration"])
        findings.append(f"Among observed traffic categories, {slowest['category']} had the highest average duration ({slowest['average_duration']:.2f}). This is a descriptive association.")
    if traffic.get("weather"):
        slowest = max(traffic["weather"], key=lambda item: item["average_duration"])
        findings.append(f"Among observed weather categories, {slowest['category']} had the highest average duration ({slowest['average_duration']:.2f}). This is a descriptive association.")
    if base["average_delivery_duration"] is not None:
        findings.append(f"Mean delivery duration was {base['average_delivery_duration']:.2f}; the median was {base['median_delivery_duration']:.2f}.")
    findings.extend(cleaning_summary(frame)["recommendations"])
    return {
        "records": base["total_records"],
        "columns": int(len(frame.columns)),
        "detected_columns": fields,
        "overview": base,
        "cleaning": cleaning_summary(frame),
        "available_sections": {"delivery_time": bool(duration.get("available")), "traffic": bool(traffic.get("traffic")), "weather": bool(traffic.get("weather")), "ratings": bool(rating.get("available"))},
        "findings": findings,
        "limitations": ["These are descriptive summaries of the uploaded dataset.", "Observed correlations and group differences do not establish causation."],
    }

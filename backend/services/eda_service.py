from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from backend.services.data_cleaning import cleaning_summary
from backend.services.statistics_service import correlation_matrix, distribution, numeric_values
from backend.utils.column_detection import detect_columns, normalize_column


def _groups(frame: pd.DataFrame, category: str | None, duration: str | None) -> list[dict[str, Any]]:
    if not category or not duration:
        return []
    subset = frame[[category, duration]].copy()
    subset[duration] = pd.to_numeric(subset[duration], errors="coerce")
    subset = subset.dropna(subset=[category, duration])
    return [
        {"category": str(name), "count": int(len(group)), "average_duration": float(group[duration].mean()), "median_duration": float(group[duration].median())}
        for name, group in subset.groupby(category, dropna=True, sort=True)
    ]


def _delay_flags(frame: pd.DataFrame, fields: dict[str, str | None], threshold_minutes: float | None) -> tuple[pd.Series | None, str | None]:
    delayed = fields.get("delayed")
    if delayed:
        values = frame[delayed].astype("string").str.strip().str.casefold()
        on_time_field = normalize_column(delayed) == "ontime"
        truthy = values.isin(["true", "yes", "1", "delayed", "late"])
        falsy = values.isin(["false", "no", "0", "on time", "ontime", "not delayed"])
        if on_time_field:
            truthy, falsy = falsy, truthy
        flags = pd.Series(np.where(truthy, True, np.where(falsy, False, np.nan)), index=frame.index)
        return flags, f"Explicit status in '{delayed}'"
    deadline = fields.get("deadline")
    actual = fields.get("actual_timestamp")
    if deadline and actual:
        actual_time = pd.to_datetime(frame[actual], errors="coerce", utc=True)
        deadline_time = pd.to_datetime(frame[deadline], errors="coerce", utc=True)
        return actual_time > deadline_time, f"Actual delivery time compared with '{deadline}'"
    duration = fields.get("delivery_duration")
    if duration and threshold_minutes is not None:
        values = pd.to_numeric(frame[duration], errors="coerce")
        return values > threshold_minutes, f"Configured duration threshold of {threshold_minutes:g} minutes (not a confirmed missed deadline)"
    return None, None


def overview(frame: pd.DataFrame, threshold_minutes: float | None = None) -> dict[str, Any]:
    fields = detect_columns(frame.columns)
    duration = fields["delivery_duration"]
    durations = numeric_values(frame, duration) if duration else pd.Series(dtype=float)
    flags, definition = _delay_flags(frame, fields, threshold_minutes)
    valid_flags = flags.dropna() if flags is not None else pd.Series(dtype=bool)
    cleaning = cleaning_summary(frame)
    warnings = []
    if not duration:
        warnings.append("No numeric delivery duration column was detected.")
    if not fields["deadline"] and not fields["delayed"] and threshold_minutes is None:
        warnings.append("Delay status is unavailable without an explicit delay field, delivery deadline, or configured threshold.")
    if cleaning["missing_values_before_cleaning"]:
        warnings.append("Missing values are present; summary metrics use only valid observations.")
    return {
        "total_records": int(len(frame)),
        "duration_column": duration,
        "average_delivery_duration": float(durations.mean()) if len(durations) else None,
        "median_delivery_duration": float(durations.median()) if len(durations) else None,
        "minimum_delivery_duration": float(durations.min()) if len(durations) else None,
        "maximum_delivery_duration": float(durations.max()) if len(durations) else None,
        "delayed_count": int(valid_flags.sum()) if len(valid_flags) else None,
        "delay_status_records": int(len(valid_flags)) if len(valid_flags) else None,
        "delayed_rate": float(valid_flags.mean() * 100) if len(valid_flags) else None,
        "delay_definition": definition,
        "missing_value_count": int(frame.isna().sum().sum()),
        "missing_values": cleaning["missing_values_before_cleaning"],
        "data_quality_warnings": warnings,
        "detected_columns": fields,
    }


def delivery_time(frame: pd.DataFrame, bins: int = 10) -> dict[str, Any]:
    fields = detect_columns(frame.columns)
    duration = fields["delivery_duration"]
    if not duration:
        return {"available": False, "reason": "A delivery duration column is required.", "duration_column": None}
    values = numeric_values(frame, duration)
    if values.empty:
        return {"available": False, "reason": f"Column '{duration}' has no valid numeric values.", "duration_column": duration}
    q1, q3 = values.quantile([.25, .75])
    iqr = q3 - q1
    low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    outliers = values[(values < low) | (values > high)]
    result = distribution(frame, duration, bins)
    result.update({
        "available": True,
        "duration_column": duration,
        "outlier_summary": {"method": "IQR", "count": int(len(outliers)), "lower_bound": float(low), "upper_bound": float(high)},
        "by_vehicle": _groups(frame, fields["vehicle"], duration),
        "by_distance": _distance_groups(frame, fields["distance"], duration),
    })
    return result


def traffic_weather(frame: pd.DataFrame) -> dict[str, Any]:
    fields = detect_columns(frame.columns)
    duration = fields["delivery_duration"]
    if not duration:
        return {"available": False, "reason": "A delivery duration column is required.", "traffic": [], "weather": [], "combinations": []}
    traffic = _groups(frame, fields["traffic"], duration)
    weather = _groups(frame, fields["weather"], duration)
    combinations = []
    if fields["traffic"] and fields["weather"]:
        temp = frame.copy()
        temp["__traffic_weather"] = temp[fields["traffic"]].astype("string").fillna("(missing)") + " · " + temp[fields["weather"]].astype("string").fillna("(missing)")
        combinations = _groups(temp, "__traffic_weather", duration)
    return {"available": True, "traffic_column": fields["traffic"], "weather_column": fields["weather"], "duration_column": duration, "traffic": traffic, "weather": weather, "combinations": combinations}


def ratings(frame: pd.DataFrame, threshold_minutes: float | None = None) -> dict[str, Any]:
    fields = detect_columns(frame.columns)
    rating = fields["rating"]
    if not rating:
        return {"available": False, "reason": "No customer rating column was detected.", "rating_column": None}
    values = numeric_values(frame, rating)
    if values.empty:
        return {"available": False, "reason": f"Column '{rating}' has no valid numeric ratings.", "rating_column": rating}
    counts = values.value_counts().sort_index()
    flags, definition = _delay_flags(frame, fields, threshold_minutes)
    by_delay = []
    if flags is not None:
        work = pd.DataFrame({"rating": pd.to_numeric(frame[rating], errors="coerce"), "delayed": flags}, index=frame.index).dropna()
        for status, group in work.groupby("delayed"):
            by_delay.append({"status": "Delayed" if bool(status) else "On time", "count": int(len(group)), "average_rating": float(group["rating"].mean())})
    duration = fields["delivery_duration"]
    scatter = []
    if duration:
        points = frame[[rating, duration]].copy()
        points[rating] = pd.to_numeric(points[rating], errors="coerce")
        points[duration] = pd.to_numeric(points[duration], errors="coerce")
        scatter = [{"rating": float(row[rating]), "duration": float(row[duration])} for _, row in points.dropna().head(2000).iterrows()]
    return {"available": True, "rating_column": rating, "mean": float(values.mean()), "median": float(values.median()), "distribution": [{"rating": float(value), "count": int(count)} for value, count in counts.items()], "rating_vs_duration": scatter, "by_delay_status": by_delay, "delay_definition": definition}


def distance(frame: pd.DataFrame) -> dict[str, Any]:
    fields = detect_columns(frame.columns)
    distance_column, duration = fields["distance"], fields["delivery_duration"]
    if not distance_column:
        return {"available": False, "reason": "No delivery distance column was detected."}
    values = numeric_values(frame, distance_column)
    result: dict[str, Any] = {"available": True, "distance_column": distance_column, "duration_column": duration, "distribution": distribution(frame, distance_column)}
    if duration:
        points = frame[[distance_column, duration]].apply(pd.to_numeric, errors="coerce").dropna()
        result["distance_vs_duration"] = [{"distance": float(row[distance_column]), "duration": float(row[duration])} for _, row in points.head(2000).iterrows()]
        result["distance_bands"] = _distance_groups(frame, distance_column, duration)
        corr = correlation_matrix(frame, [distance_column, duration])
        result["pearson_correlation"] = corr["matrix"][0][1] if corr["available"] else None
    else:
        result.update({"distance_vs_duration": [], "distance_bands": [], "pearson_correlation": None})
    return result


def hourly(frame: pd.DataFrame) -> dict[str, Any]:
    fields = detect_columns(frame.columns)
    timestamp = fields["order_timestamp"]
    hour_field = fields["hour"]
    if not timestamp and not hour_field:
        return {"available": False, "reason": "No order timestamp column was detected."}
    if timestamp:
        parsed = pd.to_datetime(frame[timestamp], errors="coerce", utc=True)
        if parsed.notna().sum() == 0:
            return {"available": False, "reason": f"Column '{timestamp}' does not contain parseable timestamps."}
        hour_values = parsed.dt.hour
    else:
        hour_values = pd.to_numeric(frame[hour_field], errors="coerce")
        if not hour_values.dropna().between(0, 23).any():
            return {"available": False, "reason": f"Column '{hour_field}' does not contain valid hours from 0 to 23."}
    work = pd.DataFrame({"hour": hour_values}, index=frame.index)
    duration = fields["delivery_duration"]
    if duration:
        work["duration"] = pd.to_numeric(frame[duration], errors="coerce")
    grouped = work.dropna(subset=["hour"]).groupby("hour")
    volume = grouped.size()
    average = grouped["duration"].mean() if duration and "duration" in work.columns else pd.Series(dtype=float)
    return {"available": True, "timestamp_column": timestamp, "hour_column": hour_field, "delivery_volume_by_hour": [{"hour": int(hour), "count": int(count), "average_duration": float(average.get(hour)) if hour in average and pd.notna(average[hour]) else None} for hour, count in volume.items()], "peak_order_hours": [int(hour) for hour in volume[volume == volume.max()].index]}


def correlation(frame: pd.DataFrame, method: str = "pearson") -> dict[str, Any]:
    columns = list(frame.select_dtypes(include="number").columns)
    return correlation_matrix(frame, columns, method)


def _distance_groups(frame: pd.DataFrame, distance_column: str | None, duration: str) -> list[dict[str, Any]]:
    if not distance_column:
        return []
    work = frame[[distance_column, duration]].apply(pd.to_numeric, errors="coerce").dropna()
    if work.empty:
        return []
    maximum = float(work[distance_column].max())
    band_size = max(1.0, float(np.ceil(maximum / 5)))
    work["band"] = (np.floor(work[distance_column] / band_size) * band_size).astype(int)
    return [{"category": f"{band}–{band + band_size:g}", "count": int(len(group)), "average_duration": float(group[duration].mean()), "median_duration": float(group[duration].median())} for band, group in work.groupby("band", sort=True)]

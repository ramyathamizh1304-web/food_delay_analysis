from __future__ import annotations

from typing import Any

import pandas as pd

from backend.utils.column_detection import detect_columns


def cleaning_summary(frame: pd.DataFrame) -> dict[str, Any]:
    missing = {
        column: {"count": int(count), "percentage": round(float(count / max(len(frame), 1) * 100), 2)}
        for column, count in frame.isna().sum().items()
        if count
    }
    outliers: dict[str, dict[str, int | float]] = {}
    for column in frame.select_dtypes(include="number").columns:
        values = frame[column].dropna()
        if len(values) < 4:
            continue
        q1, q3 = values.quantile([0.25, 0.75])
        iqr = q3 - q1
        if iqr <= 0:
            continue
        low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        count = int(((values < low) | (values > high)).sum())
        if count:
            outliers[column] = {"count": count, "lower_bound": float(low), "upper_bound": float(high)}
    invalid: dict[str, dict[str, Any]] = {}
    fields = detect_columns(frame.columns)
    for feature in ("delivery_duration", "distance", "rating", "preparation_time"):
        column = fields.get(feature)
        if not column:
            continue
        source = frame[column]
        bad = source.notna() & pd.to_numeric(source, errors="coerce").isna()
        count = int(bad.sum())
        if count:
            invalid[column] = {"expected_type": "numeric", "count": count, "examples": [str(value) for value in source[bad].drop_duplicates().head(5).tolist()]}
    for feature in ("order_timestamp", "deadline", "actual_timestamp"):
        column = fields.get(feature)
        if not column:
            continue
        source = frame[column]
        bad = source.notna() & pd.to_datetime(source, errors="coerce", utc=True).isna()
        count = int(bad.sum())
        if count:
            invalid[column] = {"expected_type": "datetime", "count": count, "examples": [str(value) for value in source[bad].drop_duplicates().head(5).tolist()]}

    recommendations = []
    if missing:
        recommendations.append("Review missing values and choose a per-column handling strategy before cleaning.")
    if frame.duplicated().any():
        recommendations.append("Review duplicate rows; remove them only if they are not legitimate repeated deliveries.")
    if outliers:
        recommendations.append("Inspect IQR outliers in context before applying a selected outlier-handling method.")
    if invalid:
        recommendations.append("Review values that do not match the inferred numeric or datetime type before converting columns.")
    if not recommendations:
        recommendations.append("No missing values, duplicate rows, or IQR outliers were detected in the inspected columns.")
    return {
        "missing_values_before_cleaning": missing,
        "duplicate_rows": int(frame.duplicated().sum()),
        "invalid_values": invalid,
        "outliers_iqr": outliers,
        "recommendations": recommendations,
    }


def apply_cleaning(frame: pd.DataFrame, operations: dict[str, Any]) -> tuple[pd.DataFrame, dict[str, Any]]:
    cleaned = frame.copy(deep=True)
    changes: dict[str, Any] = {"rows_before": len(cleaned), "operations": []}
    if operations.get("remove_duplicates"):
        before = len(cleaned)
        cleaned = cleaned.drop_duplicates().copy()
        changes["operations"].append({"operation": "remove_duplicates", "rows_removed": before - len(cleaned)})

    conversions = operations.get("convert_types", {})
    for column, target in conversions.items():
        if column not in cleaned.columns:
            raise ValueError(f"Unknown column for conversion: '{column}'.")
        if target == "numeric":
            converted = pd.to_numeric(cleaned[column], errors="coerce")
        elif target == "datetime":
            converted = pd.to_datetime(cleaned[column], errors="coerce", utc=True)
        else:
            raise ValueError(f"Unsupported conversion '{target}' for column '{column}'.")
        invalid = int((cleaned[column].notna() & converted.isna()).sum())
        cleaned[column] = converted
        changes["operations"].append({"operation": "convert_type", "column": column, "target": target, "invalid_values_to_missing": invalid})

    missing_ops = operations.get("handle_missing", {})
    for column, method in missing_ops.items():
        if column not in cleaned.columns:
            raise ValueError(f"Unknown column for missing-value handling: '{column}'.")
        missing_count = int(cleaned[column].isna().sum())
        if method == "drop_rows":
            cleaned = cleaned.loc[cleaned[column].notna()].copy()
            detail: Any = {"rows_removed": missing_count}
        elif method in {"mean", "median"}:
            if not pd.api.types.is_numeric_dtype(cleaned[column]):
                raise ValueError(f"Column '{column}' must be numeric to fill with {method}.")
            fill_value = cleaned[column].mean() if method == "mean" else cleaned[column].median()
            if pd.isna(fill_value) and missing_count:
                raise ValueError(f"Column '{column}' has no valid values to calculate a {method}.")
            cleaned[column] = cleaned[column].fillna(fill_value)
            detail = {"filled": missing_count, "value": float(fill_value) if not pd.isna(fill_value) else None}
        elif method == "mode":
            modes = cleaned[column].mode(dropna=True)
            if modes.empty and missing_count:
                raise ValueError(f"Column '{column}' has no valid values to calculate a mode.")
            fill_value = modes.iloc[0] if not modes.empty else None
            cleaned[column] = cleaned[column].fillna(fill_value)
            detail = {"filled": missing_count, "value": str(fill_value) if fill_value is not None else None}
        elif method == "leave":
            detail = {"left_missing": missing_count}
        else:
            raise ValueError(f"Unsupported missing-value method '{method}' for column '{column}'.")
        changes["operations"].append({"operation": "handle_missing", "column": column, "method": method, **detail})

    outlier_ops = operations.get("outlier_handling", {})
    for column, method in outlier_ops.items():
        if column not in cleaned.columns or not pd.api.types.is_numeric_dtype(cleaned[column]):
            raise ValueError(f"Column '{column}' must exist and be numeric for outlier handling.")
        values = cleaned[column]
        q1, q3 = values.quantile([0.25, 0.75])
        if pd.isna(q1) or pd.isna(q3):
            raise ValueError(f"Column '{column}' does not have enough numeric values for IQR handling.")
        iqr = q3 - q1
        low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        mask = (values < low) | (values > high)
        count = int(mask.sum())
        if method == "clip":
            cleaned[column] = values.clip(lower=low, upper=high)
        elif method == "drop_rows":
            cleaned = cleaned.loc[~mask].copy()
        elif method == "leave":
            pass
        else:
            raise ValueError(f"Unsupported IQR outlier method '{method}' for column '{column}'.")
        changes["operations"].append({"operation": "handle_outliers_iqr", "column": column, "method": method, "affected_values": count, "bounds": [float(low), float(high)]})

    changes["rows_after"] = len(cleaned)
    changes["rows_removed"] = changes["rows_before"] - changes["rows_after"]
    changes["columns"] = list(cleaned.columns)
    return cleaned, changes

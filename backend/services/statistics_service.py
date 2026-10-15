from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import pearsonr, spearmanr


def numeric_values(frame: pd.DataFrame, column: str) -> pd.Series:
    return pd.to_numeric(frame[column], errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()


def correlation_matrix(frame: pd.DataFrame, columns: list[str], method: str = "pearson") -> dict[str, Any]:
    if method not in {"pearson", "spearman"}:
        raise ValueError("Correlation method must be 'pearson' or 'spearman'.")
    valid = [column for column in columns if column in frame and pd.api.types.is_numeric_dtype(frame[column])]
    if len(valid) < 2:
        return {"available": False, "reason": "At least two numerical columns are required.", "method": method, "columns": valid, "matrix": []}
    matrix: list[list[float | None]] = []
    for first in valid:
        row: list[float | None] = []
        for second in valid:
            if first == second:
                row.append(1.0 if numeric_values(frame, first).size else None)
                continue
            pairs = frame[[first, second]].replace([np.inf, -np.inf], np.nan).dropna()
            if len(pairs) < 2 or pairs[first].nunique() < 2 or pairs[second].nunique() < 2:
                row.append(1.0 if first == second and len(pairs) >= 1 else None)
                continue
            coefficient = pearsonr(pairs[first], pairs[second]).statistic if method == "pearson" else spearmanr(pairs[first], pairs[second]).statistic
            row.append(float(coefficient) if np.isfinite(coefficient) else None)
        matrix.append(row)
    return {"available": True, "reason": None, "method": method, "columns": valid, "matrix": matrix, "note": "Correlation describes association and does not establish causation."}


def distribution(frame: pd.DataFrame, column: str, bins: int = 10) -> dict[str, Any]:
    values = numeric_values(frame, column)
    if values.empty:
        return {"count": 0, "bins": [], "mean": None, "median": None}
    bin_count = min(max(1, bins), 40)
    counts, edges = np.histogram(values.to_numpy(), bins=bin_count)
    return {
        "count": int(len(values)),
        "bins": [{"lower": float(edges[i]), "upper": float(edges[i + 1]), "label": f"{edges[i]:g}–{edges[i + 1]:g}", "count": int(counts[i])} for i in range(len(counts))],
        "mean": float(values.mean()),
        "median": float(values.median()),
        "minimum": float(values.min()),
        "maximum": float(values.max()),
        "q1": float(values.quantile(.25)),
        "q3": float(values.quantile(.75)),
        "standard_deviation": float(values.std()) if len(values) > 1 else 0.0,
    }

from __future__ import annotations

from typing import Literal

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from backend.services.data_cleaning import apply_cleaning, cleaning_summary
from backend.services.dataset_store import store
from backend.utils.column_detection import detect_columns
from backend.utils.validation import MAX_PREVIEW_PAGE_SIZE, dataset_not_found, json_safe

router = APIRouter(tags=["dataset"])


def _get_frame(dataset_id: str) -> pd.DataFrame:
    stored = store.get(dataset_id)
    if stored is None:
        raise dataset_not_found(dataset_id)
    return stored.frame


@router.get("/dataset/{dataset_id}/metadata")
def metadata(dataset_id: str) -> dict:
    frame = _get_frame(dataset_id)
    missing = frame.isna().sum()
    columns = [
        {
            "name": column,
            "data_type": str(frame[column].dtype),
            "missing_count": int(missing[column]),
            "missing_percentage": round(float(missing[column] / max(len(frame), 1) * 100), 2),
        }
        for column in frame.columns
    ]
    numerical = [str(column) for column in frame.select_dtypes(include="number").columns]
    categorical = [str(column) for column in frame.select_dtypes(exclude="number").columns]
    return {
        "dataset_id": dataset_id,
        "row_count": int(len(frame)),
        "column_count": int(len(frame.columns)),
        "columns": columns,
        "column_names": list(frame.columns),
        "numerical_columns": numerical,
        "categorical_columns": categorical,
        "duplicate_rows": int(frame.duplicated().sum()),
        "memory_usage_bytes": int(frame.memory_usage(index=True, deep=True).sum()),
        "detected_columns": detect_columns(frame.columns),
        "categorical_options": {
            str(column): [str(value) for value in frame[column].dropna().astype(str).drop_duplicates().head(100).tolist()]
            for column in frame.select_dtypes(exclude="number").columns
        },
    }


@router.get("/dataset/{dataset_id}/preview")
def preview(
    dataset_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=MAX_PREVIEW_PAGE_SIZE),
    search: str | None = Query(None, max_length=300),
    sort_by: str | None = Query(None),
    order: Literal["asc", "desc"] = Query("asc"),
    columns: str | None = Query(None, description="Comma-separated source column names"),
) -> dict:
    frame = _get_frame(dataset_id)
    selected = [item.strip() for item in columns.split(",") if item.strip()] if columns else list(frame.columns)
    unknown = [column for column in selected if column not in frame.columns]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown column(s): {', '.join(unknown)}.")
    if sort_by and sort_by not in frame.columns:
        raise HTTPException(status_code=422, detail=f"Unknown sort column '{sort_by}'.")
    result = frame[selected].copy()
    total_before_search = len(result)
    if search:
        mask = result.astype("string").apply(lambda column: column.str.contains(search, case=False, regex=False, na=False)).any(axis=1)
        result = result.loc[mask]
    total_rows = len(result)
    if sort_by:
        result = result.sort_values(sort_by, ascending=order == "asc", kind="stable", na_position="last")
    start = (page - 1) * page_size
    records = [{key: json_safe(value) for key, value in row.items()} for row in result.iloc[start : start + page_size].to_dict(orient="records")]
    return {
        "columns": selected,
        "rows": records,
        "page": page,
        "page_size": page_size,
        "total_rows": int(total_rows),
        "total_pages": max(1, (total_rows + page_size - 1) // page_size),
        "total_rows_before_search": int(total_before_search),
    }


@router.get("/dataset/{dataset_id}/cleaning-summary")
def get_cleaning_summary(dataset_id: str) -> dict:
    return cleaning_summary(_get_frame(dataset_id))


@router.delete("/dataset/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str) -> None:
    if not store.delete(dataset_id):
        raise dataset_not_found(dataset_id)


class CleanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    remove_duplicates: bool = False
    handle_missing: dict[str, Literal["leave", "drop_rows", "mean", "median", "mode"]] = Field(default_factory=dict)
    convert_types: dict[str, Literal["numeric", "datetime"]] = Field(default_factory=dict)
    outlier_handling: dict[str, Literal["leave", "clip", "drop_rows"]] = Field(default_factory=dict)


@router.post("/dataset/{dataset_id}/clean", status_code=201)
def clean_dataset(dataset_id: str, request: CleanRequest) -> dict:
    source = store.get(dataset_id)
    if source is None:
        raise dataset_not_found(dataset_id)
    try:
        cleaned, changes = apply_cleaning(source.frame, request.model_dump())
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    try:
        cleaned_id = store.add(cleaned, f"cleaned-{source.file_name}", source_id=dataset_id)
    except OverflowError as error:
        raise HTTPException(status_code=429, detail=str(error)) from error
    return {"dataset_id": cleaned_id, "source_dataset_id": dataset_id, "file_name": f"cleaned-{source.file_name}", "summary": changes}

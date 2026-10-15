from __future__ import annotations

import csv
from io import StringIO
from pathlib import PurePath

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from pandas.errors import EmptyDataError, ParserError

from backend.services.dataset_store import store
from backend.utils.column_detection import detect_columns
from backend.utils.validation import MAX_COLUMNS, MAX_ROWS, MAX_UPLOAD_BYTES, json_safe

router = APIRouter(tags=["upload"])


@router.post("/upload", status_code=201)
async def upload_csv(file: UploadFile = File(...)) -> dict:
    file_name = PurePath(file.filename or "").name
    if not file_name or not file_name.casefold().endswith(".csv"):
        raise HTTPException(status_code=415, detail="Only .csv files are supported.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded CSV is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"CSV files must be no larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    try:
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = content.decode("cp1252")
        reader = csv.reader(StringIO(text, newline=""), strict=True)
        headers = next(reader, None)
        if not headers or not any(header.strip() for header in headers):
            raise HTTPException(status_code=400, detail="The CSV must contain a header row and at least one data row.")
        if any(not header.strip() or header.strip().casefold().startswith("unnamed:") for header in headers):
            raise HTTPException(status_code=400, detail="Every CSV column must have a non-empty header.")
        if len({header.strip() for header in headers}) != len(headers):
            raise HTTPException(status_code=400, detail="CSV column names must be unique.")
        if len(headers) > MAX_COLUMNS:
            raise HTTPException(status_code=413, detail=f"CSV exceeds the maximum of {MAX_COLUMNS} columns.")
        for row_number, row in enumerate(reader, start=2):
            if row and len(row) != len(headers):
                raise HTTPException(status_code=400, detail=f"Malformed CSV row {row_number}: expected {len(headers)} columns, found {len(row)}.")
        frame = pd.read_csv(StringIO(text), on_bad_lines="error", low_memory=False)
    except HTTPException:
        raise
    except (csv.Error, EmptyDataError, ParserError, UnicodeDecodeError, ValueError) as error:
        raise HTTPException(status_code=400, detail="The file is not a valid readable CSV.") from error
    if frame.empty or len(frame.columns) == 0:
        raise HTTPException(status_code=400, detail="The CSV must contain a header row and at least one data row.")
    if len(frame.index) > MAX_ROWS:
        raise HTTPException(status_code=413, detail=f"CSV exceeds the maximum of {MAX_ROWS:,} data rows.")
    if len(frame.columns) > MAX_COLUMNS:
        raise HTTPException(status_code=413, detail=f"CSV exceeds the maximum of {MAX_COLUMNS} columns.")
    frame.columns = [str(column).strip() for column in frame.columns]
    if any(not column or column.casefold().startswith("unnamed:") for column in frame.columns):
        raise HTTPException(status_code=400, detail="Every CSV column must have a non-empty header.")
    if len(set(frame.columns)) != len(frame.columns):
        raise HTTPException(status_code=400, detail="CSV column names must be unique.")
    frame = frame.where(pd.notna(frame), None)
    try:
        dataset_id = store.add(frame, file_name)
    except OverflowError as error:
        raise HTTPException(status_code=429, detail=str(error)) from error
    return {
        "dataset_id": dataset_id,
        "file_name": file_name,
        "file_size_bytes": len(content),
        "row_count": int(len(frame)),
        "column_count": int(len(frame.columns)),
        "columns": list(frame.columns),
        "detected_columns": detect_columns(frame.columns),
        "preview": [
            {key: json_safe(value) for key, value in row.items()}
            for row in frame.head(10).to_dict(orient="records")
        ],
    }

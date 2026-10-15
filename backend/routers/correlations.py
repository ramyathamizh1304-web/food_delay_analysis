from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.services.eda_service import correlation
from backend.services.dataset_store import store
from backend.utils.validation import dataset_not_found

router = APIRouter(tags=["correlations"])


@router.get("/analysis/{dataset_id}/correlation")
def get_correlation(dataset_id: str, method: str = Query("pearson", pattern="^(pearson|spearman)$")) -> dict:
    stored = store.get(dataset_id)
    if stored is None:
        raise dataset_not_found(dataset_id)
    try:
        return correlation(stored.frame, method)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

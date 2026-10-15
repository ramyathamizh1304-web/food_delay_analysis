from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.services import eda_service
from backend.services.dataset_store import store
from backend.utils.validation import dataset_not_found

router = APIRouter(tags=["analysis"])


def _frame(dataset_id: str):
    stored = store.get(dataset_id)
    if stored is None:
        raise dataset_not_found(dataset_id)
    return stored.frame


@router.get("/analysis/{dataset_id}/overview")
def get_overview(dataset_id: str, threshold_minutes: float | None = Query(None, gt=0, le=1440)) -> dict:
    return eda_service.overview(_frame(dataset_id), threshold_minutes)


@router.get("/analysis/{dataset_id}/delivery-time")
def get_delivery_time(dataset_id: str, bins: int = Query(10, ge=1, le=40)) -> dict:
    return eda_service.delivery_time(_frame(dataset_id), bins)


@router.get("/analysis/{dataset_id}/traffic-weather")
def get_traffic_weather(dataset_id: str) -> dict:
    return eda_service.traffic_weather(_frame(dataset_id))


@router.get("/analysis/{dataset_id}/ratings")
def get_ratings(dataset_id: str, threshold_minutes: float | None = Query(None, gt=0, le=1440)) -> dict:
    return eda_service.ratings(_frame(dataset_id), threshold_minutes)


@router.get("/analysis/{dataset_id}/distance")
def get_distance(dataset_id: str) -> dict:
    return eda_service.distance(_frame(dataset_id))


@router.get("/analysis/{dataset_id}/hourly")
def get_hourly(dataset_id: str) -> dict:
    return eda_service.hourly(_frame(dataset_id))


@router.get("/analysis/{dataset_id}/dashboard")
def get_dashboard(
    dataset_id: str,
    threshold_minutes: float | None = Query(None, gt=0, le=1440),
    traffic: str | None = Query(None, max_length=200),
    weather: str | None = Query(None, max_length=200),
    vehicle: str | None = Query(None, max_length=200),
) -> dict:
    """Combined chart response for the React overview; source datasets stay server-side."""
    frame = _frame(dataset_id)
    fields = eda_service.detect_columns(frame.columns)
    filters = ((traffic, fields["traffic"]), (weather, fields["weather"]), (vehicle, fields["vehicle"]))
    for value, column in filters:
        if value is not None and (column is None or value not in frame[column].astype("string").fillna("").unique()):
            raise HTTPException(status_code=422, detail=f"Filter value '{value}' is not available for this dataset.")
    for value, column in filters:
        if value is not None and column:
            frame = frame.loc[frame[column].astype("string") == value]
    overview = eda_service.overview(frame, threshold_minutes)
    delivery = eda_service.delivery_time(frame)
    context = eda_service.traffic_weather(frame)
    rating = eda_service.ratings(frame, threshold_minutes)
    distances = eda_service.distance(frame)
    hourly = eda_service.hourly(frame)
    return {
        "overview": overview,
        "delivery_time": delivery,
        "traffic_weather": context,
        "ratings": rating,
        "distance": distances,
        "hourly": hourly,
        "correlation": eda_service.correlation(frame),
    }

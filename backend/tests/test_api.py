from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.dataset_store import store

client = TestClient(app)


def setup_function() -> None:
    store.clear()


def upload_csv(content: bytes, filename: str = "deliveries.csv"):
    return client.post("/api/upload", files={"file": (filename, BytesIO(content), "text/csv")})


SAMPLE = (
    b"delivery_time,traffic,weather,distance,vehicle_type,rating,is_delayed,order_time\n"
    b"20,Low,Clear,2.1,Scooter,5,false,2025-01-01T08:15:00\n"
    b"41,High,Rainy,7.3,Car,3,true,2025-01-01T09:30:00\n"
    b"35,High,Cloudy,5.2,Bike,4,true,2025-01-01T09:45:00\n"
    b"20,Low,Clear,2.1,Scooter,5,false,2025-01-01T08:15:00\n"
)


def test_upload_and_metadata_detect_actual_columns() -> None:
    uploaded = upload_csv(SAMPLE)
    assert uploaded.status_code == 201
    payload = uploaded.json()
    assert payload["row_count"] == 4
    assert payload["detected_columns"]["delivery_duration"] == "delivery_time"
    metadata = client.get(f"/api/dataset/{payload['dataset_id']}/metadata")
    assert metadata.status_code == 200
    assert metadata.json()["duplicate_rows"] == 1
    assert "delivery_time" in metadata.json()["numerical_columns"]


def test_preview_search_sort_and_pagination() -> None:
    dataset_id = upload_csv(SAMPLE).json()["dataset_id"]
    response = client.get(f"/api/dataset/{dataset_id}/preview", params={"page": 1, "page_size": 2, "search": "high", "sort_by": "delivery_time", "order": "desc"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_rows"] == 2
    assert [row["delivery_time"] for row in payload["rows"]] == [41, 35]


def test_analysis_and_reports_are_based_on_upload() -> None:
    dataset_id = upload_csv(SAMPLE).json()["dataset_id"]
    overview = client.get(f"/api/analysis/{dataset_id}/overview").json()
    assert overview["average_delivery_duration"] == 29.0
    assert overview["delayed_count"] == 2
    delivery = client.get(f"/api/analysis/{dataset_id}/delivery-time").json()
    assert delivery["available"] is True
    assert delivery["count"] == 4
    assert client.get(f"/api/analysis/{dataset_id}/correlation").json()["available"] is True
    ratings = client.get(f"/api/analysis/{dataset_id}/ratings").json()
    assert ratings["mean"] == 4.25
    assert client.get(f"/api/analysis/{dataset_id}/hourly").json()["available"] is True
    assert client.get(f"/api/reports/{dataset_id}/summary").json()["records"] == 4
    assert "text/csv" in client.get(f"/api/reports/{dataset_id}/summary?format=csv").headers["content-type"]


def test_cleaning_creates_an_independent_dataset_version() -> None:
    dataset_id = upload_csv(SAMPLE).json()["dataset_id"]
    response = client.post(f"/api/dataset/{dataset_id}/clean", json={"remove_duplicates": True, "handle_missing": {"rating": "mean"}})
    assert response.status_code == 201
    cleaned_id = response.json()["dataset_id"]
    assert cleaned_id != dataset_id
    assert response.json()["summary"]["rows_removed"] == 1
    assert client.get(f"/api/dataset/{dataset_id}/metadata").json()["row_count"] == 4
    assert client.get(f"/api/dataset/{cleaned_id}/metadata").json()["row_count"] == 3


def test_invalid_uploads_and_missing_features_are_explicit() -> None:
    assert upload_csv(b"", "empty.csv").status_code == 400
    assert upload_csv(b"table\n", "header-only.csv").status_code == 400
    assert upload_csv(b"a,b\n1,2,3\n", "malformed.csv").status_code == 400
    assert upload_csv(b"a,b\n1,2\n", "table.txt").status_code == 415
    assert client.get("/api/dataset/not-a-real-id/metadata").status_code == 404
    dataset_id = upload_csv(b"shop,category\nA,food\nB,drink\n").json()["dataset_id"]
    assert client.get(f"/api/analysis/{dataset_id}/ratings").json()["available"] is False
    assert client.get(f"/api/analysis/{dataset_id}/hourly").json()["available"] is False
    assert client.post(f"/api/dataset/{dataset_id}/clean", json={"convert_types": {"unknown": "numeric"}}).status_code == 422


def test_missing_values_cleaning_and_independent_dataset_ids() -> None:
    first = upload_csv(b"delivery_time,rating\n10,\n20,4\n20,\n").json()["dataset_id"]
    second = upload_csv(b"distance,weather\n1,clear\n2,rain\n").json()["dataset_id"]
    assert first != second
    metadata = client.get(f"/api/dataset/{first}/metadata").json()
    assert metadata["columns"][1]["missing_count"] == 2
    assert client.get(f"/api/dataset/{first}/cleaning-summary").json()["missing_values_before_cleaning"]["rating"]["count"] == 2
    result = client.post(f"/api/dataset/{first}/clean", json={"handle_missing": {"rating": "mean"}})
    assert result.status_code == 201
    cleaned_id = result.json()["dataset_id"]
    rows = client.get(f"/api/dataset/{cleaned_id}/preview").json()["rows"]
    assert [row["rating"] for row in rows] == [4, 4, 4]
    assert client.get(f"/api/dataset/{second}/metadata").json()["row_count"] == 2


def test_deadline_based_delay_is_distinct_from_duration_threshold() -> None:
    content = b"delivery_time,actual_delivery_time,promised_delivery_time\n15,2025-01-01T10:15:00,2025-01-01T10:00:00\n50,2025-01-01T11:00:00,2025-01-01T11:30:00\n"
    dataset_id = upload_csv(content).json()["dataset_id"]
    overview = client.get(f"/api/analysis/{dataset_id}/overview").json()
    assert overview["delayed_count"] == 1
    assert "promised_delivery_time" in overview["delay_definition"]


def test_on_time_boolean_status_is_not_inverted() -> None:
    dataset_id = upload_csv(b"delivery_time,on_time\n40,true\n20,false\n").json()["dataset_id"]
    overview = client.get(f"/api/analysis/{dataset_id}/overview").json()
    assert overview["delayed_count"] == 1


def test_dashboard_filters_return_filtered_full_dataset_metrics() -> None:
    dataset_id = upload_csv(SAMPLE).json()["dataset_id"]
    result = client.get(f"/api/analysis/{dataset_id}/dashboard", params={"traffic": "High"}).json()
    assert result["overview"]["total_records"] == 2
    assert result["overview"]["average_delivery_duration"] == 38.0
    assert [item["category"] for item in result["traffic_weather"]["traffic"]] == ["High"]


def test_cleaning_summary_identifies_invalid_numeric_values() -> None:
    dataset_id = upload_csv(b"delivery_time,rating\n20,5\nunknown,4\n").json()["dataset_id"]
    summary = client.get(f"/api/dataset/{dataset_id}/cleaning-summary").json()
    assert summary["invalid_values"]["delivery_time"]["count"] == 1
    assert summary["invalid_values"]["delivery_time"]["examples"] == ["unknown"]


def test_delete_dataset_clears_in_memory_data() -> None:
    dataset_id = upload_csv(SAMPLE).json()["dataset_id"]
    assert client.delete(f"/api/dataset/{dataset_id}").status_code == 204
    assert client.get(f"/api/dataset/{dataset_id}/metadata").status_code == 404


def test_health_and_correlation_with_constant_columns() -> None:
    assert client.get("/api/health").json() == {"status": "ok"}
    dataset_id = upload_csv(b"delivery_time,distance,constant\n10,1,3\n20,2,3\n30,3,3\n").json()["dataset_id"]
    result = client.get(f"/api/analysis/{dataset_id}/correlation").json()
    assert result["available"] is True
    assert result["matrix"][0][2] is None

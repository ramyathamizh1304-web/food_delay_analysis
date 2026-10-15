# Food Delivery Delay Analysis API

FastAPI service for browser-driven exploratory analysis. CSVs are parsed with Pandas and kept only in process memory. No database or permanent file storage is used.

## Start on Windows PowerShell

From the project root:

```powershell
py -3 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.main:app --reload
```

Open the interactive API docs at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs), and check service health at `http://127.0.0.1:8000/api/health`.

For development, CORS allows the Vite origins `http://localhost:5173` and `http://127.0.0.1:5173`. Set `CORS_ORIGINS` to a comma-separated allowlist for another environment. Do not use a wildcard in production.

## Endpoints

- `POST /api/upload` — multipart CSV upload; returns a random dataset ID, metadata, inferred columns, and ten preview rows.
- `GET /api/dataset/{id}/metadata` — dimensions, dtypes, missingness, duplicates, memory, and detected fields.
- `GET /api/dataset/{id}/preview` — server-side pagination, literal text search, sort order, and column selection.
- `GET /api/dataset/{id}/cleaning-summary` — missing values, duplicates, IQR outliers, and non-destructive recommendations.
- `DELETE /api/dataset/{id}` — remove that dataset from the backend process memory.
- `POST /api/dataset/{id}/clean` — create a distinct cleaned version. Operations include duplicate removal, explicit per-column missing handling, type conversion, and IQR clip/drop/leave.
- `GET /api/analysis/{id}/overview` — descriptive metrics. Delay status is only computed from a recognized status field, an actual-vs-deadline pair, or an explicitly configured `threshold_minutes` query parameter.
- `GET /api/analysis/{id}/delivery-time` — descriptive statistics, histogram bins, IQR outliers, vehicle and distance summaries.
- `GET /api/analysis/{id}/traffic-weather` — traffic, weather, and joint summaries.
- `GET /api/analysis/{id}/ratings` — rating distribution and available comparisons; unavailable when ratings are absent.
- `GET /api/analysis/{id}/distance` — distance distribution, relationship points, bands, and Pearson coefficient.
- `GET /api/analysis/{id}/hourly` — hour-of-day order volume and average duration if an order timestamp or valid hour column exists.
- `GET /api/analysis/{id}/correlation?method=pearson|spearman` — numerical association matrix. Correlation does not establish causation.
- `GET /api/analysis/{id}/dashboard` — combined response used by dashboard charts; accepts traffic, weather, and vehicle filters.
- `GET /api/reports/{id}/summary` — descriptive summary JSON; `?format=csv` or `?format=text` downloads a report.

## Validation, privacy, and lifetime

- CSV only; maximum upload size 25 MiB, 100,000 data rows, and 200 columns.
- Up to 10 uploaded or cleaned dataset versions are retained per backend process; restart the service to clear them.
- Empty content, missing/blank headers, duplicate header names, unsupported extensions, malformed CSVs, invalid query values, and unknown dataset IDs return clear HTTP errors.
- Input is read as data only; the service does not execute or save uploaded file contents.
- Dataset IDs are random capabilities and should be treated as private. The API has no user authentication; do not expose it to untrusted networks without adding authorization and rate limiting.
- Datasets are shared by requests reaching the same backend process and disappear when that process restarts. Use a single worker for this in-memory development mode.
- Cleaning always creates a separate dataset ID and leaves the uploaded source unchanged. Row removal happens only when the request explicitly selects a drop operation.

Run automated route tests from the repository root:

```powershell
python -m pytest backend\tests -q
```

# Delivery Insights

Responsive frontend and FastAPI service for **Food Delivery Delay Analysis — Exploratory Data Analysis (EDA)**. Uploaded CSVs are processed in memory; this project does not use a database or run predictive models.

## Run locally (Windows PowerShell)

In a first terminal, create the backend environment and start the API:

```powershell
py -3 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.main:app --reload
```

The API health check is at `http://127.0.0.1:8000/api/health`; interactive documentation is at `http://127.0.0.1:8000/docs`.

In a second terminal, start the existing React frontend:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`), choose **Dataset Explorer**, and upload a CSV. The dashboard switches from clearly labeled illustrative demo data to results calculated from the uploaded dataset.

Configure a different API base URL by changing `VITE_API_BASE_URL` in `.env`. Configure allowed browser origins on the backend with `CORS_ORIGINS`, a comma-separated list. The development default allows `localhost:5173` and `127.0.0.1:5173`; set explicit production origins before deployment.

## Backend tests

```powershell
python -m pip install -r backend\requirements.txt
python -m pytest backend\tests -q
```

See [backend/README.md](./backend/README.md) for endpoints, cleaning operations, resource limits, and data-lifetime details.

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import analysis, correlations, dataset, reports, upload

app = FastAPI(
    title="Food Delivery Delay Analysis API",
    description="In-memory CSV upload and exploratory data analysis API.",
    version="1.0.0",
)

origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(upload.router, prefix="/api")
app.include_router(dataset.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(correlations.router, prefix="/api")
app.include_router(reports.router, prefix="/api")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

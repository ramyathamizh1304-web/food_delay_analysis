from __future__ import annotations

from dataclasses import dataclass
from threading import RLock
from uuid import uuid4

import pandas as pd

MAX_ACTIVE_DATASETS = 10


@dataclass
class StoredDataset:
    frame: pd.DataFrame
    file_name: str
    source_id: str | None = None


class DatasetStore:
    """Process-local dataset storage. Restarting the backend clears all datasets."""

    def __init__(self) -> None:
        self._datasets: dict[str, StoredDataset] = {}
        self._lock = RLock()

    def add(self, frame: pd.DataFrame, file_name: str, source_id: str | None = None) -> str:
        dataset_id = uuid4().hex
        with self._lock:
            if len(self._datasets) >= MAX_ACTIVE_DATASETS:
                raise OverflowError("The in-memory dataset limit has been reached. Restart the backend to clear stored datasets.")
            self._datasets[dataset_id] = StoredDataset(frame.copy(deep=True), file_name, source_id)
        return dataset_id

    def get(self, dataset_id: str) -> StoredDataset | None:
        with self._lock:
            return self._datasets.get(dataset_id)

    def delete(self, dataset_id: str) -> bool:
        with self._lock:
            return self._datasets.pop(dataset_id, None) is not None

    def clear(self) -> None:
        with self._lock:
            self._datasets.clear()


store = DatasetStore()

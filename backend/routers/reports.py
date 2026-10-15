from __future__ import annotations

import csv
from io import StringIO

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse, StreamingResponse

from backend.services.dataset_store import store
from backend.services.report_service import report_summary
from backend.utils.validation import dataset_not_found

router = APIRouter(tags=["reports"])


@router.get("/reports/{dataset_id}/summary")
def get_report(dataset_id: str, format: str | None = Query(None, pattern="^(csv|text)$")):
    stored = store.get(dataset_id)
    if stored is None:
        raise dataset_not_found(dataset_id)
    report = report_summary(stored.frame)
    if format == "text":
        lines = [f"Food Delivery Delay Analysis — {stored.file_name}", "", f"Records: {report['records']}", f"Columns: {report['columns']}", "", "Descriptive findings:"]
        lines.extend(f"- {finding}" for finding in report["findings"])
        lines.extend(["", "Limitations:", *[f"- {item}" for item in report["limitations"]]])
        return PlainTextResponse("\n".join(lines), headers={"Content-Disposition": 'attachment; filename="delivery-analysis-summary.txt"'})
    if format == "csv":
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["section", "metric", "value"])
        writer.writerow(["dataset", "file_name", stored.file_name])
        writer.writerow(["dataset", "records", report["records"]])
        writer.writerow(["dataset", "columns", report["columns"]])
        for key, value in report["overview"].items():
            if isinstance(value, (str, int, float)) or value is None:
                writer.writerow(["overview", key, value if value is not None else ""])
        for index, finding in enumerate(report["findings"], start=1):
            writer.writerow(["finding", index, finding])
        output.seek(0)
        return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="delivery-analysis-summary.csv"'})
    return report

import type { DashboardAnalysis, DatasetMetadata, DatasetPreview, DatasetReport } from '../types/dataset'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api').replace(/\/+$/, '')

interface UploadResponse {
  dataset_id: string
  file_name: string
  file_size_bytes: number
  row_count: number
  column_count: number
  columns: string[]
  preview: DatasetPreview['rows']
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init)
  } catch {
    throw new Error(`Can't reach the analysis service at ${API_BASE_URL}. Start the backend and try again.`)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null
    const detail = typeof body?.detail === 'string' ? body.detail : `Request failed (${response.status}).`
    throw new Error(detail)
  }
  return response.json() as Promise<T>
}

export async function uploadDataset(file: File): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  return request<UploadResponse>('/upload', { method: 'POST', body: formData })
}

export function fetchMetadata(datasetId: string, signal?: AbortSignal) {
  return request<DatasetMetadata>(`/dataset/${encodeURIComponent(datasetId)}/metadata`, { signal })
}

export async function deleteDataset(datasetId: string) {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/dataset/${encodeURIComponent(datasetId)}`, { method: 'DELETE' })
  } catch {
    throw new Error(`Can't reach the analysis service at ${API_BASE_URL}. The uploaded dataset was not cleared.`)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(body?.detail ?? `Unable to clear dataset (${response.status}).`)
  }
}

export function fetchPreview(
  datasetId: string,
  options: { page: number; pageSize: number; search: string; sortBy: string; order: 'asc' | 'desc' },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ page: String(options.page), page_size: String(options.pageSize) })
  if (options.search) params.set('search', options.search)
  if (options.sortBy) {
    params.set('sort_by', options.sortBy)
    params.set('order', options.order)
  }
  return request<DatasetPreview>(`/dataset/${encodeURIComponent(datasetId)}/preview?${params}`, { signal })
}

export function fetchDashboard(datasetId: string, filters: { traffic?: string; weather?: string; vehicle?: string } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
  const query = params.size ? `?${params}` : ''
  return request<DashboardAnalysis>(`/analysis/${encodeURIComponent(datasetId)}/dashboard${query}`, { signal })
}

export function fetchReport(datasetId: string, signal?: AbortSignal) {
  return request<DatasetReport>(`/reports/${encodeURIComponent(datasetId)}/summary`, { signal })
}

export function downloadReport(datasetId: string, format: 'csv' | 'text') {
  return fetch(`${API_BASE_URL}/reports/${encodeURIComponent(datasetId)}/summary?format=${format}`).then(async (response) => {
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { detail?: string } | null
      throw new Error(body?.detail ?? `Download failed (${response.status}).`)
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `delivery-analysis-summary.${format === 'csv' ? 'csv' : 'txt'}`
    link.click()
    URL.revokeObjectURL(url)
  })
}

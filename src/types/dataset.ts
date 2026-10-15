export type DatasetValue = string | number | boolean | null
export type DatasetRow = Record<string, DatasetValue>

export interface DatasetState {
  rows: DatasetRow[]
  columns: string[]
  fileName: string | null
  fileSizeBytes: number | null
  isDemo: boolean
  rowCount?: number
  datasetId?: string
  metadata?: DatasetMetadata
  analysis?: DashboardAnalysis
  report?: DatasetReport
}

export interface FieldMap {
  duration?: string
  traffic?: string
  weather?: string
  distance?: string
  vehicle?: string
  rating?: string
  hour?: string
  delayed?: string
}

export interface DatasetMetadata {
  row_count: number
  column_count: number
  columns: Array<{ name: string; data_type: string; missing_count: number; missing_percentage: number }>
  numerical_columns: string[]
  categorical_columns: string[]
  duplicate_rows: number
  detected_columns: Record<string, string | null>
  categorical_options?: Record<string, string[]>
}

export interface DashboardAnalysis {
  overview: {
    total_records: number
    duration_column: string | null
    average_delivery_duration: number | null
    median_delivery_duration: number | null
    delayed_count: number | null
    delay_status_records?: number | null
    delayed_rate: number | null
    delay_definition: string | null
    detected_columns: Record<string, string | null>
  }
  delivery_time: {
    available: boolean
    reason?: string
    duration_column?: string
    bins?: Array<{ label: string; count: number; lower: number; upper: number }>
    by_vehicle?: Array<{ category: string; count: number; average_duration: number }>
    by_distance?: Array<{ category: string; count: number; average_duration: number }>
    outlier_summary?: { count: number }
  }
  traffic_weather: {
    available: boolean
    traffic_column?: string | null
    weather_column?: string | null
    traffic?: Array<{ category: string; count: number; average_duration: number }>
    weather?: Array<{ category: string; count: number; average_duration: number }>
    combinations?: Array<{ category: string; count: number; average_duration: number }>
  }
  ratings: {
    available: boolean
    reason?: string
    mean?: number
    distribution?: Array<{ rating: number; count: number }>
    rating_vs_duration?: Array<{ rating: number; duration: number }>
    by_delay_status?: Array<{ status: string; count: number; average_rating: number }>
  }
  distance: {
    available: boolean
    reason?: string
    distance_vs_duration?: Array<{ distance: number; duration: number }>
  }
  hourly: {
    available: boolean
    delivery_volume_by_hour?: Array<{ hour: number; count: number; average_duration: number | null }>
  }
  correlation: {
    available: boolean
    columns?: string[]
    matrix?: Array<Array<number | null>>
    method?: string
  }
}

export interface DatasetReport {
  records: number
  columns: number
  overview: DashboardAnalysis['overview']
  findings: string[]
  limitations: string[]
  available_sections: Record<string, boolean>
}

export interface DatasetPreview {
  columns: string[]
  rows: DatasetRow[]
  page: number
  page_size: number
  total_rows: number
  total_pages: number
}

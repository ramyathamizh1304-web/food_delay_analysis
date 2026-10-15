import type { DatasetRow, DatasetState, FieldMap } from '../types/dataset'

const aliases: Record<keyof FieldMap, string[]> = {
  duration: ['delivery_time', 'delivery_duration', 'duration', 'time_taken', 'time_minutes', 'delivery_minutes', 'actual_delivery_time', 'deliverytime'],
  traffic: ['traffic', 'traffic_condition', 'traffic_level', 'road_traffic'],
  weather: ['weather', 'weather_condition', 'weather_type'],
  distance: ['distance', 'distance_km', 'delivery_distance', 'route_distance'],
  vehicle: ['vehicle_type', 'vehicle', 'delivery_vehicle', 'vehicle_category'],
  rating: ['rating', 'customer_rating', 'review_score', 'ratings', 'customer_satisfaction'],
  hour: ['hour', 'hour_of_day', 'delivery_hour', 'order_hour', 'order_time'],
  delayed: ['delayed', 'is_delayed', 'delay_status', 'on_time', 'delivery_status'],
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function detectFields(dataset: DatasetState): FieldMap {
  const fields: FieldMap = {}
  ;(Object.keys(aliases) as Array<keyof FieldMap>).forEach((kind) => {
    const choices = aliases[kind]
    fields[kind] = dataset.columns.find((column) => choices.some((alias) => normalized(column) === normalized(alias)))
      ?? dataset.columns.find((column) => choices.some((alias) => normalized(column).includes(normalized(alias))))
  })
  return fields
}

export function getNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value.replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

export function getAverage(rows: DatasetRow[], field?: string): number | null {
  if (!field) return null
  const values = rows.map((row) => getNumber(row[field])).filter((value): value is number => value !== null)
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function getDelayedFlag(row: DatasetRow, fields: FieldMap): boolean | null {
  if (fields.delayed) {
    const field = normalized(fields.delayed)
    const status = String(row[fields.delayed] ?? '').toLowerCase().trim()
    const onTimeField = field === 'ontime'
    if (['true', 'yes', '1'].includes(status)) return !onTimeField
    if (['false', 'no', '0'].includes(status)) return onTimeField
    if (['delayed', 'late'].includes(status)) return true
    if (['on time', 'ontime', 'not delayed'].includes(status)) return false
    if (fields.delayed !== fields.duration && fields.duration && ['delivered', 'complete', 'completed'].includes(status)) return false
  }
  const duration = fields.duration ? getNumber(row[fields.duration]) : null
  return duration === null ? null : duration > 30
}

export function summarizeDataset(rows: DatasetRow[], fields: FieldMap) {
  const durations = fields.duration ? rows.map((row) => getNumber(row[fields.duration!])).filter((value): value is number => value !== null) : []
  const delayFlags = rows.map((row) => getDelayedFlag(row, fields)).filter((value): value is boolean => value !== null)
  const delayed = delayFlags.filter(Boolean).length
  const ratingAverage = getAverage(rows, fields.rating)
  return {
    total: rows.length,
    average: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
    delayed: delayFlags.length ? delayed : null,
    delayedRate: delayFlags.length ? (delayed / delayFlags.length) * 100 : null,
    onTimeRate: delayFlags.length ? ((delayFlags.length - delayed) / delayFlags.length) * 100 : null,
    ratingAverage,
  }
}

export function getUniqueValues(rows: DatasetRow[], field?: string) {
  if (!field) return []
  return [...new Set(rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined && String(value).trim() !== '').map(String))].sort((a, b) => a.localeCompare(b))
}

export function buildBins(rows: DatasetRow[], field?: string) {
  const values = field ? rows.map((row) => getNumber(row[field])).filter((value): value is number => value !== null) : []
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const width = max - min <= 30 ? 5 : Math.ceil((max - min) / 8 / 5) * 5
  const start = Math.floor(min / width) * width
  const count = Math.max(1, Math.ceil((max - start + 1) / width))
  return Array.from({ length: Math.min(count, 16) }, (_, index) => {
    const low = start + index * width
    const high = low + width
    return { range: `${low}–${high}`, count: values.filter((value) => value >= low && (index === count - 1 ? value <= high : value < high)).length }
  })
}

export function buildCorrelation(dataset: DatasetState, columns: string[]) {
  const uniqueColumns = [...new Set(columns)].filter((column) => dataset.columns.includes(column))
  return uniqueColumns.map((name) => ({
    name,
    values: uniqueColumns.map((other) => pearson(dataset.rows, name, other)),
  }))
}

function pearson(rows: DatasetRow[], first: string, second: string) {
  const pairs = rows.flatMap((row) => {
    const x = getNumber(row[first]); const y = getNumber(row[second])
    return x === null || y === null ? [] : [{ x, y }]
  })
  if (pairs.length < 2) return Number.NaN
  const meanX = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length
  const meanY = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length
  const numerator = pairs.reduce((sum, pair) => sum + (pair.x - meanX) * (pair.y - meanY), 0)
  const denominatorX = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair.x - meanX) ** 2, 0))
  const denominatorY = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair.y - meanY) ** 2, 0))
  return denominatorX && denominatorY ? numerator / (denominatorX * denominatorY) : Number.NaN
}

export function buildDemoDataset(): DatasetRow[] {
  const traffic = ['Low', 'Medium', 'High']
  const weather = ['Clear', 'Cloudy', 'Rainy', 'Foggy']
  const vehicles = ['Scooter', 'Motorcycle', 'Bicycle', 'Car']
  return Array.from({ length: 96 }, (_, index) => {
    const hour = 8 + index % 13
    const distance = Number((1.2 + ((index * 7) % 145) / 10).toFixed(1))
    const trafficCondition = traffic[(Math.floor(index / 3) + index) % traffic.length]
    const weatherCondition = weather[(index * 3 + Math.floor(index / 7)) % weather.length]
    const vehicleType = vehicles[(index * 2 + Math.floor(index / 5)) % vehicles.length]
    const time = Math.round(12 + distance * 1.4 + (trafficCondition === 'High' ? 8 : trafficCondition === 'Medium' ? 4 : 0) + (weatherCondition === 'Rainy' ? 5 : weatherCondition === 'Foggy' ? 2 : 0) + ((index * 7) % 11))
    const rating = Math.max(2, Math.min(5, Number((5.3 - time / 42 + ((index % 5) - 2) * 0.15).toFixed(1))))
    return { Delivery_Time: time, Traffic: trafficCondition, Weather: weatherCondition, Distance: distance, Vehicle_Type: vehicleType, Rating: rating, Hour: hour, Delayed: time > 30 }
  })
}

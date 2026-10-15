import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { Dispatch, SetStateAction } from 'react'
import {
  Activity, BarChart3, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Clock3, CloudSun, Download, FileChartColumn, FileSpreadsheet, Filter, Gauge, LayoutDashboard,
  Menu, Search, Settings as SettingsIcon, ShieldCheck, Star, Table2, Truck, Upload, X,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { DashboardAnalysis, DatasetPreview, DatasetRow, DatasetState, FieldMap } from './types/dataset'
import { deleteDataset, downloadReport as downloadBackendReport, fetchDashboard, fetchMetadata, fetchPreview, fetchReport, uploadDataset } from './services/api'
import {
  buildBins, buildCorrelation, buildDemoDataset, detectFields, getAverage, getDelayedFlag,
  getNumber, getUniqueValues, summarizeDataset,
} from './utils/analytics'
import './App.css'

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/dataset', label: 'Dataset Explorer', icon: Table2 },
  { to: '/delivery', label: 'Delivery Analysis', icon: Truck },
  { to: '/traffic-weather', label: 'Traffic & Weather', icon: CloudSun },
  { to: '/ratings', label: 'Customer Ratings', icon: Star },
  { to: '/correlation', label: 'Correlation Analysis', icon: Activity },
  { to: '/reports', label: 'Reports & Insights', icon: FileChartColumn },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

const chartColors = ['#f47c3c', '#465a78', '#45a890', '#e3ad51', '#9b85cf', '#5ba6d1']
const demoData = buildDemoDataset()
const initialDataset: DatasetState = { rows: demoData, columns: Object.keys(demoData[0]), fileName: null, fileSizeBytes: null, isDemo: true }

function AppShell() {
  const [dataset, setDataset] = useState<DatasetState>(initialDataset)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [noticeOpen, setNoticeOpen] = useState(false)
  const location = useLocation()
  const current = navItems.find((item) => item.to === location.pathname) ?? navItems[0]

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Truck size={20} strokeWidth={2.2} /></div>
          <div><strong>Delivery</strong><span>INSIGHTS</span></div>
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><X size={19} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Dataset Explorer' && dataset.fileName && <span className="nav-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><CircleHelp size={17} /></div><strong>Need a hand?</strong><p>Explore insights from your delivery data.</p><Link to="/reports">View reports <ChevronRight size={13} /></Link></div>
          <div className="sidebar-user"><div className="avatar avatar-small">JD</div><div className="user-meta"><strong>Jordan Davis</strong><span>Analyst workspace</span></div><ChevronDown size={15} /></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{current.label}</strong></div>
          <div className="topbar-actions">
            <div className="global-search"><Search size={16} /><input aria-label="Search data" placeholder="Search anything..." value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></div>
            <div className="notice-wrap">
              <button className={`icon-button notification-button ${noticeOpen ? 'selected' : ''}`} aria-label="Notifications" onClick={() => setNoticeOpen(!noticeOpen)}><Bell size={18} /><i /></button>
              {noticeOpen && <div className="notice-popover"><strong>You're all caught up</strong><span>Dataset insights will appear here.</span></div>}
            </div>
            <div className="topbar-divider" />
            <Link className="profile-button" to="/settings" aria-label="Open profile settings"><div className="avatar">JD</div><ChevronDown size={14} /></Link>
          </div>
        </header>
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Dashboard dataset={dataset} />} />
            <Route path="/dataset" element={<DatasetExplorer dataset={dataset} setDataset={setDataset} search={search} />} />
            <Route path="/delivery" element={<DeliveryAnalysis dataset={dataset} />} />
            <Route path="/traffic-weather" element={<TrafficWeather dataset={dataset} />} />
            <Route path="/ratings" element={<CustomerRatings dataset={dataset} />} />
            <Route path="/correlation" element={<CorrelationAnalysis dataset={dataset} />} />
            <Route path="/reports" element={<Reports dataset={dataset} />} />
            <Route path="/settings" element={<SettingsPage dataset={dataset} setDataset={setDataset} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>
}

function DataBadge({ dataset }: { dataset: DatasetState }) {
  return <span className={`data-badge ${dataset.isDemo ? 'demo-badge' : 'live-badge'}`}><i />{dataset.isDemo ? 'Demo data' : 'Uploaded dataset'}</span>
}

function Panel({ title, subtitle, children, className = '', action }: { title: string; subtitle?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>
}

function SelectControl({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: string[] }) {
  return <label className="select-control"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="All">All {label.toLowerCase()}</option>{options.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={14} /></label>
}

function ChartTooltip({ active, payload, label, suffix = 'min' }: { active?: boolean; payload?: Array<{ value: number | string; name?: string; color?: string }>; label?: string | number; suffix?: string }) {
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><strong>{label}</strong>{payload.map((item, index) => <div key={`${item.name}-${index}`}><i style={{ background: item.color ?? chartColors[index] }} />{item.name ? `${item.name}: ` : ''}{item.value}{suffix ? ` ${suffix}` : ''}</div>)}</div>
}

function Dashboard({ dataset }: { dataset: DatasetState }) {
  const fields = useMemo(() => detectFields(dataset), [dataset])
  const [trafficFilter, setTrafficFilter] = useState('All')
  const [weatherFilter, setWeatherFilter] = useState('All')
  const filterKey = `${dataset.datasetId ?? 'demo'}|${trafficFilter}|${weatherFilter}`
  const [analysisResult, setAnalysisResult] = useState<{ key: string; analysis?: DashboardAnalysis; error?: string }>({ key: '' })
  const isFiltered = trafficFilter !== 'All' || weatherFilter !== 'All'
  const analysis = !isFiltered ? dataset.analysis : analysisResult.key === filterKey ? analysisResult.analysis : undefined
  const analysisError = analysisResult.key === filterKey ? analysisResult.error : undefined
  useEffect(() => {
    if (!dataset.datasetId || (trafficFilter === 'All' && weatherFilter === 'All')) return
    const controller = new AbortController()
    fetchDashboard(dataset.datasetId, { traffic: trafficFilter === 'All' ? undefined : trafficFilter, weather: weatherFilter === 'All' ? undefined : weatherFilter }, controller.signal)
      .then((response) => setAnalysisResult({ key: filterKey, analysis: response }))
      .catch((cause: unknown) => { if (!controller.signal.aborted) setAnalysisResult({ key: filterKey, error: cause instanceof Error ? cause.message : 'Unable to refresh the dashboard.' }) })
    return () => controller.abort()
  }, [dataset.datasetId, trafficFilter, weatherFilter, filterKey, isFiltered])
  const filtered = useMemo(() => dataset.rows.filter((row) =>
    (trafficFilter === 'All' || String(row[fields.traffic ?? '']) === trafficFilter) &&
    (weatherFilter === 'All' || String(row[fields.weather ?? '']) === weatherFilter),
  ), [dataset, fields, trafficFilter, weatherFilter])
  const metrics = dataset.isDemo ? summarizeDataset(filtered, fields) : {
    total: analysis?.overview.total_records ?? dataset.rowCount ?? dataset.rows.length,
    average: analysis?.overview.average_delivery_duration ?? null,
    delayed: analysis?.overview.delayed_count ?? null,
    delayedRate: analysis?.overview.delayed_rate ?? null,
    onTimeRate: analysis?.overview.delayed_rate === null || analysis?.overview.delayed_rate === undefined ? null : 100 - analysis.overview.delayed_rate,
  }
  const bins = dataset.isDemo ? buildBins(filtered, fields.duration) : (analysis?.delivery_time.bins ?? []).map((bin) => ({ range: bin.label, count: bin.count }))
  const traffic = dataset.isDemo ? averageBy(filtered, fields.traffic, fields.duration) : (analysis?.traffic_weather.traffic ?? []).map((item) => ({ label: item.category, value: item.average_duration, count: item.count }))
  const weather = dataset.isDemo ? averageBy(filtered, fields.weather, fields.duration) : (analysis?.traffic_weather.weather ?? []).map((item) => ({ label: item.category, value: item.average_duration, count: item.count }))
  const hours = dataset.isDemo ? averageBy(filtered, fields.hour, fields.duration, true) : (analysis?.hourly.delivery_volume_by_hour ?? []).map((item) => ({ label: `${String(item.hour).padStart(2, '0')}:00`, value: item.average_duration ?? 0, count: item.count }))
  const scatter = dataset.isDemo ? scatterValues(filtered, fields.distance, fields.duration) : (analysis?.distance.distance_vs_duration ?? []).map((item) => ({ x: item.distance, y: item.duration }))
  const ratings = dataset.isDemo ? countValues(filtered, fields.rating) : (analysis?.ratings.distribution ?? []).map((item) => ({ label: String(item.rating), count: item.count }))
  const corr = dataset.isDemo
    ? buildCorrelation(dataset, ['distance', 'duration', 'rating', 'hour'].map((key) => fields[key as keyof FieldMap]).filter((item): item is string => Boolean(item)))
    : (analysis?.correlation.columns ?? []).map((name, row) => ({ name, values: (analysis?.correlation.matrix?.[row] ?? []).map((value) => value ?? Number.NaN) }))
  const categoryOptions = (field: string | undefined) => field ? dataset.metadata?.categorical_options?.[field] ?? getUniqueValues(dataset.rows, field) : []

  return <>
    <PageHeading eyebrow="FOOD DELIVERY DELAY ANALYSIS · EDA" title="Delivery overview" description="A clear picture of delivery performance, powered by your data." action={<><DataBadge dataset={dataset} /><button className="button button-secondary" onClick={() => window.print()}><Download size={15} /> Export view</button></>} />
    {dataset.isDemo && <div className="demo-notice"><div className="notice-symbol"><Activity size={17} /></div><span><strong>You're viewing sample data.</strong> These illustrative metrics are not findings from a real dataset.</span><Link to="/dataset">Upload your CSV <ChevronRight size={14} /></Link></div>}
    {analysisError && <div className="inline-error" role="alert"><X size={15} />{analysisError}</div>}
    <div className="kpi-grid">
      <Kpi title="Total deliveries" value={metrics.total.toLocaleString()} detail={dataset.isDemo ? 'Illustrative demo records' : 'Full uploaded dataset'} icon={Truck} tone="orange" />
      <Kpi title="Avg. delivery time" value={metrics.average === null ? '—' : `${metrics.average.toFixed(1)} min`} detail={fields.duration ? `From ${fields.duration}` : 'Delivery time field not found'} icon={Clock3} tone="blue" />
      <Kpi title="Delayed deliveries" value={metrics.delayed === null ? '—' : metrics.delayed.toLocaleString()} detail={metrics.delayedRate === null ? 'No delay field or duration available' : `${!fields.delayed && fields.duration ? 'Estimated (>30 min) · ' : ''}${metrics.delayedRate.toFixed(1)}% of filtered deliveries`} icon={Gauge} tone="red" />
      <Kpi title="On-time delivery rate" value={metrics.onTimeRate === null ? '—' : `${metrics.onTimeRate.toFixed(1)}%`} detail={metrics.onTimeRate === null ? 'Needs delay or delivery-time data' : 'Based on available delay status'} icon={ShieldCheck} tone="green" />
    </div>
    <div className="filter-bar"><div className="filter-caption"><Filter size={15} /><strong>Quick filters</strong><span>Update dashboard charts</span></div>{fields.traffic && <SelectControl label="Traffic" value={trafficFilter} onChange={setTrafficFilter} options={categoryOptions(fields.traffic)} />}{fields.weather && <SelectControl label="Weather" value={weatherFilter} onChange={setWeatherFilter} options={categoryOptions(fields.weather)} />}{(trafficFilter !== 'All' || weatherFilter !== 'All') && <button className="text-button" onClick={() => { setTrafficFilter('All'); setWeatherFilter('All') }}>Reset filters</button>}</div>
    <div className="chart-grid chart-grid-main">
      <Panel className="span-2" title="Delivery time distribution" subtitle="Number of deliveries by duration · minutes"><ChartEmpty missing={!fields.duration || !bins.length} message="Add a delivery duration column to view the distribution." /><ResponsiveContainer width="100%" height={230}><BarChart data={bins} margin={{ top: 12, right: 4, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="range" tickLine={false} axisLine={false} tick={{ fill: '#8892a1', fontSize: 11 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#8892a1', fontSize: 11 }} /><Tooltip content={<ChartTooltip suffix="deliveries" />} /><Bar dataKey="count" name="Deliveries" fill="#f47c3c" radius={[5, 5, 0, 0]} maxBarSize={46} /></BarChart></ResponsiveContainer></Panel>
      <Panel title="Avg. time by traffic" subtitle="Delivery time across conditions"><ChartEmpty missing={!fields.traffic || !fields.duration || !traffic.length} message="Traffic and duration fields are needed for this chart." /><ResponsiveContainer width="100%" height={230}><BarChart data={traffic} margin={{ top: 10, right: 2, left: -24, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8892a1', fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#8892a1', fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="value" name="Avg. time" fill="#f47c3c" radius={[5, 5, 0, 0]} maxBarSize={42} /></BarChart></ResponsiveContainer></Panel>
      <Panel title="Avg. time by weather" subtitle="Delivery time across conditions"><ChartEmpty missing={!fields.weather || !fields.duration || !weather.length} message="Weather and duration fields are needed for this chart." /><ResponsiveContainer width="100%" height={230}><BarChart data={weather} margin={{ top: 10, right: 2, left: -24, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8892a1', fontSize: 10 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#8892a1', fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="value" name="Avg. time" fill="#4fa992" radius={[5, 5, 0, 0]} maxBarSize={42} /></BarChart></ResponsiveContainer></Panel>
      <Panel className="span-2" title="Delivery volume by hour" subtitle="When orders are reaching their destination"><ChartEmpty missing={!fields.hour || !fields.duration || !hours.length} message="An hour-of-day field is required to show hourly delivery volume." /><ResponsiveContainer width="100%" height={220}><ComposedChart data={hours} margin={{ top: 12, right: 5, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8892a1', fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#8892a1', fontSize: 11 }} /><Tooltip content={<ChartTooltip suffix="deliveries" />} /><Bar dataKey="count" name="Deliveries" fill="#f8c49d" radius={[4, 4, 0, 0]} /><Line type="monotone" dataKey="value" name="Avg. time" stroke="#e96e32" strokeWidth={2.5} dot={{ r: 3, fill: '#e96e32' }} /></ComposedChart></ResponsiveContainer></Panel>
      <Panel title="Time vs. distance" subtitle="Each point represents a delivery"><ChartEmpty missing={!fields.distance || !fields.duration || !scatter.length} message="Distance and delivery duration fields are required." /><ResponsiveContainer width="100%" height={220}><ScatterChart margin={{ top: 12, right: 10, left: -15, bottom: 0 }}><CartesianGrid stroke="#edf0f3" /><XAxis type="number" dataKey="x" name="Distance" tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} label={{ value: 'Distance', position: 'insideBottom', offset: -2, fill: '#8892a1', fontSize: 10 }} /><YAxis type="number" dataKey="y" name="Duration" unit=" min" tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip cursor={{ strokeDasharray: '3 3' }} content={<ChartTooltip />} /><Scatter name="Deliveries" data={scatter} fill="#f47c3c" fillOpacity={0.62} /></ScatterChart></ResponsiveContainer></Panel>
      <Panel title="Customer rating distribution" subtitle="Ratings recorded per score"><ChartEmpty missing={!fields.rating || !ratings.length} message="No customer rating column found in this dataset." /><ResponsiveContainer width="100%" height={220}><BarChart data={ratings} margin={{ top: 12, right: 5, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8892a1', fontSize: 11 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#8892a1', fontSize: 11 }} /><Tooltip content={<ChartTooltip suffix="ratings" />} /><Bar dataKey="count" name="Ratings" fill="#e9b955" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></Panel>
    </div>
    <CorrelationPreview matrix={corr} />
    <div className="page-footnote"><span><i className={dataset.isDemo ? 'dot-demo' : 'dot-live'} />{dataset.isDemo ? 'Illustrative sample data · not real findings' : `Analyzing ${dataset.fileName ?? 'uploaded CSV'} with the local API`}</span><span>Stored in memory until backend restart</span></div>
  </>
}

function Kpi({ title, value, detail, icon: Icon, tone }: { title: string; value: string; detail: string; icon: typeof Truck; tone: string }) {
  return <div className="kpi-card"><div className={`kpi-icon ${tone}`}><Icon size={19} /></div><div className="kpi-title">{title}</div><div className="kpi-value">{value}</div><div className="kpi-detail">{detail}</div></div>
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ChartEmpty({ missing, message }: { missing: boolean; message: string }) {
  return missing ? <div className="chart-empty"><span><FileSpreadsheet size={18} /></span><p>{message}</p></div> : null
}

function averageBy(rows: DatasetRow[], categoryField?: string, valueField?: string, withCount = false) {
  if (!categoryField || !valueField) return []
  const groups = new Map<string, number[]>()
  rows.forEach((row) => {
    const category = row[categoryField]
    const value = getNumber(row[valueField])
    if (category === null || category === undefined || String(category).trim() === '' || value === null) return
    const key = String(category)
    groups.set(key, [...(groups.get(key) ?? []), value])
  })
  return [...groups.entries()].map(([label, values]) => ({ label, value: values.reduce((sum, value) => sum + value, 0) / values.length, count: values.length }))
    .sort((a, b) => withCount ? Number(a.label) - Number(b.label) : a.value - b.value)
}

function countValues(rows: DatasetRow[], field?: string) {
  if (!field) return []
  const groups = new Map<string, number>()
  rows.forEach((row) => { const value = getNumber(row[field]); if (value !== null) groups.set(String(value), (groups.get(String(value)) ?? 0) + 1) })
  return [...groups.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => Number(a.label) - Number(b.label))
}

function scatterValues(rows: DatasetRow[], xField?: string, yField?: string) {
  if (!xField || !yField) return []
  return rows.flatMap((row) => {
    const x = getNumber(row[xField]); const y = getNumber(row[yField])
    return x === null || y === null ? [] : [{ x, y }]
  }).slice(0, 400)
}

function CorrelationPreview({ matrix }: { matrix: ReturnType<typeof buildCorrelation> }) {
  return   <Panel title="Feature correlation" subtitle="A quick look at how numerical features move together" className="correlation-preview" action={<Link className="panel-link" to="/correlation">Explore matrix <ChevronRight size={14} /></Link>}>
    {matrix.length < 2 ? <div className="compact-empty">Add at least two numerical columns to explore feature correlation.</div> : <div className="mini-correlation" style={{ gridTemplateColumns: `repeat(${matrix.length + 1}, minmax(72px, 1fr))` }}>
      <div />{matrix.map((item) => <div className="matrix-label" key={item.name}>{item.name}</div>)}
      {matrix.map((row) => <Fragment key={row.name}><div className="matrix-label">{row.name}</div>{row.values.map((value, index) => <div key={`${row.name}-${index}`} className="matrix-cell" style={{ background: correlationColor(value) }} title={`${row.name} / ${matrix[index].name}: ${Number.isFinite(value) ? value.toFixed(2) : 'unavailable'}`}>{Number.isFinite(value) ? value.toFixed(2) : '—'}</div>)}</Fragment>)}
    </div>}
    <div className="matrix-legend"><span>−1 negative</span><span><i className="legend-gradient" />0 to +1 positive</span></div>
  </Panel>
}

function correlationColor(value: number) {
  if (!Number.isFinite(value)) return '#f2f4f7'
  if (value < 0) return `rgba(91, 143, 190, ${Math.max(.12, Math.abs(value) * .8)})`
  return `rgba(240, 124, 60, ${Math.max(.12, value * .78)})`
}

function DatasetExplorer({ dataset, setDataset, search }: { dataset: DatasetState; setDataset: Dispatch<SetStateAction<DatasetState>>; search: string }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [localSearch, setLocalSearch] = useState('')
  const [sortKey, setSortKey] = useState('')
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(0)
  const [serverPreview, setServerPreview] = useState<{ datasetId: string; preview: DatasetPreview } | null>(null)
  const pageSize = 8
  const fields = useMemo(() => detectFields(dataset), [dataset])
  const query = localSearch || search
  const demoRows = useMemo(() => {
    const filtered = dataset.rows.filter((row) => !query || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query)))
    if (sortKey) filtered.sort((a, b) => {
      const left = a[sortKey]; const right = b[sortKey]
      const compare = typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? ''))
      return sortAsc ? compare : -compare
    })
    return filtered
  }, [dataset, query, sortKey, sortAsc])
  useEffect(() => {
    if (!dataset.datasetId) return
    const controller = new AbortController()
    fetchPreview(dataset.datasetId, { page: page + 1, pageSize, search: query, sortBy: sortKey, order: sortAsc ? 'asc' : 'desc' }, controller.signal)
      .then((preview) => setServerPreview({ datasetId: dataset.datasetId!, preview }))
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load dataset preview.') })
    return () => controller.abort()
  }, [dataset.datasetId, page, query, sortKey, sortAsc])
  const currentPreview = dataset.datasetId && serverPreview?.datasetId === dataset.datasetId ? serverPreview.preview : undefined
  const totalRows = dataset.datasetId ? currentPreview?.total_rows ?? dataset.rowCount ?? dataset.rows.length : demoRows.length
  const pageCount = dataset.datasetId ? currentPreview?.total_pages ?? 1 : Math.max(1, Math.ceil(demoRows.length / pageSize))
  const pageRows = dataset.datasetId ? currentPreview?.rows ?? [] : demoRows.slice(page * pageSize, (page + 1) * pageSize)

  async function processFile(file?: File) {
    setError('')
    if (!file) return
    if (!/\.csv$/i.test(file.name)) { setError('Unsupported file type. Please choose a .csv file.'); return }
    if (file.size === 0) { setError('This file is empty. Select a CSV file with data rows.'); return }
    setLoading(true)
    try {
      const uploaded = await uploadDataset(file)
      const base: DatasetState = {
        rows: uploaded.preview, columns: uploaded.columns, fileName: uploaded.file_name,
        fileSizeBytes: uploaded.file_size_bytes, rowCount: uploaded.row_count,
        datasetId: uploaded.dataset_id, isDemo: false,
      }
      setDataset(base)
      setPage(0); setSortKey(''); setLocalSearch('')
      const results = await Promise.allSettled([
        fetchMetadata(uploaded.dataset_id),
        fetchDashboard(uploaded.dataset_id),
        fetchReport(uploaded.dataset_id),
      ])
      setDataset((current) => current.datasetId !== uploaded.dataset_id ? current : ({
        ...current,
        ...(results[0].status === 'fulfilled' ? { metadata: results[0].value } : {}),
        ...(results[1].status === 'fulfilled' ? { analysis: results[1].value } : {}),
        ...(results[2].status === 'fulfilled' ? { report: results[2].value } : {}),
      }))
      const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failed) setError(`Dataset uploaded, but some analysis data could not be loaded: ${failed.reason instanceof Error ? failed.reason.message : 'Unknown error.'}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to upload this CSV.')
    } finally {
      setLoading(false)
    }
  }
  async function clearDataset() {
    if (dataset.datasetId) {
      setLoading(true)
      try {
        await deleteDataset(dataset.datasetId)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to clear this dataset.')
        setLoading(false)
        return
      }
      setLoading(false)
    }
    setDataset(initialDataset); setPage(0); setSortKey(''); setError('')
  }

  return <>
    <PageHeading eyebrow="YOUR DATA, AT A GLANCE" title="Dataset explorer" description="Upload a CSV to preview its structure and explore your delivery records." action={<DataBadge dataset={dataset} />} />
    <div className="dataset-top-grid">
      <section className={`upload-card ${isDragging ? 'dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); processFile(event.dataTransfer.files[0]) }}>
        <div className="upload-icon"><Upload size={20} /></div><h2>Upload your dataset</h2><p>Drop a CSV file here, or browse files from your device.</p>
        <button className="button button-primary" onClick={() => fileInput.current?.click()} disabled={loading}><Upload size={15} />{loading ? 'Uploading & analyzing…' : 'Browse files'}</button>
        <input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose CSV file" onChange={(event) => { processFile(event.target.files?.[0]); event.target.value = '' }} />
        <span className="upload-hint">CSV files up to 25 MB · Processed in memory by your local API</span>
        {error && <div className="inline-error" role="alert"><X size={15} />{error}</div>}
      </section>
      <section className="dataset-summary">
        <div className="summary-top"><div><div className="eyebrow">ACTIVE DATASET</div><h2>{dataset.fileName ?? 'Illustrative demo dataset'}</h2></div><DataBadge dataset={dataset} /></div>
        <div className="summary-stats"><div><span>Rows</span><strong>{(dataset.rowCount ?? dataset.rows.length).toLocaleString()}</strong></div><div><span>Columns</span><strong>{dataset.columns.length}</strong></div><div><span>File size</span><strong>{dataset.fileSizeBytes === null ? 'Demo sample' : formatFileSize(dataset.fileSizeBytes)}</strong></div></div>
        <div className="field-list"><strong>Detected fields</strong><div>{dataset.columns.slice(0, 7).map((column) => <span key={column}>{column}</span>)}{dataset.columns.length > 7 && <span>+{dataset.columns.length - 7} more</span>}</div></div>
        {!dataset.isDemo && <button className="text-button clear-button" onClick={() => void clearDataset()} disabled={loading}>{loading ? 'Clearing dataset…' : 'Clear uploaded dataset'} <X size={14} /></button>}
      </section>
    </div>
    <Panel title="Dataset preview" subtitle={`${totalRows.toLocaleString()} rows · ${dataset.columns.length} columns`} className="preview-panel" action={<label className="table-search"><Search size={15} /><input value={localSearch} onChange={(event) => { setLocalSearch(event.target.value); setPage(0) }} placeholder="Filter rows..." aria-label="Filter table rows" /></label>}>
      <div className="table-wrap"><table><thead><tr>{dataset.columns.map((column) => <th key={column}><button className="sort-button" onClick={() => { setSortAsc(sortKey === column ? !sortAsc : true); setSortKey(column) }}>{column}<ChevronDown className={sortKey === column && !sortAsc ? 'sort-reversed' : ''} size={13} /></button></th>)}</tr></thead>
        <tbody>{pageRows.map((row, index) => <tr key={`${page}-${index}`}>{dataset.columns.map((column) => <td key={column}>{row[column] === null || row[column] === undefined || row[column] === '' ? <span className="null-value">—</span> : String(row[column])}</td>)}</tr>)}</tbody></table>
        {pageRows.length === 0 && <div className="table-empty"><Search size={20} /><strong>No matching rows</strong><span>Try a different search phrase.</span></div>}
      </div>
      <div className="table-footer"><span>Showing {totalRows ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, totalRows)} of {totalRows.toLocaleString()} records</span><div className="pagination"><button aria-label="Previous page" disabled={page === 0} onClick={() => setPage(Math.max(page - 1, 0))}><ChevronLeft size={16} /></button><span>Page {page + 1} of {pageCount}</span><button aria-label="Next page" disabled={page + 1 >= pageCount} onClick={() => setPage(Math.min(page + 1, pageCount - 1))}><ChevronRight size={16} /></button></div></div>
    </Panel>
    <div className="field-type-row"><strong>Column types</strong><span>Inferred from full dataset</span><div className="field-type-list">{dataset.columns.map((column) => <div key={column}><span>{column}</span><em>{dataset.metadata?.columns.find((item) => item.name === column)?.data_type ?? (dataset.rows.some((row) => typeof row[column] === 'number') ? 'Numeric' : 'Text')}</em></div>)}</div></div>
    <div className="page-footnote"><span><i className={dataset.isDemo ? 'dot-demo' : 'dot-live'} />{dataset.isDemo ? 'Demo data is illustrative only' : 'Your data is processed in your local API and not saved to disk'}</span><span>{fields.duration ? `Duration field: ${fields.duration}` : 'No delivery duration column detected'}</span></div>
  </>
}

function DeliveryAnalysis({ dataset }: { dataset: DatasetState }) {
  const fields = useMemo(() => detectFields(dataset), [dataset])
  const [traffic, setTraffic] = useState('All')
  const [weather, setWeather] = useState('All')
  const [vehicle, setVehicle] = useState('All')
  const filterKey = `${dataset.datasetId ?? 'demo'}|${traffic}|${weather}|${vehicle}`
  const [analysisResult, setAnalysisResult] = useState<{ key: string; analysis?: DashboardAnalysis; error?: string }>({ key: '' })
  const isFiltered = traffic !== 'All' || weather !== 'All' || vehicle !== 'All'
  const analysis = !isFiltered ? dataset.analysis : analysisResult.key === filterKey ? analysisResult.analysis : undefined
  const analysisError = analysisResult.key === filterKey ? analysisResult.error : undefined
  useEffect(() => {
    if (!dataset.datasetId || !isFiltered) return
    const controller = new AbortController()
    fetchDashboard(dataset.datasetId, {
      traffic: traffic === 'All' ? undefined : traffic,
      weather: weather === 'All' ? undefined : weather,
      vehicle: vehicle === 'All' ? undefined : vehicle,
    }, controller.signal).then((response) => setAnalysisResult({ key: filterKey, analysis: response }))
      .catch((cause: unknown) => { if (!controller.signal.aborted) setAnalysisResult({ key: filterKey, error: cause instanceof Error ? cause.message : 'Unable to refresh delivery analysis.' }) })
    return () => controller.abort()
  }, [dataset.datasetId, traffic, weather, vehicle, filterKey, isFiltered])
  const rows = dataset.rows.filter((row) => (!fields.traffic || traffic === 'All' || String(row[fields.traffic]) === traffic) && (!fields.weather || weather === 'All' || String(row[fields.weather]) === weather) && (!fields.vehicle || vehicle === 'All' || String(row[fields.vehicle]) === vehicle))
  const bins = dataset.isDemo ? buildBins(rows, fields.duration) : (analysis?.delivery_time.bins ?? []).map((item) => ({ range: item.label, count: item.count }))
  const vehicleAverages = dataset.isDemo ? averageBy(rows, fields.vehicle, fields.duration) : (analysis?.delivery_time.by_vehicle ?? []).map((item) => ({ label: item.category, value: item.average_duration }))
  const distanceRanges = dataset.isDemo ? bucketByDistance(rows, fields.distance, fields.duration) : (analysis?.delivery_time.by_distance ?? []).map((item) => ({ label: item.category, value: item.average_duration }))
  const statuses = dataset.isDemo ? delayComparison(rows, fields) : analysis?.overview.delayed_count === null || analysis?.overview.delayed_count === undefined
    ? [] : [{ label: 'On time', count: (analysis.overview.delay_status_records ?? analysis.overview.total_records) - analysis.overview.delayed_count }, { label: 'Delayed', count: analysis.overview.delayed_count }]
  const scatter = dataset.isDemo ? scatterValues(rows, fields.distance, fields.duration) : (analysis?.distance.distance_vs_duration ?? []).map((item) => ({ x: item.distance, y: item.duration }))
  return <>
    <PageHeading eyebrow="PERFORMANCE DEEP DIVE" title="Delivery analysis" description="Explore how delivery duration varies across your delivery records." action={<DataBadge dataset={dataset} />} />
    {analysisError && <div className="inline-error" role="alert"><X size={15} />{analysisError}</div>}
    <div className="filter-bar"><div className="filter-caption"><Filter size={15} /><strong>Analysis filters</strong><span>All charts update together</span></div>{fields.traffic && <SelectControl label="Traffic" value={traffic} onChange={setTraffic} options={dataset.metadata?.categorical_options?.[fields.traffic] ?? getUniqueValues(dataset.rows, fields.traffic)} />}{fields.weather && <SelectControl label="Weather" value={weather} onChange={setWeather} options={dataset.metadata?.categorical_options?.[fields.weather] ?? getUniqueValues(dataset.rows, fields.weather)} />}{fields.vehicle && <SelectControl label="Vehicle" value={vehicle} onChange={setVehicle} options={dataset.metadata?.categorical_options?.[fields.vehicle] ?? getUniqueValues(dataset.rows, fields.vehicle)} />}<button className="text-button" onClick={() => { setTraffic('All'); setWeather('All'); setVehicle('All') }}>Reset</button></div>
    <div className="chart-grid">
      <Panel className="span-2" title="Delivery duration distribution" subtitle="Delivery counts grouped into time intervals"><ChartEmpty missing={!fields.duration || !bins.length} message="A delivery duration column is required for this chart." /><ResponsiveContainer width="100%" height={260}><BarChart data={bins} margin={{ top: 16, right: 12, left: -12, bottom: 4 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="range" tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip suffix="deliveries" />} /><Bar dataKey="count" name="Deliveries" fill="#f47c3c" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></Panel>
      <Panel title="Duration by vehicle type" subtitle="Average delivery time by vehicle"><ChartEmpty missing={!fields.vehicle || !fields.duration || !vehicleAverages.length} message="Vehicle type and delivery duration columns are required." /><ResponsiveContainer width="100%" height={260}><BarChart data={vehicleAverages} margin={{ top: 16, right: 10, left: -16, bottom: 4 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="value" name="Avg. duration" fill="#4b7191" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></Panel>
      <Panel title="Duration by distance range" subtitle="Average time across distance bands"><ChartEmpty missing={!fields.distance || !fields.duration || !distanceRanges.length} message="Distance and duration fields are needed to group these records." /><ResponsiveContainer width="100%" height={260}><BarChart data={distanceRanges} margin={{ top: 16, right: 10, left: -16, bottom: 4 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="value" name="Avg. duration" fill="#4fa992" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></Panel>
      <Panel title="Delayed vs. non-delayed" subtitle={dataset.isDemo ? 'Illustrative demo delay status' : analysis?.overview.delay_definition ?? 'Delay status unavailable for this dataset'}><ChartEmpty missing={!statuses.length} message="An explicit delay field, delivery deadline, or configured threshold is required." /><ResponsiveContainer width="100%" height={260}><BarChart data={statuses} margin={{ top: 16, right: 12, left: -12, bottom: 4 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip suffix="deliveries" />} /><Bar dataKey="count" name="Deliveries" radius={[5, 5, 0, 0]}>{statuses.map((entry) => <Cell key={entry.label} fill={entry.label === 'Delayed' ? '#f47c3c' : '#4fa992'} />)}</Bar></BarChart></ResponsiveContainer></Panel>
      <Panel title="Duration vs. distance" subtitle="Individual records in the filtered data"><ChartEmpty missing={!fields.distance || !fields.duration || !scatter.length} message="Distance and delivery duration fields are required." /><ResponsiveContainer width="100%" height={260}><ScatterChart margin={{ top: 15, right: 15, left: -12, bottom: 4 }}><CartesianGrid stroke="#edf0f3" /><XAxis dataKey="x" type="number" name="Distance" tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis dataKey="y" type="number" name="Duration" unit=" min" tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip />} /><Scatter data={scatter} fill="#f47c3c" fillOpacity={0.62} /></ScatterChart></ResponsiveContainer></Panel>
    </div>
    <div className="page-footnote"><span><i className={dataset.isDemo ? 'dot-demo' : 'dot-live'} />{dataset.isDemo ? 'Illustrative demo visualizations' : 'Computed from uploaded CSV values'}</span><span>Filters update available charts only</span></div>
  </>
}

function bucketByDistance(rows: DatasetRow[], distanceField?: string, durationField?: string) {
  if (!distanceField || !durationField) return []
  const groups = new Map<string, number[]>()
  rows.forEach((row) => {
    const distance = getNumber(row[distanceField]); const duration = getNumber(row[durationField])
    if (distance === null || duration === null) return
    const lower = Math.floor(distance / 2) * 2
    const label = `${lower}–${lower + 2} km`
    groups.set(label, [...(groups.get(label) ?? []), duration])
  })
  return [...groups.entries()].map(([label, values]) => ({ label, value: values.reduce((sum, item) => sum + item, 0) / values.length })).sort((a, b) => parseInt(a.label) - parseInt(b.label))
}

function delayComparison(rows: DatasetRow[], fields: FieldMap) {
  if (!fields.duration) return []
  let delayedCount = 0; let otherCount = 0
  rows.forEach((row) => { if (getDelayedFlag(row, fields) === true) delayedCount++; else if (getDelayedFlag(row, fields) === false) otherCount++ })
  return [{ label: 'On time', count: otherCount }, { label: 'Delayed', count: delayedCount }].filter((item) => item.count > 0)
}

function TrafficWeather({ dataset }: { dataset: DatasetState }) {
  const fields = useMemo(() => detectFields(dataset), [dataset])
  const traffic = dataset.isDemo ? averageBy(dataset.rows, fields.traffic, fields.duration) : (dataset.analysis?.traffic_weather.traffic ?? []).map((item) => ({ label: item.category, value: item.average_duration }))
  const weather = dataset.isDemo ? averageBy(dataset.rows, fields.weather, fields.duration) : (dataset.analysis?.traffic_weather.weather ?? []).map((item) => ({ label: item.category, value: item.average_duration }))
  const trafficField = fields.traffic
  const weatherField = fields.weather
  const comboRows = trafficField && weatherField && fields.duration ? dataset.rows.map((row) => ({ ...row, __condition: `${row[trafficField]} · ${row[weatherField]}` })) : []
  const comboData = dataset.isDemo ? averageBy(comboRows, '__condition', fields.duration) : (dataset.analysis?.traffic_weather.combinations ?? []).map((item) => ({ label: item.category, value: item.average_duration }))
  return <>
    <PageHeading eyebrow="CONTEXTUAL FACTORS" title="Traffic & weather" description="Compare delivery times across reported road and weather conditions." action={<DataBadge dataset={dataset} />} />
    <div className="context-callout"><CloudSun size={19} /><p><strong>Context matters.</strong> These comparisons describe patterns in the selected data; they do not establish that traffic or weather caused a delivery delay.</p></div>
    <div className="chart-grid">
      <Panel title="Traffic condition comparison" subtitle="Average delivery duration by traffic"><ChartEmpty missing={!fields.traffic || !fields.duration || !traffic.length} message={`Requires traffic and delivery duration fields. ${!fields.traffic ? 'Traffic column not detected.' : !fields.duration ? 'Duration column not detected.' : ''}`} /><ResponsiveContainer width="100%" height={280}><BarChart data={traffic} margin={{ top: 16, right: 10, left: -14, bottom: 4 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="value" name="Avg. duration" fill="#f47c3c" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></Panel>
      <Panel title="Weather condition comparison" subtitle="Average delivery duration by weather"><ChartEmpty missing={!fields.weather || !fields.duration || !weather.length} message={`Requires weather and delivery duration fields. ${!fields.weather ? 'Weather column not detected.' : !fields.duration ? 'Duration column not detected.' : ''}`} /><ResponsiveContainer width="100%" height={280}><BarChart data={weather} margin={{ top: 16, right: 10, left: -14, bottom: 4 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="value" name="Avg. duration" fill="#4fa992" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></Panel>
      <Panel className="span-2" title="Traffic and weather combinations" subtitle="Average duration across combined conditions"><ChartEmpty missing={!fields.traffic || !fields.weather || !fields.duration || !comboData.length} message={`Requires traffic, weather, and delivery duration fields. Missing: ${[!fields.traffic && 'traffic', !fields.weather && 'weather', !fields.duration && 'delivery duration'].filter(Boolean).join(', ')}.`} /><ResponsiveContainer width="100%" height={300}><BarChart data={comboData} margin={{ top: 16, right: 10, left: -14, bottom: 4 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} interval={0} /><YAxis tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="value" name="Avg. duration" fill="#637996" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Panel>
    </div>
    <div className="page-footnote"><span><i className={dataset.isDemo ? 'dot-demo' : 'dot-live'} />{dataset.isDemo ? 'Illustrative demo visualizations' : 'Computed from uploaded CSV values'}</span><span>{fields.traffic && fields.weather ? `${fields.traffic} · ${fields.weather}` : 'Some required fields were not detected'}</span></div>
  </>
}

function CustomerRatings({ dataset }: { dataset: DatasetState }) {
  const fields = useMemo(() => detectFields(dataset), [dataset])
  const ratings = dataset.isDemo ? countValues(dataset.rows, fields.rating) : (dataset.analysis?.ratings.distribution ?? []).map((item) => ({ label: String(item.rating), count: item.count }))
  const average = dataset.isDemo ? getAverage(dataset.rows, fields.rating) : dataset.analysis?.ratings.mean ?? null
  const scatter = dataset.isDemo ? scatterValues(dataset.rows, fields.duration, fields.rating) : (dataset.analysis?.ratings.rating_vs_duration ?? []).map((item) => ({ x: item.duration, y: item.rating }))
  const ratingByDelay = dataset.isDemo ? delayRating(dataset.rows, fields) : (dataset.analysis?.ratings.by_delay_status ?? []).map((item) => ({ label: item.status, value: item.average_rating }))
  const hasRating = Boolean(fields.rating && (dataset.isDemo ? ratings.length : dataset.analysis?.ratings.available))
  return <>
    <PageHeading eyebrow="VOICE OF THE CUSTOMER" title="Customer ratings" description="Understand how customer feedback is distributed across deliveries." action={<DataBadge dataset={dataset} />} />
    {!hasRating ? <div className="empty-feature"><div><Star size={23} /></div><h2>No rating data detected</h2><p>This dataset doesn’t include a customer rating column. Add a column such as <code>rating</code>, <code>customer_rating</code>, or <code>review_score</code> to explore feedback.</p><Link className="button button-secondary" to="/dataset">Explore dataset <ChevronRight size={15} /></Link></div> : <>
      <div className="kpi-grid ratings-kpi"><Kpi title="Average customer rating" value={average === null ? '—' : `${average.toFixed(2)} / 5`} detail={`Calculated from ${ratings.reduce((sum, item) => sum + item.count, 0).toLocaleString()} numeric ratings`} icon={Star} tone="orange" /><Kpi title="Rating scores" value={String(ratings.length)} detail="Distinct numeric score values" icon={BarChart3} tone="blue" /><Kpi title="Records with ratings" value={ratings.reduce((sum, item) => sum + item.count, 0).toLocaleString()} detail="Rows containing a valid rating" icon={FileSpreadsheet} tone="green" /></div>
      <div className="chart-grid"><Panel title="Rating distribution" subtitle="Number of records at each rating"><ResponsiveContainer width="100%" height={280}><BarChart data={ratings} margin={{ top: 16, right: 10, left: -12, bottom: 4 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip suffix="ratings" />} /><Bar dataKey="count" name="Ratings" fill="#e9b955" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></Panel>
        <Panel title="Rating vs. delivery duration" subtitle="Each point represents a rated delivery"><ChartEmpty missing={!fields.duration || !scatter.length} message="A delivery duration column is also required for this comparison." /><ResponsiveContainer width="100%" height={280}><ScatterChart margin={{ top: 16, right: 12, left: -12, bottom: 4 }}><CartesianGrid stroke="#edf0f3" /><XAxis type="number" dataKey="x" name="Duration" unit=" min" tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis type="number" dataKey="y" name="Rating" tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip />} /><Scatter data={scatter} fill="#f47c3c" fillOpacity={0.62} /></ScatterChart></ResponsiveContainer></Panel>
        <Panel className="span-2" title="Ratings by delay status" subtitle={fields.delayed ? `Grouped by “${fields.delayed}”` : 'Estimated delay status uses a 30-minute duration threshold'}><ChartEmpty missing={!ratingByDelay.length} message="A valid rating and delivery time or delay-status field are required." /><ResponsiveContainer width="100%" height={260}><BarChart data={ratingByDelay} margin={{ top: 16, right: 10, left: -12, bottom: 4 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: '#8892a1', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip suffix="stars" />} /><Bar dataKey="value" name="Average rating" fill="#e9b955" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></Panel></div>
    </>}
    <div className="page-footnote"><span><i className={dataset.isDemo ? 'dot-demo' : 'dot-live'} />{dataset.isDemo ? 'Ratings shown are illustrative demo data' : 'Ratings computed from uploaded CSV values'}</span><span>Empty when no valid rating column is present</span></div>
  </>
}

function delayRating(rows: DatasetRow[], fields: FieldMap) {
  if (!fields.rating || !fields.duration) return []
  const groups = new Map<string, number[]>()
  rows.forEach((row) => {
    const rating = getNumber(row[fields.rating!]); const delayed = getDelayedFlag(row, fields)
    if (rating === null || delayed === null) return
    const key = delayed ? 'Delayed' : 'On time'
    groups.set(key, [...(groups.get(key) ?? []), rating])
  })
  return [...groups.entries()].map(([label, values]) => ({ label, value: values.reduce((sum, item) => sum + item, 0) / values.length }))
}

function CorrelationAnalysis({ dataset }: { dataset: DatasetState }) {
  const numericFields = dataset.metadata?.numerical_columns ?? dataset.columns.filter((column) => dataset.rows.some((row) => getNumber(row[column]) !== null))
  const [selection, setSelection] = useState<{ datasetId?: string; columns: string[] }>({ datasetId: dataset.datasetId, columns: numericFields.slice(0, 7) })
  const selected = selection.datasetId === dataset.datasetId ? selection.columns : numericFields.slice(0, 7)
  const matrix = dataset.isDemo
    ? buildCorrelation(dataset, selected)
    : (() => {
      const allColumns = dataset.analysis?.correlation.columns ?? []
      const values = dataset.analysis?.correlation.matrix ?? []
      const indexes = selected.map((column) => allColumns.indexOf(column))
      return selected.map((name, row) => ({
        name,
        values: indexes.map((columnIndex) => columnIndex < 0 ? Number.NaN : values[indexes[row]]?.[columnIndex] ?? Number.NaN),
      }))
    })()
  function toggle(column: string) { setSelection({ datasetId: dataset.datasetId, columns: selected.includes(column) ? selected.filter((item) => item !== column) : [...selected, column] }) }
  return <>
    <PageHeading eyebrow="NUMERICAL RELATIONSHIPS" title="Correlation analysis" description="Explore linear relationships between numerical features in your dataset." action={<DataBadge dataset={dataset} />} />
    <div className="context-callout"><Activity size={19} /><p><strong>How to read this:</strong> correlations range from −1 to +1. A positive value means two features tend to rise together; a negative value means one tends to fall as the other rises. Correlation does not prove causation.</p></div>
    <Panel title="Select numerical features" subtitle="Choose at least two columns to calculate Pearson correlation">
      {numericFields.length ? <div className="feature-toggles">{numericFields.map((column) => <label key={column} className={selected.includes(column) ? 'feature-selected' : ''}><input type="checkbox" checked={selected.includes(column)} onChange={() => toggle(column)} /><span>{column}</span></label>)}</div> : <div className="compact-empty">No numeric columns detected. Upload a dataset containing numerical values to begin.</div>}
    </Panel>
    <Panel className="matrix-panel" title="Feature correlation matrix" subtitle={matrix.length ? `Pearson correlation · ${matrix.length} numerical features selected` : 'Select at least two valid numeric columns'}>
      {matrix.length < 2 ? <div className="empty-matrix"><div><Activity size={22} /></div><strong>Not enough numerical data</strong><p>Select two or more numeric columns with multiple valid values.</p></div> : <div className="matrix-scroll"><div className="correlation-matrix" style={{ gridTemplateColumns: `140px repeat(${matrix.length}, minmax(70px, 1fr))` }}><div className="matrix-corner">FEATURE</div>{matrix.map((item) => <div className="matrix-header" key={`header-${item.name}`}>{item.name}</div>)}{matrix.map((row) => <Fragment key={row.name}><div className="matrix-row-label">{row.name}</div>{row.values.map((value, index) => <div className="correlation-cell" key={`${row.name}-${index}`} style={{ background: correlationColor(value), color: Math.abs(value) > .55 ? '#fff' : '#364153' }} title={`${row.name} and ${matrix[index].name}: ${Number.isFinite(value) ? value.toFixed(3) : 'unavailable'}`}>{Number.isFinite(value) ? value.toFixed(2) : '—'}</div>)}</Fragment>)}</div></div>}
      <div className="scale-wrap"><span>−1.0</span><div className="correlation-scale" /><span>0</span><div className="correlation-scale correlation-scale-positive" /><span>+1.0</span></div>
    </Panel>
    <div className="page-footnote"><span><i className={dataset.isDemo ? 'dot-demo' : 'dot-live'} />{dataset.isDemo ? 'Demo-only numerical relationships' : 'Calculated from valid numeric values in your CSV'}</span><span>Missing or constant columns may show —</span></div>
  </>
}

function Reports({ dataset }: { dataset: DatasetState }) {
  const fields = useMemo(() => detectFields(dataset), [dataset])
  const [downloadError, setDownloadError] = useState('')
  const metrics = dataset.isDemo ? summarizeDataset(dataset.rows, fields) : {
    total: dataset.analysis?.overview.total_records ?? dataset.rowCount ?? dataset.rows.length,
    average: dataset.analysis?.overview.average_delivery_duration ?? null,
    delayed: dataset.analysis?.overview.delayed_count ?? null,
    delayedRate: dataset.analysis?.overview.delayed_rate ?? null,
    onTimeRate: dataset.analysis?.overview.delayed_rate == null ? null : 100 - dataset.analysis.overview.delayed_rate,
    ratingAverage: dataset.analysis?.ratings.mean ?? null,
  }
  const summary = `Food Delivery Delay Analysis — Descriptive Summary\n${'='.repeat(50)}\nDataset: ${dataset.fileName ?? 'Illustrative demo data'}\nRows: ${dataset.rows.length}\nColumns: ${dataset.columns.length}\n${fields.duration ? `Average delivery duration: ${metrics.average?.toFixed(2) ?? 'N/A'} minutes\n` : ''}${metrics.delayedRate !== null ? `Delayed deliveries: ${metrics.delayed} (${metrics.delayedRate.toFixed(1)}%)\n` : ''}${metrics.onTimeRate !== null ? `On-time rate: ${metrics.onTimeRate.toFixed(1)}%\n` : ''}${fields.rating && metrics.ratingAverage !== null ? `Average rating: ${metrics.ratingAverage.toFixed(2)}\n` : ''}\n${dataset.isDemo ? 'Note: This report uses illustrative demo data. It is not a real dataset finding.' : 'Note: Descriptive statistics only. Correlation does not imply causation.'}`
  function downloadReport() {
    if (dataset.datasetId) {
      setDownloadError('')
      void downloadBackendReport(dataset.datasetId, 'text').catch((cause: unknown) => setDownloadError(cause instanceof Error ? cause.message : 'Unable to download the report.'))
      return
    }
    const url = URL.createObjectURL(new Blob([summary], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'delivery-analysis-summary.txt'; anchor.click(); URL.revokeObjectURL(url)
  }
  function downloadCsv() {
    if (!dataset.datasetId) return
    setDownloadError('')
    void downloadBackendReport(dataset.datasetId, 'csv').catch((cause: unknown) => setDownloadError(cause instanceof Error ? cause.message : 'Unable to download the report.'))
  }
  const traffic = dataset.isDemo ? averageBy(dataset.rows, fields.traffic, fields.duration) : (dataset.analysis?.traffic_weather.traffic ?? []).map((item) => ({ label: item.category, value: item.average_duration }))
  const bins = dataset.isDemo ? buildBins(dataset.rows, fields.duration) : (dataset.analysis?.delivery_time.bins ?? []).map((item) => ({ range: item.label, count: item.count }))
  const ratings = dataset.isDemo ? countValues(dataset.rows, fields.rating) : (dataset.analysis?.ratings.distribution ?? []).map((item) => ({ label: String(item.rating), count: item.count }))
  return <>
    <PageHeading eyebrow="SHAREABLE DATA STORY" title="Reports & insights" description="Descriptive summaries generated from the currently selected dataset." action={<><DataBadge dataset={dataset} />{dataset.datasetId && <button className="button button-secondary" onClick={downloadCsv}><Download size={15} /> CSV</button>}<button className="button button-primary" onClick={downloadReport}><Download size={15} /> Download summary</button><button className="button button-secondary print-button" onClick={() => window.print()}>Print</button></>} />
    <div className="report-warning"><FileChartColumn size={18} /><span><strong>{dataset.isDemo ? 'Demo report.' : 'Descriptive report.'}</strong> {dataset.isDemo ? 'Sample results are illustrative only and are not real findings.' : 'Metrics describe this dataset only; correlations are not causal evidence.'}</span></div>
    {downloadError && <div className="inline-error" role="alert"><X size={15} />{downloadError}</div>}
    <div className="kpi-grid report-kpis"><Kpi title="Records analyzed" value={metrics.total.toLocaleString()} detail={`${dataset.columns.length} dataset columns`} icon={FileSpreadsheet} tone="blue" /><Kpi title="Average delivery time" value={metrics.average === null ? '—' : `${metrics.average.toFixed(1)} min`} detail={fields.duration ? `Field: ${fields.duration}` : 'No duration field detected'} icon={Clock3} tone="orange" /><Kpi title="Delayed share" value={metrics.delayedRate === null ? '—' : `${metrics.delayedRate.toFixed(1)}%`} detail={metrics.delayed === null ? 'No delay information detected' : `${metrics.delayed} delayed deliveries`} icon={Gauge} tone="red" /><Kpi title="Average rating" value={metrics.ratingAverage === null ? '—' : `${metrics.ratingAverage.toFixed(2)} / 5`} detail={fields.rating ? `Field: ${fields.rating}` : 'No rating field detected'} icon={Star} tone="green" /></div>
    <Panel title="Descriptive summary" subtitle="Automatically generated from available columns" className="summary-report"><div className="summary-prose"><h3>Dataset overview</h3><p>The current dataset contains <strong>{metrics.total.toLocaleString()} records</strong> across <strong>{dataset.columns.length} columns</strong>. {dataset.isDemo ? 'These records are generated sample data and should not be interpreted as actual delivery performance.' : `The active file is ${dataset.fileName}. Values were analyzed by your local API.`}</p>{metrics.average !== null && <><h3>Delivery duration</h3><p>Across records with numeric values in <code>{fields.duration}</code>, the average delivery duration is <strong>{metrics.average.toFixed(1)} minutes</strong>.</p></>}{metrics.delayedRate !== null && <><h3>Delay status</h3><p>{metrics.delayed} records ({metrics.delayedRate.toFixed(1)}%) are classified using {dataset.analysis?.overview.delay_definition ?? 'the demo delay status'}.</p></>}{metrics.ratingAverage !== null && <><h3>Customer ratings</h3><p>The average numeric rating is <strong>{metrics.ratingAverage.toFixed(2)}</strong> across records with valid rating values.</p></>}{dataset.report?.findings.map((finding, index) => <p key={index}>{finding}</p>)}<div className="summary-caveat">{dataset.report?.limitations.join(' ') ?? 'These are descriptive statistics. They do not establish causal relationships, and missing values or inferred fields can affect the totals.'}</div></div></Panel>
    <div className="section-title"><h2>Chart gallery</h2><p>Visual summaries from detected dataset fields.</p></div>
    <div className="chart-grid"><Panel title="Delivery duration distribution" subtitle="Records grouped by duration"><ChartEmpty missing={!fields.duration || !bins.length} message="No delivery duration field detected." /><ResponsiveContainer width="100%" height={220}><BarChart data={bins} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="range" tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip suffix="deliveries" />} /><Bar dataKey="count" name="Deliveries" fill="#f47c3c" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Panel><Panel title="Avg. time by traffic" subtitle="Across reported traffic conditions"><ChartEmpty missing={!fields.traffic || !fields.duration || !traffic.length} message="Traffic and duration fields are required." /><ResponsiveContainer width="100%" height={220}><BarChart data={traffic} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="value" name="Avg. time" fill="#4fa992" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Panel><Panel title="Customer rating distribution" subtitle="Numeric rating counts"><ChartEmpty missing={!fields.rating || !ratings.length} message="No rating column was detected." /><ResponsiveContainer width="100%" height={220}><BarChart data={ratings} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="label" tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#8892a1', fontSize: 10 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip suffix="ratings" />} /><Bar dataKey="count" name="Ratings" fill="#e9b955" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Panel></div>
    <div className="page-footnote"><span><i className={dataset.isDemo ? 'dot-demo' : 'dot-live'} />{dataset.isDemo ? 'Every result shown is illustrative sample data' : `Based on ${dataset.fileName}`}</span><span>Export CSV / text summary or print this report</span></div>
  </>
}

function SettingsPage({ dataset, setDataset }: { dataset: DatasetState; setDataset: (state: DatasetState) => void }) {
  const [error, setError] = useState('')
  async function restoreDemo() {
    setError('')
    try {
      if (dataset.datasetId) await deleteDataset(dataset.datasetId)
      setDataset(initialDataset)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to restore the demo dataset.')
    }
  }
  return <>
    <PageHeading eyebrow="PREFERENCES" title="Settings" description="Manage your local analysis workspace and dataset." />
    <Panel title="Workspace preferences" subtitle="Dashboard display and privacy settings" className="settings-panel">
      <div className="setting-row"><div><strong>Use sample dataset</strong><p>Restore the illustrative demo data for exploring the dashboard.</p></div><button className={`button ${dataset.isDemo ? 'button-secondary' : 'button-primary'}`} onClick={() => void restoreDemo()}>{dataset.isDemo ? <><Check size={15} /> Active</> : 'Restore demo data'}</button></div>
      <div className="setting-row"><div><strong>Browser-only data processing</strong><p>CSV files are parsed on this device and are never uploaded to a server.</p></div><span className="privacy-pill"><ShieldCheck size={14} /> Always on</span></div>
      <div className="setting-row"><div><strong>Dashboard appearance</strong><p>Light theme for a clear, print-friendly analytics workspace.</p></div><span className="privacy-pill">Light</span></div>
    </Panel>
    {error && <div className="inline-error" role="alert"><X size={15} />{error}</div>}
    <div className="settings-help"><div><CircleHelp size={19} /><span><strong>About this project</strong><br />Food Delivery Delay Analysis — Exploratory Data Analysis (EDA)</span></div><span>Frontend demo · no backend services</span></div>
  </>
}

function App() {
  return <BrowserRouter><AppShell /></BrowserRouter>
}

export default App

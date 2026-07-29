import { useEffect, useMemo, useState, useCallback } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { ColDef } from 'ag-grid-community'
import { Search, Download, X, Loader2, FileText, RefreshCw, FileSpreadsheet } from 'lucide-react'
import { clsx } from 'clsx'
import {
  searchAuditLogs,
  getAuditActions,
  getAuditExportCsvUrl,
  getAuditExportXlsxUrl,
  listTenants,
  AuditEvent,
  AuditSearchParams,
  Tenant,
} from '@/lib/platformAdminApi'
import { usePlatformToastStore } from '@/store/platformToastStore'
import keycloak from '@/lib/keycloak'

export default function AuditLogsPage() {
  const showToast = usePlatformToastStore((s) => s.show)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [totalElements, setTotalElements] = useState(0)
  const [page, setPage] = useState(0)
  const [size] = useState(50)
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [actions, setActions] = useState<string[]>([])

  // Filters
  const [search, setSearch] = useState('')
  const [tenantFilter, setTenantFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [detailEvent, setDetailEvent] = useState<AuditEvent | null>(null)

  useEffect(() => {
    Promise.all([listTenants(), getAuditActions()]).then(([t, a]) => {
      setTenants(t)
      setActions(a)
    }).catch(() => {})
  }, [])

  const buildParams = useCallback((): AuditSearchParams => ({
    search: search.trim() || undefined,
    tenantId: tenantFilter || undefined,
    action: actionFilter || undefined,
    status: statusFilter || undefined,
    startDate: startDate ? new Date(startDate).toISOString() : undefined,
    // End-of-day, not midnight — a date-only value parses to 00:00:00.000Z,
    // which would exclude nearly all of the selected day's real events from
    // a "timestamp <= endDate" filter.
    endDate: endDate ? new Date(`${endDate}T23:59:59.999Z`).toISOString() : undefined,
    page,
    size,
  }), [search, tenantFilter, actionFilter, statusFilter, startDate, endDate, page, size])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const result = await searchAuditLogs(buildParams())
      setEvents(result.content)
      setTotalElements(result.totalElements)
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }, [buildParams, showToast])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const downloadExport = (url: string, filename: string) => {
    fetch(url, { headers: { Authorization: `Bearer ${keycloak.token}` } })
      .then(r => r.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.setAttribute('download', filename)
        link.click()
        URL.revokeObjectURL(blobUrl)
      })
      .catch(() => showToast('error', 'Export failed'))
  }

  const handleExportCsv = () => downloadExport(getAuditExportCsvUrl(buildParams()), 'platform-audit-log.csv')
  const handleExportXlsx = () => downloadExport(getAuditExportXlsxUrl(buildParams()), 'platform-audit-log.xlsx')

  const totalPages = Math.ceil(totalElements / size)

  const columnDefs = useMemo<ColDef[]>(() => [
    {
      field: 'timestamp', headerName: 'TIME', flex: 1.2,
      cellRenderer: (p: any) => <span className="text-[11px] text-neutral-300">{p.value ? new Date(p.value).toLocaleString() : ''}</span>
    },
    {
      field: 'adminUsername', headerName: 'ADMIN', flex: 1,
      cellRenderer: (p: any) => <span className="text-[11px] text-white font-semibold">{p.value}</span>
    },
    {
      field: 'action', headerName: 'ACTION', flex: 1.2,
      cellRenderer: (p: any) => (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#7C3AED]/10 text-[#7C3AED]">
          {(p.value || '').replace(/_/g, ' ')}
        </span>
      )
    },
    {
      field: 'targetUsername', headerName: 'TARGET', flex: 1,
      cellRenderer: (p: any) => <span className="text-[11px] text-neutral-300">{p.value || '—'}</span>
    },
    {
      field: 'tenantName', headerName: 'TENANT', flex: 0.8,
      cellRenderer: (p: any) => <span className="text-[11px] text-neutral-400">{p.value || '—'}</span>
    },
    {
      field: 'status', headerName: 'STATUS', flex: 0.6,
      cellRenderer: (p: any) => (
        <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded',
          p.value === 'SUCCESS' ? 'bg-[#00FF99]/10 text-[#00FF99]' : 'bg-danger/10 text-danger'
        )}>{p.value}</span>
      )
    },
    {
      headerName: '', width: 60,
      cellRenderer: (p: any) => (
        <button onClick={() => setDetailEvent(p.data)} className="text-[10px] text-[#7C3AED] hover:underline font-bold">View</button>
      )
    },
  ], [])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between border-b border-neutral-900 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight uppercase">Audit Logs</h1>
          <p className="text-[10px] text-neutral-600 mt-1">{totalElements} total records</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLogs} className="flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 font-bold px-3 py-2 rounded-xl text-[11px]">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={handleExportCsv} className="flex items-center gap-1.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold px-3 py-2 rounded-xl text-[11px]">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={handleExportXlsx} className="flex items-center gap-1.5 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold px-3 py-2 rounded-xl text-[11px]">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export XLSX
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="relative col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-600" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            placeholder="Search users, emails, tenants..."
            className="w-full bg-[#0C0C0D] border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-[#7C3AED]/50" />
        </div>
        <select value={tenantFilter} onChange={(e) => { setTenantFilter(e.target.value); setPage(0) }}
          className="bg-[#0C0C0D] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white">
          <option value="">All Tenants</option>
          {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(0) }}
          className="bg-[#0C0C0D] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white">
          <option value="">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
        <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(0) }}
          className="bg-[#0C0C0D] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white" />
        <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(0) }}
          className="bg-[#0C0C0D] border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white" />
      </div>

      {/* Grid */}
      <div className="ag-theme-platform-admin w-full" style={{ height: 520 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 text-[#7C3AED] animate-spin" /></div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <FileText className="w-10 h-10 text-neutral-700" />
            <p className="text-xs text-neutral-600">No audit events found.</p>
          </div>
        ) : (
          <AgGridReact
            rowData={events}
            columnDefs={columnDefs}
            defaultColDef={{ sortable: true, resizable: true }}
            domLayout="normal"
            rowHeight={44}
            headerHeight={36}
            suppressMovableColumns
            animateRows
          />
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-[10px] text-neutral-500">
            Page {page + 1} of {totalPages} ({totalElements} records)
          </p>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-neutral-900 border border-neutral-800 text-neutral-300 disabled:opacity-30">
              Previous
            </button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-neutral-900 border border-neutral-800 text-neutral-300 disabled:opacity-30">
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailEvent && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <div className="bg-[#0C0C0D] border border-neutral-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between p-4 border-b border-neutral-900">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">Audit Event Detail</h3>
              <button onClick={() => setDetailEvent(null)} className="text-neutral-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto text-[11px]">
              <DetailRow label="Timestamp" value={detailEvent.timestamp ? new Date(detailEvent.timestamp).toLocaleString() : ''} />
              <DetailRow label="Action" value={detailEvent.action?.replace(/_/g, ' ')} />
              <DetailRow label="Status" value={detailEvent.status} />
              <DetailRow label="Admin" value={`${detailEvent.adminUsername} (${detailEvent.adminEmail || ''})`} />
              <DetailRow label="Target User" value={detailEvent.targetUsername || '—'} />
              <DetailRow label="Target Email" value={detailEvent.targetEmail || '—'} />
              <DetailRow label="Tenant" value={detailEvent.tenantName || '—'} />
              <DetailRow label="Previous Value" value={detailEvent.previousValue || '—'} />
              <DetailRow label="New Value" value={detailEvent.newValue || '—'} />
              <DetailRow label="IP Address" value={detailEvent.ipAddress || '—'} />
              <DetailRow label="User Agent" value={detailEvent.userAgent || '—'} />
              {detailEvent.failureReason && <DetailRow label="Failure Reason" value={detailEvent.failureReason} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-neutral-500 font-bold uppercase tracking-wider w-28 flex-shrink-0">{label}</span>
      <span className="text-neutral-200 break-all">{value}</span>
    </div>
  )
}

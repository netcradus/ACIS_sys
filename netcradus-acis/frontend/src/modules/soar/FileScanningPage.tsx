import React, { useEffect, useRef, useState } from 'react'
import { UploadCloud, ShieldCheck, ShieldAlert, ShieldQuestion, Loader2 } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { toast } from '@/store/toastStore'

interface FileScanResult {
  id: string
  fileName: string
  contentType: string | null
  fileSizeBytes: number
  fileHash: string
  verdict: 'CLEAN' | 'INFECTED' | 'ERROR'
  threatName: string | null
  quarantined: boolean
  uploadedBy: string | null
  released: boolean
  releasedBy: string | null
  releasedAt: string | null
  createdAt: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function VerdictBadge({ result }: { result: FileScanResult }) {
  if (result.verdict === 'CLEAN') {
    return <span className="badge-mission text-severity-low border-severity-low/30 bg-severity-low/10"><ShieldCheck className="w-3.5 h-3.5" /> Clean</span>
  }
  if (result.verdict === 'INFECTED') {
    return <span className="badge-mission text-severity-critical border-severity-critical/30 bg-severity-critical/10"><ShieldAlert className="w-3.5 h-3.5" /> Infected — {result.threatName}</span>
  }
  return <span className="badge-mission text-severity-high border-severity-high/30 bg-severity-high/10"><ShieldQuestion className="w-3.5 h-3.5" /> Scan failed (quarantined)</span>
}

export default function FileScanningPage() {
  const canWrite = useCanWrite(MODULES.SOAR_PLAYBOOKS)
  const [results, setResults] = useState<FileScanResult[]>([])
  const [loading, setLoading] = useState(true)
  const [resultsError, setResultsError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [releaseTargetId, setReleaseTargetId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchResults = async () => {
    setResultsError(null)
    try {
      const res = await apiClient.get('/api/soar/files')
      setResults(res.data || [])
    } catch (err) {
      console.error('Failed to fetch file scan results', err)
      setResultsError('Unable to load file scan results. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchResults()
    const interval = setInterval(fetchResults, 8000)
    return () => clearInterval(interval)
  }, [])

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      // Let the browser set the multipart boundary itself — apiClient
      // defaults to application/json, which would corrupt the upload.
      await apiClient.post('/api/soar/files/scan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await fetchResults()
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRelease = async () => {
    if (!releaseTargetId) return
    try {
      await apiClient.post(`/api/soar/files/${releaseTargetId}/release`)
      await fetchResults()
    } catch (err) {
      console.error('Failed to release file from quarantine', err)
      toast.error('Failed to release file from quarantine.')
    } finally {
      setReleaseTargetId(null)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-h2 text-text-primary">File Scanning</h1>
        <p className="text-small text-text-secondary">
          Real malware scanning via a self-hosted ClamAV engine. Uploaded files are never executed on this host —
          infected files, and any file the engine could not verify, are quarantined automatically.
        </p>
      </div>

      <div className="card-mission p-6 flex flex-col items-center justify-center gap-3 border-dashed" style={{ borderStyle: 'dashed' }}>
        <UploadCloud className="w-8 h-8 text-text-muted" />
        <input
          ref={fileInputRef}
          type="file"
          id="file-scan-input"
          className="hidden"
          onChange={handleFileSelected}
          disabled={!canWrite || uploading}
        />
        <label
          htmlFor="file-scan-input"
          className="btn-fire"
          style={{ cursor: canWrite && !uploading ? 'pointer' : 'not-allowed', opacity: canWrite ? 1 : 0.5 }}
        >
          {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</> : 'Select a file to scan'}
        </label>
        <p className="text-small text-text-muted">Max 25MB per file.</p>
        {uploadError && <p className="text-small text-danger">{uploadError}</p>}
      </div>

      <div className="card-mission overflow-x-auto">
        <table className="table-enterprise w-full">
          <thead>
            <tr>
              <th>FILE</th>
              <th>SIZE</th>
              <th>SHA-256</th>
              <th>VERDICT</th>
              <th>UPLOADED BY</th>
              <th>SCANNED AT</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center text-text-muted py-6">Loading...</td></tr>
            ) : resultsError ? (
              <tr className="empty-row">
                <td colSpan={7}>
                  <div className="flex flex-col items-center gap-2 py-4">
                    <span>{resultsError}</span>
                    <button className="btn-mission text-small px-3 py-1.5" onClick={fetchResults}>Retry</button>
                  </div>
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-text-muted py-6">No files scanned yet.</td></tr>
            ) : (
              results.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.fileName || '(unnamed)'}</td>
                  <td>{formatBytes(r.fileSizeBytes)}</td>
                  <td className="font-mono text-small" title={r.fileHash}>{r.fileHash.slice(0, 16)}...</td>
                  <td><VerdictBadge result={r} /></td>
                  <td>{r.uploadedBy || '—'}</td>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>
                    {r.quarantined && !r.released && (
                      <button
                        className="text-accent hover:text-accent-dark font-semibold text-small transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Acknowledge risk and release from quarantine"
                        onClick={() => setReleaseTargetId(r.id)}
                        disabled={!canWrite}
                      >
                        Release
                      </button>
                    )}
                    {r.released && <span className="text-small text-text-muted">Released by {r.releasedBy}</span>}
                    {!r.quarantined && <span className="text-small text-text-muted">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={releaseTargetId !== null}
        title="Release from quarantine?"
        message="This only records that you've reviewed and accepted the risk. The file itself stays in restricted quarantine storage and is never restored to normal circulation or executed."
        confirmLabel="Release"
        onConfirm={handleRelease}
        onCancel={() => setReleaseTargetId(null)}
      />
    </div>
  )
}

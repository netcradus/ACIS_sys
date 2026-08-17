import React, { useEffect, useRef, useState } from 'react'
import { FileCode2, KeyRound, Loader2 } from 'lucide-react'
import apiClient from '@/lib/apiClient'
import { useCanWrite, MODULES } from '@/store/permissionsStore'

interface DependencyFinding {
  id: string
  ecosystem: string
  packageName: string
  version: string
  vulnerabilityId: string
  severity: string
  summary: string
  fixedVersion: string | null
  createdAt: string
}

interface SecretFinding {
  id: string
  sourceName: string
  ruleName: string
  severity: string
  lineNumber: number
  redactedMatch: string
  createdAt: string
}

function SeverityChip({ severity }: { severity: string }) {
  const cls = severity === 'CRITICAL' ? 'critical' : severity === 'HIGH' ? 'high' : severity === 'MEDIUM' ? 'medium' : 'low'
  return <span className={`sev-badge ${cls}`}>{severity}</span>
}

export default function SupplyChainPage() {
  const canWrite = useCanWrite(MODULES.SOAR_PLAYBOOKS)
  const [depFindings, setDepFindings] = useState<DependencyFinding[]>([])
  const [secretFindings, setSecretFindings] = useState<SecretFinding[]>([])
  const [scanningDeps, setScanningDeps] = useState(false)
  const [scanningSecrets, setScanningSecrets] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [findingsLoading, setFindingsLoading] = useState(true)
  const [findingsError, setFindingsError] = useState<string | null>(null)
  const depInputRef = useRef<HTMLInputElement>(null)
  const secretInputRef = useRef<HTMLInputElement>(null)

  const fetchFindings = async () => {
    setFindingsLoading(true)
    setFindingsError(null)
    try {
      const [depsRes, secretsRes] = await Promise.all([
        apiClient.get('/api/soar/supply-chain/dependency-findings'),
        apiClient.get('/api/soar/supply-chain/secret-findings'),
      ])
      setDepFindings(depsRes.data || [])
      setSecretFindings(secretsRes.data || [])
    } catch (err) {
      console.error('Failed to fetch supply-chain findings', err)
      setFindingsError('Unable to load supply-chain findings. Please try again.')
    } finally {
      setFindingsLoading(false)
    }
  }

  useEffect(() => {
    fetchFindings()
    const interval = setInterval(fetchFindings, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleDepScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setScanningDeps(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await apiClient.post('/api/soar/supply-chain/scan-dependencies', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await fetchFindings()
    } catch (err: any) {
      setError(err?.message || 'Dependency scan failed')
    } finally {
      setScanningDeps(false)
      if (depInputRef.current) depInputRef.current.value = ''
    }
  }

  const handleSecretScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setScanningSecrets(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await apiClient.post('/api/soar/supply-chain/scan-secrets', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await fetchFindings()
    } catch (err: any) {
      setError(err?.message || 'Secrets scan failed')
    } finally {
      setScanningSecrets(false)
      if (secretInputRef.current) secretInputRef.current.value = ''
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-h2 text-text-primary">Supply-Chain Security</h1>
        <p className="text-small text-text-secondary">
          Real dependency vulnerability lookups against OSV.dev (osv.dev, public/no-key-required) and local
          pattern-based secrets scanning. Submit a manifest (pom.xml / package.json) or source file directly —
          there is no connected repository yet.
        </p>
        {error && <p className="text-small text-danger mt-2">{error}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card-mission p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-5 h-5 text-accent" />
            <h2 className="text-h3 text-text-primary">Dependency Scan</h2>
          </div>
          <p className="text-small text-text-secondary">Upload a pom.xml or package.json to check every declared dependency against OSV.dev.</p>
          <input ref={depInputRef} type="file" id="dep-scan-input" className="hidden" onChange={handleDepScan} disabled={!canWrite || scanningDeps} accept=".xml,.json" />
          <label htmlFor="dep-scan-input" className="btn-fire" style={{ cursor: canWrite && !scanningDeps ? 'pointer' : 'not-allowed', opacity: canWrite ? 1 : 0.5 }}>
            {scanningDeps ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</> : 'Select manifest file'}
          </label>
        </div>

        <div className="card-mission p-5 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-accent" />
            <h2 className="text-h3 text-text-primary">Secrets Scan</h2>
          </div>
          <p className="text-small text-text-secondary">Upload a source/config file to check for exposed credentials (API keys, tokens, private keys).</p>
          <input ref={secretInputRef} type="file" id="secret-scan-input" className="hidden" onChange={handleSecretScan} disabled={!canWrite || scanningSecrets} />
          <label htmlFor="secret-scan-input" className="btn-fire" style={{ cursor: canWrite && !scanningSecrets ? 'pointer' : 'not-allowed', opacity: canWrite ? 1 : 0.5 }}>
            {scanningSecrets ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</> : 'Select file'}
          </label>
        </div>
      </div>

      <div className="card-mission overflow-x-auto">
        <div className="p-4 pb-0"><h3 className="text-h3 text-text-primary">Dependency Findings</h3></div>
        <table className="table-enterprise w-full">
          <thead><tr><th>PACKAGE</th><th>VERSION</th><th>VULNERABILITY</th><th>SEVERITY</th><th>FIXED IN</th><th>SUMMARY</th></tr></thead>
          <tbody>
            {findingsLoading && (
              <tr><td colSpan={6} className="text-center text-text-muted py-6">Loading...</td></tr>
            )}
            {!findingsLoading && findingsError && (
              <tr className="empty-row">
                <td colSpan={6}>
                  <div className="flex flex-col items-center gap-2 py-4">
                    <span>{findingsError}</span>
                    <button className="btn-mission text-small px-3 py-1.5" onClick={fetchFindings}>Retry</button>
                  </div>
                </td>
              </tr>
            )}
            {!findingsLoading && !findingsError && depFindings.length === 0 && (
              <tr><td colSpan={6} className="text-center text-text-muted py-6">No dependency findings yet.</td></tr>
            )}
            {!findingsLoading && !findingsError && depFindings.map((f) => (
              <tr key={f.id}>
                <td className="font-mono text-small">{f.packageName}</td>
                <td>{f.version}</td>
                <td className="font-mono text-small">{f.vulnerabilityId}</td>
                <td><SeverityChip severity={f.severity} /></td>
                <td>{f.fixedVersion || '—'}</td>
                <td className="text-small" style={{ maxWidth: 360 }}>{f.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-mission overflow-x-auto">
        <div className="p-4 pb-0"><h3 className="text-h3 text-text-primary">Secret Findings</h3></div>
        <table className="table-enterprise w-full">
          <thead><tr><th>SOURCE</th><th>LINE</th><th>RULE</th><th>SEVERITY</th><th>PREVIEW</th></tr></thead>
          <tbody>
            {findingsLoading && (
              <tr><td colSpan={5} className="text-center text-text-muted py-6">Loading...</td></tr>
            )}
            {!findingsLoading && findingsError && (
              <tr className="empty-row">
                <td colSpan={5}>
                  <div className="flex flex-col items-center gap-2 py-4">
                    <span>{findingsError}</span>
                    <button className="btn-mission text-small px-3 py-1.5" onClick={fetchFindings}>Retry</button>
                  </div>
                </td>
              </tr>
            )}
            {!findingsLoading && !findingsError && secretFindings.length === 0 && (
              <tr><td colSpan={5} className="text-center text-text-muted py-6">No secret findings yet.</td></tr>
            )}
            {!findingsLoading && !findingsError && secretFindings.map((f) => (
              <tr key={f.id}>
                <td className="font-mono text-small">{f.sourceName}</td>
                <td>{f.lineNumber}</td>
                <td>{f.ruleName}</td>
                <td><SeverityChip severity={f.severity} /></td>
                <td className="font-mono text-small">{f.redactedMatch}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

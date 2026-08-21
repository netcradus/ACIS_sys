export interface Alert {
  id: string
  title: string
  severity: string
  source: string
  status: string
  ownerId: string | null
  ownerName: string | null
  rawEvent: string | null
  createdAt: string
  updatedAt: string
  confirmedCategory: string | null
  labeledAt: string | null
  eventOccurredAt: string | null
  anomalyScore: number | null
  isAnomaly: boolean | null
  anomalyFeatures: string | null
  riskScore: number | null
  mitreTechniques: string[] | null
  redTeamExecutionId: string | null
  iocMatched: boolean | null
  iocSeverity: string | null
  iocSource: string | null
}

export interface Incident {
  id: string
  incidentNumber: string
  title: string
  severity: string
  status: string
  ownerId: string | null
  ownerName: string | null
  alertId: string | null
  checklist: string | null
  createdAt: string
  updatedAt: string
}

export interface AlertAnalytics {
  severityCounts: Record<string, number>
  statusCounts: Record<string, number>
  sourceCounts: Record<string, number>
  trend: {
    buckets: { bucketStart: string; counts: Record<string, number> }[]
    fromEpochMs: number
    toEpochMs: number
    bucketMinutes: number
  }
}

export interface AlertFilterValues {
  sources: string[]
  statuses: string[]
  owners: string[]
}

export interface TimelineEntry {
  id: string
  timestamp: string
  user: string | null
  action: string
  resource: string
  status: string | null
}

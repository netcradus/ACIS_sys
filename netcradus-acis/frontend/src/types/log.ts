export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'CRITICAL';
  service: string;
  host?: string;
  traceId?: string;
  spanId?: string;
  assetName?: string;
  assetType?: string;
  threatSeverity?: string;
  threatSource?: string;
  metadata?: Record<string, any>;
}

export interface LogSearchFilters {
  service?: string;
  level?: string;
  searchTerm?: string;
  startTime?: string;
  endTime?: string;
}

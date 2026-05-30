import React, { useEffect, useState } from 'react'
import { Play, Edit2, Clock, CheckCircle2, XCircle, ChevronRight, Zap, Target, Shield, Server, Plus, MoreHorizontal, Activity } from 'lucide-react'
import { clsx } from 'clsx'
import InDevelopment from '@/components/InDevelopment'
import apiClient from '@/lib/apiClient'

interface Playbook {
  id: string;
  name: string;
  description: string;
  steps: string; // JSON string
  enabled: boolean;
  successCount: number;
  runCount: number;
  lastRunAt: string | null;
}

interface Execution {
  id: string;
  playbookId: string;
  triggeredBy: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  stepLogs: string;
}

export default function SoarPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPlaybooks = async () => {
    try {
      const response = await apiClient.get('/api/soar/playbooks')
      setPlaybooks(response.data || [])
    } catch (err) {
      console.error("Failed to fetch playbooks", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlaybooks()
    
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchPlaybooks, 5000)
    return () => clearInterval(interval)
  }, [])

  const runPlaybook = async (id: string) => {
    try {
      await apiClient.post(`/api/soar/playbooks/${id}/execute`)
      fetchPlaybooks() // refresh immediately
    } catch (err) {
      console.error(err)
    }
  }

  const getStepCount = (stepsJson: string) => {
    try {
      const parsed = JSON.parse(stepsJson);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }

  return (
    <div className="space-y-8 animate-fade-in bg-black pb-10">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase leading-none">SOAR Playbooks</h1>
          <p className="text-[10px] text-text-secondary font-bold tracking-[0.4em] uppercase mt-2">Security Orchestration & Automated Response</p>
        </div>
        <div className="flex items-center gap-3">
            <button className="btn-fire min-w-[160px]">
              + NEW PLAYBOOK <Plus className="w-4 h-4 ml-1" />
            </button>
        </div>
      </div>

      {/* Playbooks Grid */}
      {loading && playbooks.length === 0 ? (
        <div className="text-white text-sm font-mono">Loading playbooks...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {playbooks.map((pb, i) => {
            const steps = getStepCount(pb.steps)
            const successRate = pb.runCount > 0 ? Math.round((pb.successCount / pb.runCount) * 100) : 0
            
            return (
              <div key={pb.id} className="card-mission bg-surface-2 border-fire-border/60 hover:border-accent/30 transition-all group">
                <div className="h-1 w-full bg-accent absolute top-0 left-0 opacity-20 group-hover:opacity-100 transition-opacity" 
                      style={{ backgroundColor: i % 3 === 0 ? '#00FF99' : i % 3 === 1 ? '#FFAB00' : '#FF3333' }} />
                
                <div className="flex items-start justify-between mb-6">
                  <div>
                      <h2 className="text-xl font-black text-white tracking-tighter uppercase">{pb.name}</h2>
                      <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest mt-1">{pb.description || 'No description'}</p>
                  </div>
                  <MoreHorizontal className="text-text-muted cursor-pointer hover:text-white" />
                </div>

                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest">Success</span>
                    <span className="text-xl font-black text-white tracking-tight tabular-nums">{successRate}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest">Steps</span>
                    <span className="text-xl font-black text-white tracking-tight tabular-nums">{steps}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-text-muted font-bold uppercase tracking-widest">Runs</span>
                    <span className="text-xl font-black text-white tracking-tight tabular-nums">{pb.runCount}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button 
                    onClick={() => runPlaybook(pb.id)}
                    className="btn-fire py-2.5 flex items-center gap-2">
                    <Play className="w-4 h-4 fill-white" /> RUN
                  </button>
                  <button className="btn-mission py-2.5 flex items-center gap-2">
                    <Edit2 className="w-4 h-4" /> EDIT
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {playbooks.length === 0 && !loading && (
        <div className="p-8 border border-dashed border-border rounded-lg text-center text-text-muted text-sm uppercase tracking-widest">
          No playbooks found. Create one or wait for seed data.
        </div>
      )}
    </div>
  )
}

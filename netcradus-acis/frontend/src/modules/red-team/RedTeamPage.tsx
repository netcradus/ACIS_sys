import React, { useEffect, useState } from 'react'
import { Target, Play, ChevronRight, ShieldAlert, Crosshair, Skull, Activity, Search } from 'lucide-react'
import { clsx } from 'clsx'
import InDevelopment from '@/components/InDevelopment'
import apiClient from '@/lib/apiClient'

interface Simulation {
  id: string;
  name: string;
  description: string;
  mitreTechniques: string[];
  mitreTactics: string[];
  steps: string;
  runCount: number;
  lastRunAt: string | null;
}

export default function RedTeamPage() {
  const [simulations, setSimulations] = useState<Simulation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSimulations = async () => {
    try {
      const response = await apiClient.get('/api/red-team/simulations')
      setSimulations(response.data || [])
    } catch (err) {
      console.error("Failed to fetch simulations", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSimulations()
    const interval = setInterval(fetchSimulations, 5000)
    return () => clearInterval(interval)
  }, [])

  const startSimulation = async (id: string) => {
    try {
      await apiClient.post(`/api/red-team/simulations/${id}/start`)
      fetchSimulations()
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
          <h1 className="text-3xl font-black text-danger tracking-tighter uppercase leading-none">Red Team Simulator</h1>
          <p className="text-[10px] text-text-secondary font-bold tracking-[0.4em] uppercase mt-2">Continuous Attack Emulation & Validation</p>
        </div>
      </div>

      {loading && simulations.length === 0 ? (
        <div className="text-white text-sm font-mono">Loading simulations...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {simulations.map((sim, i) => {
            const steps = getStepCount(sim.steps)
            return (
              <div key={sim.id} className="card-mission bg-surface-2 border-danger/40 hover:border-danger transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Skull className="w-24 h-24 text-danger" />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center flex-wrap gap-2 mb-4">
                    {sim.mitreTechniques?.map(t => (
                      <span key={t} className="px-2 py-0.5 bg-danger/20 border border-danger text-danger text-[9px] font-black uppercase tracking-widest rounded-sm">
                        {t}
                      </span>
                    ))}
                    {sim.mitreTactics?.map(t => (
                      <span key={t} className="px-2 py-0.5 bg-surface-3 border border-border text-text-muted text-[9px] font-black uppercase tracking-widest rounded-sm">
                        {t}
                      </span>
                    ))}
                  </div>
                  
                  <h2 className="text-xl font-black text-white tracking-tighter uppercase mb-2">{sim.name}</h2>
                  <p className="text-[10px] text-text-muted font-bold tracking-[0.1em] uppercase mb-6">{sim.description}</p>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div>
                      <span className="block text-[9px] text-text-muted font-bold uppercase tracking-widest mb-1">Steps</span>
                      <span className="text-lg font-black text-white tracking-tight">{steps} Stages</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-text-muted font-bold uppercase tracking-widest mb-1">Runs</span>
                      <span className="text-lg font-black text-white tracking-tight">{sim.runCount}</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => startSimulation(sim.id)}
                    className="w-full btn-fire bg-danger hover:bg-danger-hover text-white border-none py-3 flex items-center justify-center gap-2">
                    <Crosshair className="w-4 h-4" /> INITIATE ATTACK
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {simulations.length === 0 && !loading && (
        <div className="p-8 border border-dashed border-danger/40 rounded-lg text-center text-text-muted text-sm uppercase tracking-widest">
          No simulations found. Create one or wait for seed data.
        </div>
      )}
    </div>
  )
}

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from uuid import UUID
import json
import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
PLAYBOOKS_FILE = BASE / 'playbooks.json'
SIMS_FILE = BASE / 'simulations.json'

app = FastAPI()

def read_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def write_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, default=str)

@app.get('/api/soar/playbooks')
async def get_playbooks():
    return JSONResponse(content=read_json(PLAYBOOKS_FILE))

@app.post('/api/soar/playbooks/{pb_id}/execute')
async def execute_playbook(pb_id: str, payload: dict = None):
    pbs = read_json(PLAYBOOKS_FILE)
    for pb in pbs:
        if pb['id'] == pb_id:
            pb['run_count'] = pb.get('run_count', 0) + 1
            pb['last_run_at'] = datetime.datetime.utcnow().isoformat() + 'Z'
            # Simulate success increment
            pb['success_count'] = pb.get('success_count', 0) + 1
            write_json(PLAYBOOKS_FILE, pbs)
            exec_id = str(UUID(int=UUID(pb_id).int ^ 0x1234567890abcdef))
            return JSONResponse(content={
                'id': exec_id,
                'playbook_id': pb_id,
                'status': 'COMPLETED',
                'started_at': pb['last_run_at'],
                'completed_at': pb['last_run_at']
            })
    raise HTTPException(status_code=404, detail='Playbook not found')

@app.get('/api/red-team/simulations')
async def get_sims():
    return JSONResponse(content=read_json(SIMS_FILE))

@app.post('/api/red-team/simulations/{sim_id}/start')
async def start_sim(sim_id: str):
    sims = read_json(SIMS_FILE)
    for s in sims:
        if s['id'] == sim_id:
            s['run_count'] = s.get('run_count', 0) + 1
            s['last_run_at'] = datetime.datetime.utcnow().isoformat() + 'Z'
            write_json(SIMS_FILE, sims)
            return JSONResponse(content={'id': sim_id, 'status': 'RUNNING'})
    raise HTTPException(status_code=404, detail='Simulation not found')

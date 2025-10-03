from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import schemas
from .simulation import simulate_structure
from .truss_solver import solve_truss, TrussError

app = FastAPI(title="Motorcycle Frame Simulator API", version="0.1.0")

# Allow all origins during early development (tighten later)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/simulate", response_model=schemas.SimulationResult)
async def simulate(payload: schemas.SimulationInput):
    """Run selected structural analysis (frame or truss)."""
    if payload.analysis_type == 'truss':
        return solve_truss(payload)
    # default fallback to frame
    return simulate_structure(payload)

# To run (dev): uvicorn backend.app.main:app --reload

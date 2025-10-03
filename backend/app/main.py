from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import schemas
from .simulation import simulate_structure

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
    """Run a linear static frame analysis.

    Errors (e.g., singular matrix) are propagated as 500 for now; later we can raise HTTPException.
    """
    result = simulate_structure(payload)
    return result

# To run (dev): uvicorn backend.app.main:app --reload

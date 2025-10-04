import os
import json
import time
import re
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi import Body
from fastapi.responses import JSONResponse
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


# ----------------------------- Design Save / Load -----------------------------
DESIGNS_DIR = Path(__file__).resolve().parent.parent / "designs"
DESIGNS_DIR.mkdir(exist_ok=True)

_SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")

def _design_path(name: str) -> Path:
    if not _SAFE_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid design name (use letters, numbers, hyphen, underscore)")
    return DESIGNS_DIR / f"{name}.json"

@app.get("/designs", response_model=list[schemas.DesignListItem])
async def list_designs():
    items: list[schemas.DesignListItem] = []
    for p in DESIGNS_DIR.glob("*.json"):
        try:
            stat = p.stat()
            name = p.stem
            items.append(schemas.DesignListItem(name=name, modified=stat.st_mtime))
        except OSError:
            continue
    # newest first
    items.sort(key=lambda x: x.modified, reverse=True)
    return items

@app.get("/designs/{name}", response_model=schemas.Design)
async def load_design(name: str):
    path = _design_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Design not found")
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Read error: {e}")
    data["name"] = name
    data["timestamp"] = path.stat().st_mtime
    try:
        return schemas.Design(**data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Corrupt design file: {e}")

@app.post("/designs/{name}", response_model=schemas.Design)
async def save_design(name: str, design: dict = Body(...)):
    """Persist a design JSON. Accepts a loose dict for forward compatibility.

    We validate after injecting enforced fields, so missing optional view state
    does not cause 422 errors.
    """
    path = _design_path(name)
    if not isinstance(design, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")
    payload = dict(design)
    payload["name"] = name
    payload.setdefault("unitSystem", "IPS")
    payload.setdefault("analysisType", "truss")
    payload.setdefault("nodes", [])
    payload.setdefault("beams", [])
    payload.setdefault("supports", [])
    payload.setdefault("masses", [])
    payload.setdefault("gridSpacing", 1.0)
    payload["timestamp"] = time.time()
    # Attempt validation (will raise if structurally incompatible)
    try:
        validated = schemas.Design(**payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Validation failed: {e}")
    # Ensure directory exists
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("w", encoding="utf-8") as f:
            json.dump(validated.dict(), f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        print(f"[design-save] Saved design '{name}' to {path}")
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Write error: {e}")
    return validated

# ----------------------------- Materials Catalog -----------------------------
_materials_cache: list[dict] | None = None
_materials_mtime: float | None = None

@app.get("/materials")
async def get_materials():
    """Serve materials.json entries (cached)."""
    global _materials_cache, _materials_mtime
    # materials.json expected at project root (one level above backend directory)
    root_dir = Path(__file__).resolve().parent.parent.parent
    mat_path = root_dir / "materials.json"
    if not mat_path.exists():
        raise HTTPException(status_code=404, detail="materials.json not found")
    try:
        stat = mat_path.stat()
        if _materials_cache is None or _materials_mtime != stat.st_mtime:
            with mat_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            _materials_cache = data.get("materials", [])
            _materials_mtime = stat.st_mtime
        return {"materials": _materials_cache}
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Error reading materials: {e}")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Malformed materials.json: {e}")

# To run (dev): uvicorn backend.app.main:app --reload

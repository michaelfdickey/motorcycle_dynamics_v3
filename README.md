# motorcycle_dynamics_v3

Prototype motorcycle frame (2D) design & simulation environment. This MVP introduces a beam-and-node structural solver (FastAPI backend) and an in-browser interactive editor (React + Vite frontend) that lets you:

- Place nodes (click canvas)
- Connect nodes with beam elements (click start node then end node)
- Run a linear static simulation (button) using Euler–Bernoulli frame elements (axial + bending, small displacement)
- Visualize undeformed (solid) vs deformed (dashed) shape (scaled exaggeration)

> NOTE: Early-stage scaffold; many engineering features (material libraries, loads UI, constraints editing, stresses) are intentionally minimal or hard‑coded.

## Directory Layout

```
backend/
	app/
		main.py          # FastAPI app (/health, /simulate)
		schemas.py       # Pydantic models (nodes, beams, loads, result)
		simulation.py    # Linear frame solver (3 DOF/node)
	tests/
		test_simulate.py # Cantilever & instability tests
	pyproject.toml     # Backend dependencies
frontend/
	index.html
	package.json
	tsconfig.json
	vite.config.ts
	src/
		main.tsx
		App.tsx
		api.ts           # Fetch wrapper to backend
		types.ts         # Shared TS interfaces
		components/FrameCanvas.tsx
```

## Backend (FastAPI) – Setup & Run

From repository root (Windows PowerShell shown):

```powershell
cd backend
python -m venv .venv
./.venv/Scripts/Activate.ps1
pip install --upgrade pip
pip install .[dev]
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Sample simulation payload (cantilever with end load):

```powershell
$body = @{ nodes = @(
		@{ id = "n1"; x = 0; y = 0; constraints = @{ fix_x = $true; fix_y = $true; fix_rotation = $true } },
		@{ id = "n2"; x = 1; y = 0 }
	);
	beams = @(
		@{ id = "b1"; node_start = "n1"; node_end = "n2"; E = 210000000000; I = 0.000001; A = 0.001 }
	);
	loads = @(
		@{ node_id = "n2"; Fx = 0; Fy = -1000; Moment = 0 }
	) } | ConvertTo-Json -Depth 6
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8000/simulate -Body $body -ContentType 'application/json'
```

### Tests

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
```

## Frontend (React + Vite) – Setup & Run

In a new terminal (keep backend running):

```powershell
cd frontend
npm install
npm run dev
```

Open the printed local URL (default: http://127.0.0.1:5173 or http://localhost:5173). Ensure backend is at http://127.0.0.1:8000 (CORS is permissive for dev).

### Basic Usage
1. Choose a Units system (default is IPS = inch / pound-force / second, KMS = SI). All calculations are performed internally in SI; IPS entries are converted on the fly.
2. Click inside canvas (Node mode) to add nodes (IDs auto-increment).
3. Switch to Beam mode: click start node then end node to create a beam (defaults depend on chosen unit system: steel E, nominal area & inertia placeholders).
4. Fixture mode: click a node to toggle a fully fixed support (all 3 DOF).
5. Mass mode: click a node to add a default lumped mass (currently informational; not yet used in static solve).
6. Press Simulate. (Loads UI not yet implemented, so unless you send a manual payload with loads, deformations may be zero.)
7. Deformed (dashed red) overlay is exaggerated; scaling factor is constant for now.

### Units & Conversions
| Symbol | KMS (SI) | IPS (inch–pound–second) | Conversion to SI |
|--------|----------|--------------------------|------------------|
| Length | meter (m) | inch (in) | in × 0.0254 = m |
| Force  | newton (N) | pound-force (lbf) | lbf × 4.4482216153 = N |
| Mass   | kilogram (kg) | pound-mass (lbm)* | lbm × 0.45359237 = kg |
| E (modulus) | pascal (Pa) | psi | psi × 6894.757293168 = Pa |
| Area   | m² | in² | in² × (0.0254²) = m² |
| I (2nd moment) | m⁴ | in⁴ | in⁴ × (0.0254⁴) = m⁴ |

*Static solver currently ignores mass (no dynamics); masses are stored for future extensions.

## Roadmap (Planned Enhancements)
- UI panels for constraints & loads editing.
- Beam property editor (E, A, I per element) in GUI.
- Load visualization (arrows, moments).
- Stress & reaction force reporting.
- Persist / export frame models (JSON).
- Unit tests for API endpoint (httpx) in addition to solver direct tests.

## Design Notes
- Solver currently constructs global stiffness with simple Euler–Bernoulli formulation; no shear deformation (Timoshenko) and no distributed loads.
- Internal forces derived from local end forces; sign conventions may be adjusted once visualization overlays are added.
- Displacement scale in frontend (`DISP_SCALE` in `FrameCanvas.tsx`) is set high for visibility—this is not physically scaled.

## Troubleshooting
| Issue | Cause | Fix |
|-------|-------|-----|
| `uvicorn` crash at start | Missing deps / wrong folder | Activate venv, `pip install .[dev]` inside `backend` |
| CORS error in browser | Backend not running or different port | Start backend; confirm URL in `src/api.ts` |
| No deformation shown | No loads applied | Future UI; for now POST a payload with a load like sample above |
| Singular matrix error | Insufficient constraints (mechanism) | Add supports (fix_x/fix_y/fix_rotation) to at least one node |

## Licensing
MIT (see `pyproject.toml` license field). Provide attribution if you reuse substantial parts.

---
*Early MVP: expect breaking changes as features are added.*

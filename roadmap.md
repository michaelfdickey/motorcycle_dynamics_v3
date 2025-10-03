# Feature Roadmap

Loads UI (force/moment entry with unit conversion).
Per-DOF fixture toggles + reaction forces.
Editable beam properties & mass values inline.
Displacement scale slider and numeric results table.
Save/load JSON including unit system.

Editable mass values (input field / inline edit)
Loads UI next
Per-DOF fixture toggles
Displacement scale slider
Quality summary wrap-up

Editable beam properties (A, I, E) with unit conversions.
Loads UI (forces/moments) with unit aware entry.
Per-DOF fixture toggles and reaction force calculation backend extension.
Displacement scale slider + numerical results table.
Save/load model JSON (including units, fixtures, masses).
Quality gate wrap-up summary.

Editable beam properties (E, A, I) with unit conversion.
Loads UI (forces/moments) + solver integration.
Per-DOF fixture toggles & reaction force computation.
Displacement scale slider + numeric results table.
Save/load model JSON.

- start with planar truss / pinned joints
- move to frame model
- move to 3d frame model

Auto-fix suggestions (buttons to convert an extra pin to roller or add a roller).
Highlight offending supports/members in the canvas when warning shown.
Distinguish unstable vs overconstrained styling (different colors/icons).
Backend-side graceful error mapping to structured JSON for any solver failure.

Add confirmation dialog for node deletion when multiple beams will be removed.
Support Shift+click node to remove just support (keep node) while in delete mode.
Provide undo (maintain a small history stack).
Highlight beams/nodes on hover in delete mode before removal.

Scrollable larger-than-viewport area instead (e.g. wrapping div with overflow).
Adding pan/zoom controls.
Keeping logical coordinates the same but scaling display (SCALE factor).

Configurable spacing (dropdown: 25 / 50 / 100).
Snap-to-grid when placing nodes.
Dark mode palette for grid.
Pan/zoom with grid scaling.

- label dimensions (angles and beam lengths)

Snap-to-grid toggle (store snapped coordinates on node add).
Display coordinate ruler or hover readout.
Adaptive major interval (e.g., switch to 10x for very fine spacing).
Performance throttle for extremely dense grids (live after zoom/pan if added later).

Snap-to-grid using current minor or major spacing
Dynamic label annotations on major lines
Switch to pattern fills for ultra-fine grids for better performance
Pan/zoom while keeping grid aligned

Always show two stacked scales (e.g. 1′ and 5′ simultaneously).
Add a second smaller bar for the current minor spacing.
Allow dragging to measure (interactive dimension tool).
Option to hide the scale separately from the grid.

Centered label or label at bar midpoint.
Scale bar to shrink if major spacing gets very wide (currently it will extend full major length).

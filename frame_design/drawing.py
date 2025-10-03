"""
Drawing functions for Motorcycle Frame Design.
Handles rendering nodes, beams, fixtures, masses, and grid to the canvas.
"""

import dearpygui.dearpygui as dpg
import math

# Configuration
CANVAS_WIDTH = 1000
CANVAS_HEIGHT = 750
GRID_COLOR = (50, 50, 50, 255)
GRID_SPACING = 20  # pixels between grid lines
NODE_COLOR = (255, 255, 0, 255)  # Yellow
SELECTED_NODE_COLOR = (0, 255, 0, 255)  # Green
BEAM_COLOR = (200, 200, 200, 255)  # Light gray
BEAM_HOVER_COLOR = (255, 255, 255, 255)  # White for beam preview
FIXTURE_COLOR = (255, 128, 0, 255)  # RED
MASS_COLOR = (255, 0, 0, 255)  # Red

def draw_grid(scale_factor=1.0):
    """Draw a grid on the canvas with a scale indicator."""
    # Get the size of the drawing area
    width = CANVAS_WIDTH
    height = CANVAS_HEIGHT
    
    # Draw vertical grid lines
    for x in range(0, width, GRID_SPACING):
        dpg.draw_line((x, 0), (x, height), color=GRID_COLOR, parent="canvas")
    
    # Draw horizontal grid lines
    for y in range(0, height, GRID_SPACING):
        dpg.draw_line((0, y), (width, y), color=GRID_COLOR, parent="canvas")
    
    # Draw scale indicator in the bottom left
    scale_start_x = 20
    scale_start_y = height - 40
    scale_width = GRID_SPACING * 5  # 5 grid spaces
    
    # Draw scale bar
    dpg.draw_line(
        (scale_start_x, scale_start_y),
        (scale_start_x + scale_width, scale_start_y),
        color=(255, 255, 255),
        thickness=2,
        parent="canvas"
    )
    
    # Draw tick marks
    for i in range(6):  # 0 to 5 ticks
        tick_x = scale_start_x + (i * GRID_SPACING)
        dpg.draw_line(
            (tick_x, scale_start_y - 3),
            (tick_x, scale_start_y + 3),
            color=(255, 255, 255),
            thickness=1,
            parent="canvas"
        )
    
    # Draw scale label
    physical_length = 5 * scale_factor  # 5 grid spaces in real-world units
    dpg.draw_text(
        (scale_start_x + scale_width/2 - 20, scale_start_y - 20),
        f"Scale: {physical_length} units",
        color=(255, 255, 0),
        parent="canvas"
    )
    
    # Draw grid info text
    grid_info_x = 20
    grid_info_y = height - 20
    dpg.draw_text(
        (grid_info_x, grid_info_y),
        f"Grid: {GRID_SPACING}px = {scale_factor} units",
        color=(200, 200, 200),
        parent="canvas"
    )

def draw_nodes(model):
    """Draw all nodes on the canvas."""
    for i, node in enumerate(model.nodes):
        x, y = node["pos"]
        color = SELECTED_NODE_COLOR if node.get("selected", False) else NODE_COLOR
        dpg.draw_circle((x, y), 5, color=color, fill=color, parent="canvas")
        dpg.draw_text((x + 10, y), f"N{i}", color=(255, 255, 255, 255), parent="canvas")

def draw_beams(model, mouse_pos=None):
    """Draw all beams on the canvas."""
    # Draw existing beams
    for i, beam in enumerate(model.beams):
        if "start" in beam and "end" in beam:
            if beam["start"] < len(model.nodes) and beam["end"] < len(model.nodes):
                start_pos = model.nodes[beam["start"]]["pos"]
                end_pos = model.nodes[beam["end"]]["pos"]
                
                dpg.draw_line(start_pos, end_pos, color=BEAM_COLOR, thickness=2, parent="canvas")
                
                # Calculate midpoint
                mid_x = (start_pos[0] + end_pos[0]) / 2
                mid_y = (start_pos[1] + end_pos[1]) / 2
                
                # Draw small circle at midpoint
                dpg.draw_circle((mid_x, mid_y), 3, color=BEAM_COLOR, fill=BEAM_COLOR, parent="canvas")
                
                # Draw beam label with index
                dpg.draw_text((mid_x + 5, mid_y - 10), f"B{i}", color=(255, 255, 255, 255), parent="canvas")
    
    # Draw beam preview when a node is selected
    if mouse_pos is not None and model.selected_node is not None and model.selected_node < len(model.nodes):
        try:
            start_pos = model.nodes[model.selected_node]["pos"]
            
            # Make sure mouse_pos has valid coordinates
            if isinstance(mouse_pos, tuple) and len(mouse_pos) == 2:
                dpg.draw_line(start_pos, mouse_pos, color=BEAM_HOVER_COLOR, thickness=1, style=2, parent="canvas")
            else:
                print(f"Warning: Invalid mouse position format: {mouse_pos}")
        except Exception as e:
            print(f"Error drawing beam preview: {e}")

def draw_fixtures(model):
    """Draw all fixtures on the canvas with engineering-style supports."""
    # Fixture dimensions (in pixels) - easily adjustable
    FIXTURE_DIMENSIONS = {
        "box_size": 14,           # Size of square around node
        "support_line_width": 22, # Width of horizontal support line
        "strut_length": 12,        # Length of diagonal strut lines 
        "strut_angle": 10,        # Angle of diagonal struts (degrees)
        "strut_count": 9,         # Number of strut lines to draw
        "strut_spacing": 2        # Spacing between strut lines
    }
    
    import math
    
    for fixture in model.fixtures:
        if fixture["node"] < len(model.nodes):
            node_pos = model.nodes[fixture["node"]]["pos"]
            x, y = node_pos
            
            # 1. Draw square around node
            half_size = FIXTURE_DIMENSIONS["box_size"] / 2
            box_min = (x - half_size, y - half_size)
            box_max = (x + half_size, y + half_size)
            dpg.draw_rectangle(box_min, box_max, color=FIXTURE_COLOR, thickness=2, parent="canvas")
            
            # 2. Draw horizontal support line at bottom
            support_half_width = FIXTURE_DIMENSIONS["support_line_width"] / 2
            support_y = y + half_size + 2  # Just below the square
            support_start = (x - support_half_width, support_y)
            support_end = (x + support_half_width, support_y)
            dpg.draw_line(support_start, support_end, color=FIXTURE_COLOR, thickness=2, parent="canvas")
            
            # 3. Draw diagonal strut lines
            strut_length = FIXTURE_DIMENSIONS["strut_length"]
            angle_rad = math.radians(FIXTURE_DIMENSIONS["strut_angle"])
            dx = math.sin(angle_rad) * strut_length
            dy = math.cos(angle_rad) * strut_length
            
            half_count = FIXTURE_DIMENSIONS["strut_count"] // 2
            spacing = FIXTURE_DIMENSIONS["strut_spacing"]
            
            # Draw struts centered on the support line
            for i in range(-half_count, half_count + 1):
                strut_x = x + (i * spacing)
                strut_start = (strut_x, support_y)
                
                # Alternate between left and right struts
                if i % 2 == 0:
                    # Strut going down-right
                    strut_end = (strut_x + dx, support_y + dy)
                else:
                    # Strut going down-left
                    strut_end = (strut_x - dx, support_y + dy)
                
                dpg.draw_line(strut_start, strut_end, color=FIXTURE_COLOR, thickness=1, parent="canvas")

def draw_masses(model):
    """Draw all masses on the canvas."""
    for mass in model.masses:
        if mass["node"] < len(model.nodes):
            node_pos = model.nodes[mass["node"]]["pos"]
            dpg.draw_circle(node_pos, 12, color=MASS_COLOR, thickness=2, parent="canvas")
            dpg.draw_text((node_pos[0] + 10, node_pos[1] + 10), 
                         f"{mass['value']}kg", color=(255, 255, 255, 255), parent="canvas")

def draw_everything(model, mouse_pos=None, scale_factor=1.0):
    """Clear canvas and redraw all elements."""
    try:
        dpg.delete_item("canvas", children_only=True)
        
        # Redraw everything
        draw_grid(scale_factor)
        draw_beams(model, mouse_pos)
        draw_nodes(model)
        draw_fixtures(model)
        draw_masses(model)
    except Exception as e:
        print(f"Error in draw_everything: {e}")

def create_ui(add_node_callback, add_beam_callback, add_fixture_callback, 
              add_mass_callback, delete_callback, clear_all_callback, canvas_click_callback):
    """Create the main user interface with a dedicated drawing area"""
    with dpg.window(label="Motorcycle Frame Designer", tag="main_window", no_close=True):
        with dpg.group(horizontal=True):
            # Left sidebar for tools
            with dpg.child_window(width=SIDEBAR_WIDTH, height=CANVAS_HEIGHT, tag="sidebar"):
                dpg.add_text("Tools", color=(255, 255, 0))
                dpg.add_separator()
                
                # Tool buttons with highlighted frames
                # ... existing button code ...
                
                dpg.add_spacer(height=10)
                dpg.add_separator()
                dpg.add_spacer(height=10)
                
                # Grid settings
                dpg.add_text("Grid Settings", color=(255, 255, 0))
                
                def update_grid_scale(sender, app_data):
                    # Update the grid scale factor
                    # We need to access the global grid_scale_factor from main_frame_design.py
                    # We'll import it explicitly here
                    import sys
                    main_module = sys.modules['__main__']
                    if hasattr(main_module, 'grid_scale_factor'):
                        main_module.grid_scale_factor = app_data
                        # Redraw everything with new scale
                        if hasattr(main_module, 'model'):
                            draw_everything(main_module.model, None, app_data)
                    else:
                        print("Warning: Could not update grid scale factor")
                
                # Add a slider to control grid scale
                dpg.add_text("Grid Scale (units per cell)")
                dpg.add_slider_float(
                    default_value=1.0,
                    min_value=0.1, 
                    max_value=10.0,
                    callback=update_grid_scale,
                    tag="grid_scale_slider",
                    width=180
                )
                
                # Add a button to reset grid scale
                dpg.add_button(
                    label="Reset Scale", 
                    callback=lambda: dpg.set_value("grid_scale_slider", 1.0),
                    width=180
                )
                
                dpg.add_spacer(height=10)
                
                # Statistics section (already in your code)
                dpg.add_separator()
                dpg.add_text("Statistics", color=(255, 255, 0))
                # ...existing stats code...
                
            # Right side: Canvas
            with dpg.child_window(width=CANVAS_WIDTH, height=CANVAS_HEIGHT, tag="canvas_window"):
                # Create a drawing canvas
                with dpg.drawlist(width=CANVAS_WIDTH, height=CANVAS_HEIGHT, tag="canvas"):
                    # The drawlist will be our canvas
                    pass
                
                # No mouse handlers here - they're in frame_design_ui.py
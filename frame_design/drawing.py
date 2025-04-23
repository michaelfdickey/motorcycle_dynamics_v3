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

def draw_grid():
    """Draw a grid on the canvas."""
    # Get the size of the drawing area
    width = CANVAS_WIDTH
    height = CANVAS_HEIGHT
    
    # Draw vertical grid lines
    for x in range(0, width, GRID_SPACING):
        dpg.draw_line((x, 0), (x, height), color=GRID_COLOR, parent="canvas")
    
    # Draw horizontal grid lines
    for y in range(0, height, GRID_SPACING):
        dpg.draw_line((0, y), (width, y), color=GRID_COLOR, parent="canvas")

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

def draw_everything(model, mouse_pos=None):
    """Clear canvas and redraw all elements."""
    try:
        dpg.delete_item("canvas", children_only=True)
        
        # Redraw everything
        draw_grid()
        draw_beams(model, mouse_pos)
        draw_nodes(model)
        draw_fixtures(model)
        draw_masses(model)
    except Exception as e:
        print(f"Error in draw_everything: {e}")
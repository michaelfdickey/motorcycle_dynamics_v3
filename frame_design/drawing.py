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
FIXTURE_COLOR = (0, 0, 255, 255)  # Blue
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
    """Draw all fixtures on the canvas."""
    for fixture in model.fixtures:
        if fixture["node"] < len(model.nodes):
            node_pos = model.nodes[fixture["node"]]["pos"]
            dpg.draw_circle(node_pos, 8, color=FIXTURE_COLOR, thickness=2, parent="canvas")

def draw_masses(model):
    """Draw all masses on the canvas."""
    for mass in model.masses:
        if mass["node"] < len(model.nodes):
            node_pos = model.nodes[mass["node"]]["pos"]
            dpg.draw_circle(node_pos, 8, color=MASS_COLOR, thickness=2, parent="canvas")
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
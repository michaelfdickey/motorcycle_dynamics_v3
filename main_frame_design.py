"""
Motorcycle Frame Design Application
A basic structural modeling tool for motorcycle frame design
"""

import os
import sys
import dearpygui.dearpygui as dpg

# Ensure the frame_design package can be imported
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import from frame_design package
from frame_design.entities import FrameModel
from frame_design.drawing import draw_grid, draw_everything, CANVAS_WIDTH, CANVAS_HEIGHT
from frame_design.frame_design_ui import create_ui, update_stats, get_canvas_mouse_pos, highlight_active_tool_button
from frame_design.utils import load_fonts

# Global variables
model = FrameModel()
selected_tool = None

# Callback functions
def add_node_callback():
    global selected_tool
    selected_tool = "node"
    print("Node tool selected")
    highlight_active_tool_button("Add Node")

def add_beam_callback():
    global selected_tool
    selected_tool = "beam"
    model.deselect_all_nodes()
    print("Beam tool selected")
    highlight_active_tool_button("Add Beam")
    draw_everything(model)

def add_fixture_callback():
    global selected_tool
    selected_tool = "fixture"
    print("Fixture tool selected")
    highlight_active_tool_button("Add Fixture")

def add_mass_callback():
    global selected_tool
    selected_tool = "mass"
    print("Mass tool selected")
    highlight_active_tool_button("Add Mass")

def delete_callback():
    global selected_tool
    selected_tool = "delete"
    print("Delete tool selected")
    highlight_active_tool_button("Delete")

def clear_all_callback():
    global model
    model.clear()
    print("All entities cleared")
    draw_everything(model)

def canvas_click(sender, app_data):
    """Handle mouse clicks on the canvas"""
    global selected_tool, model
    
    print(f"\n--- CANVAS CLICK ---")
    
    # Get mouse position in screen coordinates
    mouse_pos = dpg.get_mouse_pos(local=False)
    print(f"Raw mouse position: {mouse_pos}")
    
    # Get item configuration info to determine offsets precisely
    canvas_window_info = dpg.get_item_configuration("canvas_window")
    main_window_pos = dpg.get_item_pos("main_window")
    
    # Calculate canvas position - this is the key to accurate positioning
    # Consider the sidebar width and any window decorations
    from frame_design.frame_design_ui import SIDEBAR_WIDTH
    
    # Fine-tuned constants to adjust for window decorations and the canvas position
    # within the main window - adjusted to fix the 20-pixel offset
    WINDOW_PADDING_X = 23   # Window frame width + adjustment for 20px offset
    WINDOW_PADDING_Y = 15   # Window title bar + frame + adjustment for 20px offset
    
    # Calculate the exact position relative to the canvas
    x = mouse_pos[0] - main_window_pos[0] - SIDEBAR_WIDTH - WINDOW_PADDING_X
    y = mouse_pos[1] - main_window_pos[1] - WINDOW_PADDING_Y
    
    print(f"Calculated canvas position: {x}, {y}")
    
    # Handle different tool actions
    if selected_tool == "node":
        model.add_node((x, y))
        print(f"Added node at {x}, {y}")
    
    # ... rest of the function remains unchanged 
    elif selected_tool == "beam" and len(model.nodes) >= 1:
        closest_idx = model.find_closest_node(x, y)
        if closest_idx is not None:
            if model.selected_node is None:
                # Select this node as start
                model.select_node(closest_idx)
                print(f"Selected node {closest_idx} for beam start")
            elif model.selected_node != closest_idx:
                # Create beam between selected and this node
                model.add_beam(model.selected_node, closest_idx)
                print(f"Created beam from {model.selected_node} to {closest_idx}")
                model.deselect_all_nodes()
            else:
                # Deselect if clicking same node
                model.deselect_all_nodes()
                print("Deselected node")
                
    elif selected_tool == "fixture" and len(model.nodes) > 0:
        closest_idx = model.find_closest_node(x, y)
        if closest_idx is not None:
            if model.add_fixture(closest_idx) is not None:
                print(f"Added fixture to node {closest_idx}")
            else:
                print(f"Node {closest_idx} already has a fixture")
                
    elif selected_tool == "mass" and len(model.nodes) > 0:
        closest_idx = model.find_closest_node(x, y)
        if closest_idx is not None:
            # Get mass value from input field
            try:
                mass_value = dpg.get_value("mass_value_input")
                if mass_value is None:
                    mass_value = 100
            except:
                mass_value = 100  # Default
            
            if model.add_mass(closest_idx, mass_value) is not None:
                print(f"Added {mass_value}kg mass to node {closest_idx}")
            else:
                print(f"Node {closest_idx} already has a mass")
                
    elif selected_tool == "delete":
        node_idx = model.find_closest_node(x, y)
        if node_idx is not None:
            model.delete_node(node_idx)
            print(f"Deleted node {node_idx} and related elements")
    
    draw_everything(model)

def main():
    # Initialize DearPyGui
    dpg.create_context()
    
    # Configure viewport
    dpg.create_viewport(title="Motorcycle Frame Designer", width=1200, height=800)
    
    # Load fonts
    load_fonts()
    
    # Create the UI with our callbacks
    create_ui(
        add_node_callback=add_node_callback,
        add_beam_callback=add_beam_callback,
        add_fixture_callback=add_fixture_callback,
        add_mass_callback=add_mass_callback,
        delete_callback=delete_callback,
        clear_all_callback=clear_all_callback,
        canvas_click_callback=canvas_click
    )
    
    # Setup and show the viewport
    dpg.setup_dearpygui()
    dpg.show_viewport()
    
    # Set primary window
    dpg.set_primary_window("main_window", True)
    
    # Draw initial grid
    draw_grid()
    
    # Set Node tool as default and highlight it
    add_node_callback()
    
    # Main loop
    try:
        last_mouse_pos = None
        while dpg.is_dearpygui_running():
            # Update mouse position for beam preview
            if selected_tool == "beam" and model.selected_node is not None:
                # Use the EXACT same offset calculation as in canvas_click function
                mouse_pos = dpg.get_mouse_pos(local=False)
                if mouse_pos:
                    # Get main window position
                    main_window_pos = dpg.get_item_pos("main_window")
                    
                    # Use the same constants as in canvas_click
                    from frame_design.frame_design_ui import SIDEBAR_WIDTH
                    WINDOW_PADDING_X = 23   # Match canvas_click exactly
                    WINDOW_PADDING_Y = 15   # Match canvas_click exactly
                    
                    # Calculate canvas position with consistent offsets
                    x = mouse_pos[0] - main_window_pos[0] - SIDEBAR_WIDTH - WINDOW_PADDING_X
                    y = mouse_pos[1] - main_window_pos[1] - WINDOW_PADDING_Y
                    
                    # Only redraw if position has changed
                    current_pos = (x, y)
                    if current_pos != last_mouse_pos:
                        last_mouse_pos = current_pos
                        draw_everything(model, current_pos)
            
            dpg.render_dearpygui_frame()
            
    except Exception as e:
        print(f"Error in application: {e}")
    finally:
        dpg.destroy_context()

if __name__ == "__main__":
    main()
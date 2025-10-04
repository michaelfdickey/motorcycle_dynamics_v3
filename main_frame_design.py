"""
LEGACY / DEPRECATED MODULE
---------------------------------------------------------------------
This Dear PyGui desktop prototype is RETIRED.
All new development (materials catalog, section selection, analysis,
visual overlays) now lives in the web application (FastAPI backend +
React/TypeScript frontend under the `frontend/` directory).

Do NOT add new features here. Keep only for historical reference or
quick local experiments. If accidentally opened, exit and run the web
stack instead.

Safe to delete once full feature parity & data migration are confirmed.
---------------------------------------------------------------------
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
from frame_design.utils import load_fonts, load_materials, format_section_label

# Global variables
model = FrameModel()
selected_tool = None
grid_scale_factor = 1.0  # Default scale: 1 grid cell = 1 unit
materials_catalog = []

def rebuild_beam_list():
    """Recreate the beam list UI with section assignment buttons."""
    try:
        if not dpg.does_item_exist("beam_list_group"):
            return
        dpg.delete_item("beam_list_group", children_only=True)
        for i, beam in enumerate(model.beams):
            start = beam.get("start")
            end = beam.get("end")
            if start is None or end is None or start >= len(model.nodes) or end >= len(model.nodes):
                continue
            label = f"B{i}: N{start}-N{end}"
            if beam.get("section"):
                sec = beam["section"]
                label += " | "
                if sec.get("shape") == "round_tube":
                    label += f"{sec.get('outer_diameter_in',0):.2f}x{sec.get('wall_thickness_in',0):.3f}"
                elif sec.get("shape") == "square_tube":
                    label += f"{sec.get('outer_width_in',0):.2f}sq {sec.get('wall_thickness_in',0):.3f}"
            with dpg.group(parent="beam_list_group"):
                dpg.add_text(label)
                dpg.add_button(label="Set Section", width=120, callback=lambda s,a,b_idx=i: open_section_selector(b_idx))
                dpg.add_separator()
    except Exception as e:
        print(f"Error rebuilding beam list: {e}")

def open_section_selector(beam_index:int):
    """Open a popup window listing available sections to assign to beam."""
    if beam_index >= len(model.beams):
        return
    if dpg.does_item_exist("section_selector_window"):
        dpg.delete_item("section_selector_window")
    with dpg.window(label=f"Select Section for B{beam_index}", modal=True, tag="section_selector_window", width=430, height=500):
        dpg.add_text("Round Tubes")
        round_entries = [e for e in materials_catalog if e.get("shape") == "round_tube"]
        round_labels = [format_section_label(e) for e in round_entries]
        dpg.add_listbox(round_labels, num_items=8, callback=lambda s,a: _assign_section(beam_index, round_entries[a]), width=-1)
        dpg.add_separator()
        dpg.add_text("Square Tubes")
        square_entries = [e for e in materials_catalog if e.get("shape") == "square_tube"]
        square_labels = [format_section_label(e) for e in square_entries]
        dpg.add_listbox(square_labels, num_items=8, callback=lambda s,a: _assign_section(beam_index, square_entries[a]), width=-1)
        dpg.add_button(label="Close", callback=lambda: dpg.delete_item("section_selector_window"))

def _assign_section(beam_index, section_entry):
    model.beams[beam_index]["section"] = section_entry
    if dpg.does_item_exist("section_selector_window"):
        dpg.delete_item("section_selector_window")
    rebuild_beam_list()
    draw_everything(model, None, grid_scale_factor)

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
    rebuild_beam_list()

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
    rebuild_beam_list()

def canvas_click(sender, app_data):
    """Handle mouse clicks on the canvas"""
    global selected_tool, model
    
    print("\n--- CANVAS CLICK ---")
    
    # Get mouse position and convert to canvas coordinates
    mouse_pos = dpg.get_mouse_pos(local=False)
    canvas_pos = dpg.get_item_pos("canvas")
    x = mouse_pos[0] - canvas_pos[0]
    y = mouse_pos[1] - canvas_pos[1]
    
    print(f"Canvas position: {x}, {y}")
    
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
                rebuild_beam_list()
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
    
    draw_everything(model, None, grid_scale_factor)

def main():
    # Initialize DearPyGui
    dpg.create_context()
    
    # Configure viewport
    dpg.create_viewport(title="Motorcycle Frame Designer", width=1200, height=800)
    
    # Load fonts
    load_fonts()
    
    # Load materials catalog
    global materials_catalog
    materials_catalog = load_materials()

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
    draw_grid(grid_scale_factor)
    
    # Set Node tool as default and highlight it
    add_node_callback()
    rebuild_beam_list()
    
    # Main loop
    try:
        last_mouse_pos = None
        while dpg.is_dearpygui_running():
            # For beam preview
            if selected_tool == "beam" and model.selected_node is not None:
                # Get mouse position
                mouse_pos = dpg.get_mouse_pos(local=False)
                canvas_pos = dpg.get_item_rect_min("canvas")
                
                # Calculate position relative to canvas
                x = mouse_pos[0] - canvas_pos[0]
                y = mouse_pos[1] - canvas_pos[1]
                
                # Only redraw when mouse has moved
                current_pos = (x, y)
                if current_pos != last_mouse_pos:
                    last_mouse_pos = current_pos
                    draw_everything(model, current_pos, grid_scale_factor)
            
            update_stats(model)
            dpg.render_dearpygui_frame()
            
    except Exception as e:
        print(f"Error in application: {e}")
    finally:
        dpg.destroy_context()

if __name__ == "__main__":
    main()
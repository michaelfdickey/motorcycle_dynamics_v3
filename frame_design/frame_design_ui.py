"""
User interface components for the Motorcycle Frame Designer
"""

import dearpygui.dearpygui as dpg

# UI Constants
WINDOW_WIDTH = 1200
WINDOW_HEIGHT = 800
SIDEBAR_WIDTH = 250
CANVAS_WIDTH = WINDOW_WIDTH - SIDEBAR_WIDTH
CANVAS_HEIGHT = WINDOW_HEIGHT - 50

def highlight_active_tool_button(active_button_label):
    """Highlight the active tool button and reset others."""
    buttons = ["Add Node", "Add Beam", "Add Fixture", "Add Mass", "Delete"]
    
    for button in buttons:
        try:
            if button == active_button_label:
                dpg.configure_item(f"{button}_button", background_color=(0, 100, 0))
            else:
                dpg.configure_item(f"{button}_button", background_color=(0, 0, 0, 0))
        except:
            print(f"Error configuring button {button}")

def update_stats(model):
    """Update statistics display."""
    try:
        # Update statistics
        dpg.set_value("node_stats", f"Nodes: {len(model.nodes)}")
        dpg.set_value("beam_stats", f"Beams: {len(model.beams)}")
        dpg.set_value("fixture_stats", f"Fixtures: {len(model.fixtures)}")
        dpg.set_value("mass_stats", f"Masses: {len(model.masses)}")
        
        # Update debug info
        debug_info = f"Selected Node: {model.selected_node}\n"
        debug_info += f"Mouse Pos: {dpg.get_mouse_pos()}"
        dpg.set_value("debug_text", debug_info)
    except Exception as e:
        print(f"Error updating stats: {e}")

def get_canvas_mouse_pos():
    """Calculate mouse position relative to canvas."""
    try:
        viewport_pos = dpg.get_mouse_pos(local=False)
        canvas_window_pos = dpg.get_item_pos("canvas_window")
        
        # Calculate adjusted position
        x = viewport_pos[0] - canvas_window_pos[0] - 8  # Adjust if needed
        y = viewport_pos[1] - canvas_window_pos[1] - 30  # Adjust for title bar height
        
        # Ensure coordinates are within canvas bounds
        if x < 0 or y < 0 or x > CANVAS_WIDTH or y > CANVAS_HEIGHT:
            return None
            
        return (x, y)
    except Exception as e:
        print(f"Error calculating mouse position: {e}")
        return None

def create_ui(add_node_callback, add_beam_callback, add_fixture_callback, 
              add_mass_callback, delete_callback, clear_all_callback, canvas_click_callback):
    """Create the main user interface"""
    with dpg.window(label="Motorcycle Frame Designer", tag="main_window", no_close=True):
        with dpg.group(horizontal=True):
            # Left sidebar for tools
            with dpg.child_window(width=SIDEBAR_WIDTH, height=CANVAS_HEIGHT, tag="sidebar"):
                dpg.add_text("Tools", color=(255, 255, 0))
                dpg.add_separator()
                with dpg.group():
                    dpg.add_button(label="Add Node", callback=add_node_callback, width=180, tag="Add Node_button")
                    dpg.add_button(label="Add Beam", callback=add_beam_callback, width=180, tag="Add Beam_button")
                    dpg.add_button(label="Add Fixture", callback=add_fixture_callback, width=180, tag="Add Fixture_button")
                    dpg.add_button(label="Add Mass", callback=add_mass_callback, width=180, tag="Add Mass_button")
                    dpg.add_separator()
                    dpg.add_button(label="Delete", callback=delete_callback, width=180, tag="Delete_button")
                    dpg.add_button(label="Clear All", callback=clear_all_callback, width=180)
                
                dpg.add_separator()
                dpg.add_text("Properties")
                # Mass value editor
                with dpg.group(horizontal=True):
                    dpg.add_text("Mass Value (kg): ")
                    dpg.add_input_int(default_value=100, tag="mass_value_input", width=100)

                dpg.add_separator()
                dpg.add_text("Statistics")
                dpg.add_text("Nodes: 0", tag="node_stats")
                dpg.add_text("Beams: 0", tag="beam_stats")
                dpg.add_text("Fixtures: 0", tag="fixture_stats")
                dpg.add_text("Masses: 0", tag="mass_stats")
                
                dpg.add_separator()
                dpg.add_text("Debug Info")
                dpg.add_text("", tag="debug_text")
            
            # Main drawing canvas
            with dpg.child_window(width=CANVAS_WIDTH, height=CANVAS_HEIGHT, tag="canvas_window"):
                with dpg.drawlist(width=CANVAS_WIDTH, height=CANVAS_HEIGHT, tag="canvas"):
                    # Canvas will be drawn here
                    pass
                
                # Handle mouse clicks on the canvas
                with dpg.item_handler_registry(tag="canvas_handler"):
                    dpg.add_item_clicked_handler(callback=canvas_click_callback)
                dpg.bind_item_handler_registry("canvas", "canvas_handler")
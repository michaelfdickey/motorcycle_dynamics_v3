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
    """Highlight the active tool button by coloring its frame without moving buttons."""
    buttons = ["Add Node", "Add Beam", "Add Fixture", "Add Mass", "Delete"]
    
    for button in buttons:
        try:
            # Get the frame tag for this button
            frame_tag = button.replace(" ", "_") + "_frame"
            
            # Set frame color based on whether this is the active button
            if button == active_button_label:
                # Create a bold green theme for the active tool
                with dpg.theme() as theme:
                    with dpg.theme_component(dpg.mvAll):
                        # Bright green background
                        dpg.add_theme_color(dpg.mvThemeCol_ChildBg, (0, 120, 0), category=dpg.mvThemeCat_Core)
                        # Keep consistent styling to avoid layout changes
                        dpg.add_theme_style(dpg.mvStyleVar_ChildRounding, 5, category=dpg.mvThemeCat_Core)
                        # Use the same border size for all states to prevent movement
                        dpg.add_theme_style(dpg.mvStyleVar_ChildBorderSize, 1, category=dpg.mvThemeCat_Core)
                        # Border color for active
                        dpg.add_theme_color(dpg.mvThemeCol_Border, (0, 255, 0), category=dpg.mvThemeCat_Core)
                
                # Apply the theme to the frame
                dpg.bind_item_theme(frame_tag, theme)
            else:
                # Dark gray background for inactive tools
                with dpg.theme() as theme:
                    with dpg.theme_component(dpg.mvAll):
                        dpg.add_theme_color(dpg.mvThemeCol_ChildBg, (40, 40, 40), category=dpg.mvThemeCat_Core)
                        # Keep consistent styling
                        dpg.add_theme_style(dpg.mvStyleVar_ChildRounding, 5, category=dpg.mvThemeCat_Core)
                        # Use the same border size for all states to prevent movement
                        dpg.add_theme_style(dpg.mvStyleVar_ChildBorderSize, 1, category=dpg.mvThemeCat_Core)
                        # Border color for inactive (dark gray border)
                        dpg.add_theme_color(dpg.mvThemeCol_Border, (60, 60, 60), category=dpg.mvThemeCat_Core)
                
                dpg.bind_item_theme(frame_tag, theme)
            
        except Exception as e:
            print(f"Error highlighting button {button}: {e}")

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
    """Get mouse position relative to canvas origin"""
    # Get mouse position in screen coordinates
    mouse_pos = dpg.get_mouse_pos(local=False)
    
    try:
        # Get main window position
        main_window_pos = dpg.get_item_pos("main_window")
        
        # Use the same offset calculation as in canvas_click function
        # for consistent coordinates between clicks and mouse movement
        WINDOW_PADDING_X = 28   # Window frame width + adjustment
        WINDOW_PADDING_Y = 57   # Window title bar + frame + adjustment
        
        # Calculate position relative to canvas
        x = mouse_pos[0] - main_window_pos[0] - SIDEBAR_WIDTH - WINDOW_PADDING_X
        y = mouse_pos[1] - main_window_pos[1] - WINDOW_PADDING_Y
        
        # Ensure coordinates are within canvas bounds
        if 0 <= x <= CANVAS_WIDTH and 0 <= y <= CANVAS_HEIGHT:
            return (x, y)
            
    except Exception as e:
        print(f"Error getting canvas mouse position: {e}")
        
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
                
                # Tool buttons with highlighted frames
                with dpg.group():
                    # Create a base theme for all buttons to ensure consistent layout
                    with dpg.theme() as button_base_theme:
                        with dpg.theme_component(dpg.mvAll):
                            dpg.add_theme_style(dpg.mvStyleVar_ChildRounding, 5, category=dpg.mvThemeCat_Core)
                            dpg.add_theme_style(dpg.mvStyleVar_ChildBorderSize, 1, category=dpg.mvThemeCat_Core)
                            dpg.add_theme_color(dpg.mvThemeCol_Border, (60, 60, 60), category=dpg.mvThemeCat_Core)
                            dpg.add_theme_color(dpg.mvThemeCol_ChildBg, (40, 40, 40), category=dpg.mvThemeCat_Core)
                    
                    # Add Node - using child_window for better styling control
                    with dpg.child_window(height=35, width=200, tag="Add_Node_frame", no_scrollbar=True):
                        dpg.add_button(label="Add Node", callback=add_node_callback, width=190, tag="Add_Node_button")
                    dpg.bind_item_theme("Add_Node_frame", button_base_theme)
                    
                    dpg.add_spacer(height=5)
                    
                    # Add Beam
                    with dpg.child_window(height=35, width=200, tag="Add_Beam_frame", no_scrollbar=True):
                        dpg.add_button(label="Add Beam", callback=add_beam_callback, width=190, tag="Add_Beam_button")
                    dpg.bind_item_theme("Add_Beam_frame", button_base_theme)
                    
                    dpg.add_spacer(height=5)
                    
                    # Add Fixture
                    with dpg.child_window(height=35, width=200, tag="Add_Fixture_frame", no_scrollbar=True):
                        dpg.add_button(label="Add Fixture", callback=add_fixture_callback, width=190, tag="Add_Fixture_button")
                    dpg.bind_item_theme("Add_Fixture_frame", button_base_theme)
                    
                    dpg.add_spacer(height=5)
                    
                    # Add Mass
                    with dpg.child_window(height=35, width=200, tag="Add_Mass_frame", no_scrollbar=True):
                        dpg.add_button(label="Add Mass", callback=add_mass_callback, width=190, tag="Add_Mass_button")
                    dpg.bind_item_theme("Add_Mass_frame", button_base_theme)
                    
                    dpg.add_spacer(height=5)
                    dpg.add_separator()
                    dpg.add_spacer(height=5)
                    
                    # Delete
                    with dpg.child_window(height=35, width=200, tag="Delete_frame", no_scrollbar=True):
                        dpg.add_button(label="Delete", callback=delete_callback, width=190, tag="Delete_button")
                    dpg.bind_item_theme("Delete_frame", button_base_theme)
                    
                    dpg.add_spacer(height=5)
                    
                    # Clear All (no highlighting needed)
                    dpg.add_button(label="Clear All", callback=clear_all_callback, width=200)
                
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

                dpg.add_separator()
                dpg.add_text("Beams", color=(255,255,0))
                dpg.add_text("Select a beam section per element:")
                dpg.add_child_window(height=200, width=220, tag="beam_list_group", no_scrollbar=False)
            
            # Right side: Canvas
            with dpg.child_window(width=CANVAS_WIDTH, height=CANVAS_HEIGHT, tag="canvas_window"):
                # Create a drawlist for our canvas
                with dpg.drawlist(width=CANVAS_WIDTH, height=CANVAS_HEIGHT, tag="canvas"):
                    pass  # Canvas will be drawn in drawing.py
                
                # Set up mouse handlers using the proper method
                with dpg.handler_registry():
                    dpg.add_mouse_click_handler(callback=canvas_click_callback)
                    
                    # Add hover/move handler for beam preview
                    dpg.add_mouse_move_handler(callback=lambda sender, app_data: on_mouse_move())

def on_mouse_hover(sender, app_data):
    """Handle mouse movement over canvas for beam preview"""
    # Get the model and selected tool from main module
    import sys
    main = sys.modules['__main__']
    
    if hasattr(main, 'selected_tool') and main.selected_tool == "beam":
        if hasattr(main, 'model') and main.model.selected_node is not None:
            # Get local mouse position within canvas
            mouse_pos = dpg.get_mouse_pos(local=True)
            if mouse_pos:
                # Draw beam preview
                from frame_design.drawing import draw_everything
                grid_scale = main.grid_scale_factor if hasattr(main, 'grid_scale_factor') else 1.0
                draw_everything(main.model, mouse_pos, grid_scale)

def on_mouse_move():
    """Handle mouse movement for beam preview"""
    # Get the mouse position
    mouse_pos = dpg.get_mouse_pos(local=False)
    
    # Transform to canvas coordinates
    canvas_pos = dpg.get_item_pos("canvas")
    x = mouse_pos[0] - canvas_pos[0]
    y = mouse_pos[1] - canvas_pos[1]
    
    # Get the model and selected tool from main module
    import sys
    main = sys.modules['__main__']
    
    if hasattr(main, 'selected_tool') and main.selected_tool == "beam":
        if hasattr(main, 'model') and main.model.selected_node is not None:
            # Only process if we're in beam mode with a selected node
            # Draw beam preview
            from frame_design.drawing import draw_everything
            grid_scale = main.grid_scale_factor if hasattr(main, 'grid_scale_factor') else 1.0
            draw_everything(main.model, (x, y), grid_scale)
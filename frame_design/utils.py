"""
Utility functions for the Motorcycle Frame Designer.
Contains helper functions and utilities used across the application.
"""

import os
import json
import dearpygui.dearpygui as dpg

def load_fonts():
    """Load fonts for the application."""
    try:
        with dpg.font_registry():
            # Try to find Arial on the system
            font_paths = [
                "C:/Windows/Fonts/arial.ttf",  # Windows
                "/Library/Fonts/Arial.ttf",    # macOS
                "/usr/share/fonts/truetype/msttcorefonts/arial.ttf"  # Some Linux
            ]
            
            arial_path = None
            for path in font_paths:
                if os.path.exists(path):
                    arial_path = path
                    break
            
            if arial_path:
                # Load Arial with various sizes
                default_font = dpg.add_font(arial_path, 14)
                large_font = dpg.add_font(arial_path, 18)
                small_font = dpg.add_font(arial_path, 12)
                dpg.bind_font(default_font)
                return default_font
            else:
                print("Arial font not found, using default font")
                return None
    except Exception as e:
        print(f"Error loading fonts: {e}")
        return None

def distance(p1, p2):
    """Calculate Euclidean distance between two points."""
    return ((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2) ** 0.5

def midpoint(p1, p2):
    """Calculate the midpoint between two points."""
    return ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)

def calculate_beam_length(model, beam):
    """Calculate the length of a beam."""
    if beam["start"] < len(model.nodes) and beam["end"] < len(model.nodes):
        start_pos = model.nodes[beam["start"]]["pos"]
        end_pos = model.nodes[beam["end"]]["pos"]
        return distance(start_pos, end_pos)
    return 0

def get_statistics(model):
    """Calculate statistics for the model."""
    stats = {
        "node_count": len(model.nodes),
        "beam_count": len(model.beams),
        "fixture_count": len(model.fixtures),
        "mass_count": len(model.masses),
        "total_mass": sum(mass.get("value", 0) for mass in model.masses),
        "total_beam_length": sum(calculate_beam_length(model, beam) for beam in model.beams)
    }
    return stats

_materials_cache = None

def load_materials(json_path="materials.json"):
    """Load materials/sections catalog once (cached). Returns list of entries."""
    global _materials_cache
    if _materials_cache is not None:
        return _materials_cache
    try:
        if not os.path.isabs(json_path):
            # Resolve relative to project root (one level up from this file's directory)
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            json_path = os.path.join(base_dir, json_path)
        with open(json_path, 'r') as f:
            data = json.load(f)
        _materials_cache = data.get("materials", [])
    except Exception as e:
        print(f"Failed to load materials catalog: {e}")
        _materials_cache = []
    return _materials_cache

def format_section_label(entry):
    """Return a human-readable label for a materials entry."""
    shape = entry.get("shape")
    grade = entry.get("grade", "?")
    if shape == "round_tube":
        od = entry.get("outer_diameter_in")
        wall = entry.get("wall_thickness_in")
        return f"{od:.3f} OD x {wall:.3f} wall ({grade})"
    if shape == "square_tube":
        w = entry.get("outer_width_in")
        wall = entry.get("wall_thickness_in")
        return f"{w:.2f} sq x {wall:.3f} wall ({grade})"
    return grade
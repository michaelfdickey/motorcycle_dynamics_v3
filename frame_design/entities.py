"""
Entity definitions and management for Motorcycle Frame Design.
Contains classes for frame model elements like nodes, beams, fixtures, and masses.
"""

class FrameModel:
    """Model class to store all frame entities."""
    
    def __init__(self):
        self.nodes = []
        self.beams = []
        self.fixtures = []
        self.masses = []
        self.selected_node = None
    
    def add_node(self, pos):
        """Add a node at the specified position."""
        self.nodes.append({"pos": pos, "selected": False})
        return len(self.nodes) - 1  # Return index of new node
    
    def add_beam(self, start_idx, end_idx):
        """Add a beam between two nodes."""
        if start_idx < len(self.nodes) and end_idx < len(self.nodes):
            self.beams.append({"start": start_idx, "end": end_idx})
            return len(self.beams) - 1
        return None
    
    def add_fixture(self, node_idx):
        """Add a fixture to a node."""
        if node_idx < len(self.nodes):
            # Check if fixture already exists
            for fixture in self.fixtures:
                if fixture["node"] == node_idx:
                    return None  # Already exists
            
            self.fixtures.append({"node": node_idx})
            return len(self.fixtures) - 1
        return None
    
    def add_mass(self, node_idx, value=100):
        """Add a mass to a node."""
        if node_idx < len(self.nodes):
            # Check if mass already exists
            for mass in self.masses:
                if mass["node"] == node_idx:
                    return None  # Already exists
            
            self.masses.append({"node": node_idx, "value": value})
            return len(self.masses) - 1
        return None
    
    def delete_node(self, node_idx):
        """Delete a node and all connected elements."""
        if node_idx >= len(self.nodes):
            return False
        
        # Delete connected beams
        self.beams = [beam for beam in self.beams 
                     if beam["start"] != node_idx and beam["end"] != node_idx]
        
        # Delete connected fixtures
        self.fixtures = [fixture for fixture in self.fixtures 
                        if fixture["node"] != node_idx]
        
        # Delete connected masses
        self.masses = [mass for mass in self.masses 
                      if mass["node"] != node_idx]
        
        # Delete the node
        self.nodes.pop(node_idx)
        
        # Adjust indices in remaining elements
        for beam in self.beams:
            if beam["start"] > node_idx:
                beam["start"] -= 1
            if beam["end"] > node_idx:
                beam["end"] -= 1
        
        for fixture in self.fixtures:
            if fixture["node"] > node_idx:
                fixture["node"] -= 1
        
        for mass in self.masses:
            if mass["node"] > node_idx:
                mass["node"] -= 1
        
        # Reset selected node if deleted
        if self.selected_node == node_idx:
            self.selected_node = None
        elif self.selected_node > node_idx:
            self.selected_node -= 1
        
        return True
    
    def clear(self):
        """Clear all entities in the model."""
        self.nodes.clear()
        self.beams.clear()
        self.fixtures.clear()
        self.masses.clear()
        self.selected_node = None
    
    def find_closest_node(self, x, y, max_distance=15):
        """Find index of the closest node to the given coordinates."""
        min_dist = float('inf')
        closest_idx = None
        
        for i, node in enumerate(self.nodes):
            node_x, node_y = node["pos"]
            dist = ((x - node_x)**2 + (y - node_y)**2)**0.5
            if dist < min_dist and dist <= max_distance:
                min_dist = dist
                closest_idx = i
        
        return closest_idx
    
    def select_node(self, node_idx):
        """Select a node and deselect others."""
        if node_idx >= len(self.nodes):
            return False
        
        # Deselect all nodes
        for node in self.nodes:
            node["selected"] = False
        
        # Select the specified node
        self.nodes[node_idx]["selected"] = True
        self.selected_node = node_idx
        return True
    
    def deselect_all_nodes(self):
        """Deselect all nodes."""
        for node in self.nodes:
            node["selected"] = False
        self.selected_node = None
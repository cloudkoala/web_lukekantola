#!/usr/bin/env python3
"""
PLY File Chunker Tool
Analyzes and chunks PLY files for progressive loading in web applications.
"""

import os
import sys
import struct
import json
import math
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass

@dataclass
class PLYHeader:
    """PLY file header information"""
    format_type: str  # ascii or binary_little_endian
    vertex_count: int
    properties: List[str]
    header_size: int

@dataclass
class Vertex:
    """3D vertex with color"""
    x: float
    y: float
    z: float
    r: int = 255
    g: int = 255
    b: int = 255
    full_data: list = None  # Store full line data for complex PLY files

@dataclass
class ChunkInfo:
    """Information about a generated chunk"""
    filename: str
    vertex_count: int
    bounding_box: Dict[str, Dict[str, float]]
    priority: int
    file_size: int

class PLYChunker:
    def __init__(self, target_chunk_size_mb: float = 0.2):
        """
        Initialize PLY chunker.
        
        Args:
            target_chunk_size_mb: Target size for each chunk in megabytes
        """
        self.target_chunk_size_mb = target_chunk_size_mb
        self.target_chunk_size_bytes = int(target_chunk_size_mb * 1024 * 1024)
    
    def analyze_ply_file(self, filepath: str) -> PLYHeader:
        """Analyze PLY file and extract header information."""
        print(f"Analyzing PLY file: {filepath}")
        
        with open(filepath, 'rb') as f:
            header_lines = []
            header_size = 0
            
            # Read header line by line
            while True:
                line = f.readline()
                header_size += len(line)
                line_str = line.decode('ascii').strip()
                header_lines.append(line_str)
                
                if line_str == 'end_header':
                    break
            
            # Parse header
            format_type = None
            vertex_count = 0
            properties = []
            
            for line in header_lines:
                if line.startswith('format'):
                    format_type = line.split()[1]
                elif line.startswith('element vertex'):
                    vertex_count = int(line.split()[2])
                elif line.startswith('property'):
                    properties.append(line)
            
            return PLYHeader(
                format_type=format_type,
                vertex_count=vertex_count,
                properties=properties,
                header_size=header_size
            )
    
    def read_vertices_from_ply(self, filepath: str, header: PLYHeader) -> List[Vertex]:
        """Read all vertices from PLY file."""
        print(f"Reading {header.vertex_count} vertices...")
        
        vertices = []
        
        with open(filepath, 'rb') as f:
            # Skip header
            f.seek(header.header_size)
            
            if header.format_type == 'ascii':
                # Read ASCII format
                for i in range(header.vertex_count):
                    if i % 10000 == 0:
                        print(f"  Progress: {i}/{header.vertex_count} ({i/header.vertex_count*100:.1f}%)")
                    
                    line = f.readline().decode('ascii').strip()
                    values = line.split()
                    
                    # Store the entire line for reconstruction
                    vertex = Vertex(
                        x=float(values[0]),
                        y=float(values[1]),
                        z=float(values[2]),
                        r=int(values[3]) if len(values) > 3 else 255,
                        g=int(values[4]) if len(values) > 4 else 255,
                        b=int(values[5]) if len(values) > 5 else 255
                    )
                    # Store full line data for later reconstruction
                    vertex.full_data = values
                    vertices.append(vertex)
            
            elif header.format_type == 'binary_little_endian':
                # Read binary format (assuming float x,y,z + uchar r,g,b)
                for i in range(header.vertex_count):
                    if i % 10000 == 0:
                        print(f"  Progress: {i}/{header.vertex_count} ({i/header.vertex_count*100:.1f}%)")
                    
                    # Read 3 floats (x, y, z) = 12 bytes
                    x, y, z = struct.unpack('<fff', f.read(12))
                    
                    # Try to read RGB (3 bytes)
                    try:
                        r, g, b = struct.unpack('<BBB', f.read(3))
                    except:
                        r, g, b = 255, 255, 255
                    
                    vertex = Vertex(x=x, y=y, z=z, r=r, g=g, b=b)
                    vertices.append(vertex)
        
        print(f"Successfully read {len(vertices)} vertices")
        return vertices
    
    def calculate_bounding_box(self, vertices: List[Vertex]) -> Dict[str, Dict[str, float]]:
        """Calculate bounding box for a list of vertices."""
        if not vertices:
            return {"min": {"x": 0, "y": 0, "z": 0}, "max": {"x": 0, "y": 0, "z": 0}}
        
        min_x = min_y = min_z = float('inf')
        max_x = max_y = max_z = float('-inf')
        
        for vertex in vertices:
            min_x = min(min_x, vertex.x)
            min_y = min(min_y, vertex.y)
            min_z = min(min_z, vertex.z)
            max_x = max(max_x, vertex.x)
            max_y = max(max_y, vertex.y)
            max_z = max(max_z, vertex.z)
        
        return {
            "min": {"x": min_x, "y": min_y, "z": min_z},
            "max": {"x": max_x, "y": max_y, "z": max_z}
        }
    
    def chunk_vertices_radial(self, vertices: List[Vertex]) -> List[List[Vertex]]:
        """Chunk vertices using feathered probability-based loading for smooth form appearance."""
        import math
        import random
        
        # Estimate bytes per vertex 
        bytes_per_vertex = 20  # Conservative estimate including PLY overhead
        vertices_per_chunk = max(1, self.target_chunk_size_bytes // bytes_per_vertex)
        
        print(f"Target chunk size: {self.target_chunk_size_mb}MB")
        print(f"Estimated vertices per chunk: {vertices_per_chunk}")
        print(f"Using feathered probability-based chunking from origin...")
        
        # Calculate distance from origin for each vertex and find max distance
        vertex_distances = []
        max_distance = 0
        
        for i, vertex in enumerate(vertices):
            distance = math.sqrt(vertex.x * vertex.x + vertex.y * vertex.y + vertex.z * vertex.z)
            vertex_distances.append((distance, i, vertex))
            max_distance = max(max_distance, distance)
        
        print(f"Max distance from origin: {max_distance:.2f}")
        
        # Sort by distance from origin (closest first)
        vertex_distances.sort(key=lambda x: x[0])
        
        # Create feathered chunks using probability-based selection
        chunks = []
        remaining_vertices = vertex_distances.copy()
        chunk_num = 0
        
        while remaining_vertices:
            chunk_num += 1
            current_chunk = []
            vertices_to_remove = []
            
            # Calculate probability for each remaining vertex
            for i, (distance, original_index, vertex) in enumerate(remaining_vertices):
                # Probability decreases linearly from 100% at origin to 20% at max distance
                # This ensures the whole form is visible early while maintaining detail progression
                base_probability = 1.0 - (distance / max_distance * 0.8)  # 100% -> 20%
                
                # Increase probability for later chunks to ensure all vertices eventually load
                chunk_boost = min(0.3, (chunk_num - 1) * 0.1)  # Up to 30% boost for later chunks
                final_probability = min(1.0, base_probability + chunk_boost)
                
                # Special handling for final chunks to clean up remaining vertices
                if len(remaining_vertices) <= vertices_per_chunk * 1.5:
                    final_probability = 1.0  # Include everything in final chunks
                
                # Random selection based on probability
                if random.random() < final_probability:
                    current_chunk.append(vertex)
                    vertices_to_remove.append(i)
                    
                    # Stop when chunk is full
                    if len(current_chunk) >= vertices_per_chunk:
                        break
            
            # Remove selected vertices from remaining list (in reverse order to maintain indices)
            for i in reversed(vertices_to_remove):
                remaining_vertices.pop(i)
            
            # Add chunk if it has vertices
            if current_chunk:
                chunks.append(current_chunk)
                
                # Calculate distance range for this chunk
                chunk_distances = [math.sqrt(v.x**2 + v.y**2 + v.z**2) for v in current_chunk]
                min_dist = min(chunk_distances)
                max_dist = max(chunk_distances)
                avg_dist = sum(chunk_distances) / len(chunk_distances)
                
                print(f"Chunk {chunk_num}: {len(current_chunk)} vertices (distance range: {min_dist:.2f} to {max_dist:.2f}, avg: {avg_dist:.2f})")
                print(f"  Remaining vertices: {len(remaining_vertices)}")
            
            # Safety check to prevent infinite loops
            if len(vertices_to_remove) == 0 and remaining_vertices:
                print(f"Warning: No vertices selected in chunk {chunk_num}, forcing inclusion of remaining {len(remaining_vertices)} vertices")
                # Force remaining vertices into final chunk
                final_chunk = [vertex for _, _, vertex in remaining_vertices]
                if final_chunk:
                    chunks.append(final_chunk)
                    print(f"Final chunk: {len(final_chunk)} vertices (forced inclusion)")
                break
        
        print(f"Feathered chunking complete: {len(chunks)} chunks created")
        return chunks

    def chunk_vertices_sequential(self, vertices: List[Vertex]) -> List[List[Vertex]]:
        """Chunk vertices sequentially based on target chunk size."""
        # Estimate bytes per vertex (assuming float x,y,z + uchar r,g,b = 15 bytes + overhead)
        bytes_per_vertex = 20  # Conservative estimate including PLY overhead
        vertices_per_chunk = max(1, self.target_chunk_size_bytes // bytes_per_vertex)
        
        print(f"Target chunk size: {self.target_chunk_size_mb}MB")
        print(f"Estimated vertices per chunk: {vertices_per_chunk}")
        
        chunks = []
        for i in range(0, len(vertices), vertices_per_chunk):
            chunk = vertices[i:i + vertices_per_chunk]
            chunks.append(chunk)
            print(f"Chunk {len(chunks)}: {len(chunk)} vertices")
        
        return chunks
    
    def write_ply_chunk(self, vertices: List[Vertex], output_path: str, original_header: PLYHeader, overall_bbox: Dict = None) -> int:
        """Write a chunk of vertices to a PLY file with optional anchor points for consistent bounding box."""
        
        # Add invisible anchor points at overall bounding box corners if provided
        chunk_vertices = vertices.copy()
        
        if overall_bbox:
            # Add 8 anchor points at the corners of the overall bounding box
            # These will be black (invisible) and ensure consistent bounding box
            min_x, min_y, min_z = overall_bbox['min']['x'], overall_bbox['min']['y'], overall_bbox['min']['z']
            max_x, max_y, max_z = overall_bbox['max']['x'], overall_bbox['max']['y'], overall_bbox['max']['z']
            
            anchor_points = [
                Vertex(min_x, min_y, min_z, 0, 0, 0),  # min corner
                Vertex(max_x, min_y, min_z, 0, 0, 0),  # x max
                Vertex(min_x, max_y, min_z, 0, 0, 0),  # y max
                Vertex(min_x, min_y, max_z, 0, 0, 0),  # z max
                Vertex(max_x, max_y, min_z, 0, 0, 0),  # xy max
                Vertex(max_x, min_y, max_z, 0, 0, 0),  # xz max
                Vertex(min_x, max_y, max_z, 0, 0, 0),  # yz max
                Vertex(max_x, max_y, max_z, 0, 0, 0),  # max corner
            ]
            
            chunk_vertices.extend(anchor_points)
            print(f"  Added {len(anchor_points)} anchor points for consistent bounding box")
        
        # Always write binary format for better performance and smaller size
        with open(output_path, 'wb') as f:
            # Write PLY header as text
            header_text = "ply\n"
            header_text += "format binary_little_endian 1.0\n"
            header_text += f"element vertex {len(chunk_vertices)}\n"
            
            # Write only basic properties for compatibility
            header_text += "property float x\n"
            header_text += "property float y\n"
            header_text += "property float z\n"
            header_text += "property uchar red\n"
            header_text += "property uchar green\n"
            header_text += "property uchar blue\n"
            
            header_text += "end_header\n"
            
            # Write header as bytes
            f.write(header_text.encode('ascii'))
            
            # Write vertex data in binary format
            for vertex in chunk_vertices:
                # Pack as little endian: 3 floats (x,y,z) + 3 unsigned chars (r,g,b)
                vertex_data = struct.pack('<fffBBB', 
                    vertex.x, vertex.y, vertex.z,
                    vertex.r, vertex.g, vertex.b)
                f.write(vertex_data)
        
        # Return file size
        return os.path.getsize(output_path)
    
    def chunk_ply_file(self, input_path: str, output_dir: str) -> Dict:
        """
        Chunk a PLY file into smaller pieces.
        
        Returns:
            Dictionary with chunking results and manifest data
        """
        # Create model-specific subdirectory
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        model_output_dir = os.path.join(output_dir, base_name)
        os.makedirs(model_output_dir, exist_ok=True)
        
        print(f"Creating chunks in: {model_output_dir}")
        
        # Analyze input file
        header = self.analyze_ply_file(input_path)
        print(f"File format: {header.format_type}")
        print(f"Vertex count: {header.vertex_count}")
        
        # Read all vertices
        vertices = self.read_vertices_from_ply(input_path, header)
        
        # Calculate overall bounding box before scaling
        original_bbox = self.calculate_bounding_box(vertices)
        print(f"Original bounding box: {original_bbox}")
        
        # Calculate auto-scaling factor (same logic as Three.js)
        min_coords = original_bbox['min']
        max_coords = original_bbox['max']
        size_x = max_coords['x'] - min_coords['x']
        size_y = max_coords['y'] - min_coords['y'] 
        size_z = max_coords['z'] - min_coords['z']
        max_dimension = max(size_x, size_y, size_z)
        
        scale_factor = 1.0
        if max_dimension > 50:
            scale_factor = 20.0 / max_dimension
            print(f"Model will be scaled by factor: {scale_factor:.4f}")
            print(f"Max dimension: {max_dimension:.2f} -> {max_dimension * scale_factor:.2f}")
            
            # Apply scaling to all vertices
            for vertex in vertices:
                vertex.x *= scale_factor
                vertex.y *= scale_factor
                vertex.z *= scale_factor
            
            print(f"Applied scaling to {len(vertices)} vertices")
        else:
            print("No scaling needed (max dimension <= 50)")
        
        # Calculate scaled bounding box
        overall_bbox = self.calculate_bounding_box(vertices)
        print(f"Scaled bounding box: {overall_bbox}")
        
        # Chunk vertices using radial pattern
        vertex_chunks = self.chunk_vertices_radial(vertices)
        
        # Write chunks and collect metadata
        chunk_infos = []
        
        for i, chunk_vertices in enumerate(vertex_chunks):
            chunk_filename = f"{base_name}_chunk_{i:03d}.ply"
            chunk_path = os.path.join(model_output_dir, chunk_filename)
            
            print(f"Writing chunk {i+1}/{len(vertex_chunks)}: {chunk_filename}")
            file_size = self.write_ply_chunk(chunk_vertices, chunk_path, header, overall_bbox)
            
            chunk_bbox = self.calculate_bounding_box(chunk_vertices)
            
            chunk_info = ChunkInfo(
                filename=chunk_filename,
                vertex_count=len(chunk_vertices),
                bounding_box=chunk_bbox,
                priority=i,  # Sequential priority for now
                file_size=file_size
            )
            chunk_infos.append(chunk_info)
            
            print(f"  Vertices: {len(chunk_vertices)}, Size: {file_size/1024/1024:.2f}MB")
        
        # Create manifest
        manifest = {
            "original_file": os.path.basename(input_path),
            "total_vertices": len(vertices),
            "chunk_count": len(chunk_infos),
            "overall_bounding_box": overall_bbox,
            "target_chunk_size_mb": self.target_chunk_size_mb,
            "chunks": [
                {
                    "filename": chunk.filename,
                    "vertex_count": chunk.vertex_count,
                    "bounding_box": chunk.bounding_box,
                    "priority": chunk.priority,
                    "file_size_bytes": chunk.file_size
                }
                for chunk in chunk_infos
            ]
        }
        
        # Write manifest file
        manifest_path = os.path.join(model_output_dir, f"{base_name}_manifest.json")
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        
        print(f"\nChunking complete!")
        print(f"Generated {len(chunk_infos)} chunks")
        print(f"Manifest written to: {manifest_path}")
        
        return manifest

def auto_chunk_pointcloud_models():
    """Automatically chunk all pointcloud models that don't have chunks yet."""
    # Define paths
    pointcloud_dir = "public/models/base/pointcloud"
    chunks_dir = "public/models/chunks"
    chunk_size_mb = 0.2
    
    if not os.path.exists(pointcloud_dir):
        print(f"Error: Pointcloud directory '{pointcloud_dir}' not found")
        return
    
    # Create chunks directory if it doesn't exist
    os.makedirs(chunks_dir, exist_ok=True)
    
    # Get all PLY files in pointcloud directory
    ply_files = [f for f in os.listdir(pointcloud_dir) if f.endswith('.ply')]
    
    if not ply_files:
        print("No PLY files found in pointcloud directory")
        return
    
    print(f"Found {len(ply_files)} PLY files in pointcloud directory")
    
    chunker = PLYChunker(target_chunk_size_mb=chunk_size_mb)
    processed_count = 0
    
    for ply_file in ply_files:
        base_name = os.path.splitext(ply_file)[0]
        chunk_dir = os.path.join(chunks_dir, base_name)
        manifest_file = os.path.join(chunk_dir, f"{base_name}_manifest.json")
        
        # Check if chunks already exist
        if os.path.exists(manifest_file):
            print(f"✓ Chunks already exist for {ply_file}")
            continue
        
        print(f"\n📦 Processing {ply_file}...")
        input_path = os.path.join(pointcloud_dir, ply_file)
        
        try:
            manifest = chunker.chunk_ply_file(input_path, chunks_dir)
            print(f"✅ Successfully chunked {ply_file} into {manifest['chunk_count']} chunks")
            processed_count += 1
        except Exception as e:
            print(f"❌ Error processing {ply_file}: {str(e)}")
    
    print(f"\n🎉 Processing complete!")
    print(f"Processed {processed_count} new models")
    print(f"Total PLY files: {len(ply_files)}")

def main():
    # Check if running in auto mode (no arguments) or manual mode
    if len(sys.argv) == 1:
        # Auto mode - chunk all pointcloud models that need chunking
        auto_chunk_pointcloud_models()
    elif len(sys.argv) >= 3:
        # Manual mode - original functionality
        input_file = sys.argv[1]
        output_dir = sys.argv[2]
        chunk_size_mb = float(sys.argv[3]) if len(sys.argv) > 3 else 0.2
        
        if not os.path.exists(input_file):
            print(f"Error: Input file '{input_file}' not found")
            sys.exit(1)
        
        chunker = PLYChunker(target_chunk_size_mb=chunk_size_mb)
        manifest = chunker.chunk_ply_file(input_file, output_dir)
        
        print(f"\nSummary:")
        print(f"Original file: {input_file}")
        print(f"Total vertices: {manifest['total_vertices']}")
        print(f"Generated chunks: {manifest['chunk_count']}")
        print(f"Output directory: {output_dir}")
    else:
        print("Usage:")
        print("  Auto mode: python ply_chunker.py")
        print("  Manual mode: python ply_chunker.py <input_ply_file> <output_directory> [chunk_size_mb]")
        print("Examples:")
        print("  python ply_chunker.py")
        print("  python ply_chunker.py Castleton_001.ply ./chunks 0.2")
        sys.exit(1)

if __name__ == "__main__":
    main()
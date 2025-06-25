# Scene Gallery Directory

This directory contains PNG files with embedded scene metadata for the gallery system.

## File Format

All PNG files in this directory should contain embedded scene metadata using PNG text chunks. The metadata includes:

- Complete scene state (camera position, effects, settings)
- Model information
- Timestamp and version data

## Manifest File

The `manifest.json` file lists all available gallery files. This is automatically generated but can be manually updated if needed.

## Adding New Scenes

1. **Via Application**: Use the camera capture button in the app to automatically save scenes with metadata
2. **Manual Upload**: Drag and drop scene PNG files into the application
3. **Direct Copy**: Copy PNG files to this directory and update the manifest.json

## File Naming Convention

- Auto-generated: `scene_[timestamp]_[model].png`
- Custom names: Any valid filename ending in `.png`

## Metadata Structure

Each PNG contains JSON metadata in text chunks with keys:
- `SceneState`: Complete scene configuration
- `SceneVersion`: Format version for compatibility
# Tools Directory

This directory contains utility scripts for maintaining the gallery system.

## Gallery Manifest Updater

`update_gallery_manifest.py` - Automatically updates the gallery manifest file.

### Usage

```bash
cd tools
python update_gallery_manifest.py
```

### What it does

1. **Scans** the `public/gallery/` directory for all PNG files
2. **Adds** any new PNG files to the manifest's `files` array
3. **Removes** any files from the manifest that no longer exist in the directory
4. **Cleans** the `randomCandidates` array by removing files that no longer exist
   - ⚠️ **Note**: New files are NOT automatically added to `randomCandidates` - this must be done manually
5. **Updates** the `generated` timestamp

### Example Output

```
🔄 Gallery Manifest Updater
========================================
📁 Scanning gallery directory: ../public/gallery
📷 Found 17 PNG files in gallery:
   • Arscii.png
   • Castleton Basic.png
   • ...

➕ Files to add (5):
   • Dazzle from Luke.png
   • Scene from Luke.png
   • ...

✅ Manifest updated successfully!
📊 Final counts:
   • Total files: 17
   • Random candidates: 7
```

### Requirements

- Python 3.6+
- Must be run from the `tools/` directory
- No additional dependencies required

## Other Tools

- `ply_chunker.py` - Splits large PLY point cloud files into smaller chunks for progressive loading
#!/usr/bin/env python3
"""
Gallery Manifest Updater

This script updates the gallery manifest.json file by:
1. Adding any PNG files found in the gallery directory that aren't in the manifest
2. Removing any files from the manifest that no longer exist in the gallery directory
3. Cleaning up randomCandidates by removing any that no longer exist (but not adding new ones)

Usage:
    cd tools
    python update_gallery_manifest.py
"""

import os
import json
from datetime import datetime
import sys

def get_gallery_path():
    """Get the path to the gallery directory relative to the tools folder."""
    # From tools/ directory, go up one level and into public/gallery/
    return os.path.join('..', 'public', 'gallery')

def get_png_files_in_gallery(gallery_path):
    """Get all PNG files in the gallery directory."""
    png_files = []
    
    if not os.path.exists(gallery_path):
        print(f"❌ Gallery directory not found: {gallery_path}")
        return png_files
    
    for filename in os.listdir(gallery_path):
        if filename.lower().endswith('.png'):
            png_files.append(filename)
    
    return sorted(png_files)

def load_manifest(manifest_path):
    """Load the existing manifest file."""
    if not os.path.exists(manifest_path):
        print(f"❌ Manifest file not found: {manifest_path}")
        return None
    
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        print(f"❌ Error parsing manifest JSON: {e}")
        return None
    except Exception as e:
        print(f"❌ Error reading manifest file: {e}")
        return None

def save_manifest(manifest_path, manifest_data):
    """Save the updated manifest file."""
    try:
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest_data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"❌ Error saving manifest file: {e}")
        return False

def update_manifest():
    """Main function to update the gallery manifest."""
    print("🔄 Gallery Manifest Updater")
    print("=" * 40)
    
    # Get paths
    gallery_path = get_gallery_path()
    manifest_path = os.path.join(gallery_path, 'manifest.json')
    
    # Check if we're in the right directory
    if not os.path.exists('../public'):
        print("❌ Error: This script should be run from the tools/ directory")
        print("   Please run: cd tools && python update_gallery_manifest.py")
        sys.exit(1)
    
    # Get actual PNG files in gallery
    print(f"📁 Scanning gallery directory: {gallery_path}")
    actual_png_files = get_png_files_in_gallery(gallery_path)
    
    if not actual_png_files:
        print("⚠️  No PNG files found in gallery directory")
        return
    
    print(f"📷 Found {len(actual_png_files)} PNG files in gallery:")
    for filename in actual_png_files:
        print(f"   • {filename}")
    
    # Load existing manifest
    print(f"\n📋 Loading manifest: {manifest_path}")
    manifest = load_manifest(manifest_path)
    
    if manifest is None:
        print("⚠️  Creating new manifest from scratch")
        manifest = {
            "version": "1.1",
            "generated": "",
            "files": [],
            "randomCandidates": []
        }
    
    # Get current files list
    current_files = set(manifest.get('files', []))
    current_random_candidates = set(manifest.get('randomCandidates', []))
    actual_files = set(actual_png_files)
    
    # Calculate changes needed
    files_to_add = actual_files - current_files
    files_to_remove = current_files - actual_files
    
    # Update files list
    print(f"\n🔍 Analyzing changes:")
    
    if files_to_add:
        print(f"➕ Files to add ({len(files_to_add)}):")
        for filename in sorted(files_to_add):
            print(f"   • {filename}")
        manifest['files'] = sorted(actual_files)
    else:
        print("✅ No files to add")
    
    if files_to_remove:
        print(f"➖ Files to remove ({len(files_to_remove)}):")
        for filename in sorted(files_to_remove):
            print(f"   • {filename}")
        manifest['files'] = sorted(actual_files)
    else:
        print("✅ No files to remove")
    
    # Clean up randomCandidates (only remove missing files, don't add new ones)
    random_candidates_to_remove = current_random_candidates - actual_files
    
    if random_candidates_to_remove:
        print(f"\n🎲 Cleaning randomCandidates ({len(random_candidates_to_remove)} to remove):")
        for filename in sorted(random_candidates_to_remove):
            print(f"   • {filename}")
        
        # Keep only candidates that still exist
        updated_random_candidates = current_random_candidates & actual_files
        manifest['randomCandidates'] = sorted(updated_random_candidates)
    else:
        print("\n🎲 randomCandidates are clean (no missing files)")
        # Ensure randomCandidates are sorted
        manifest['randomCandidates'] = sorted(current_random_candidates)
    
    # Update metadata
    manifest['generated'] = datetime.now().isoformat() + 'Z'
    
    # Check if any changes were made
    changes_made = bool(files_to_add or files_to_remove or random_candidates_to_remove)
    
    if not changes_made:
        print("\n✅ No changes needed - manifest is up to date!")
        return
    
    # Save updated manifest
    print(f"\n💾 Saving updated manifest...")
    if save_manifest(manifest_path, manifest):
        print("✅ Manifest updated successfully!")
        print(f"\n📊 Final counts:")
        print(f"   • Total files: {len(manifest['files'])}")
        print(f"   • Random candidates: {len(manifest['randomCandidates'])}")
    else:
        print("❌ Failed to save manifest")
        sys.exit(1)

if __name__ == "__main__":
    try:
        update_manifest()
    except KeyboardInterrupt:
        print("\n\n⚠️  Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)
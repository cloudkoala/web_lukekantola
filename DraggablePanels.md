# Draggable Panels System

A comprehensive guide to the draggable panel system implementation in the Gaussian Splat Showcase application.

## Overview

The application features a sophisticated draggable panel system that provides users with complete control over their workspace layout. The system includes two main panels: a grid-based Settings Panel and a resizable Effects Panel with scrollable content.

## Architecture

### Core Components

1. **Settings Panel** (`#settings-panel`)
   - Grid-based layout (2 rows × 3 columns)
   - Fixed dimensions with drag-only repositioning
   - Global application settings

2. **Effects Panel** (`#effects-panel`)
   - Resizable panel with drag handles
   - Scrollable content area with fixed header/footer
   - Effects chain management

### Technical Implementation

#### Drag System Architecture

```typescript
function setupPanelDrag(panel: HTMLElement) {
  let isDragging = false
  let dragOffset = { x: 0, y: 0 }
  
  const dragHandle = panel.querySelector('.drag-handle') as HTMLElement
  
  const onMouseDown = (e: MouseEvent) => {
    // Exclude close buttons from drag
    if (e.target.closest('.settings-close-button')) return
    
    isDragging = true
    const rect = panel.getBoundingClientRect()
    dragOffset.x = e.clientX - rect.left
    dragOffset.y = e.clientY - rect.top
    
    // Critical: Override CSS positioning with !important
    panel.style.setProperty('transform', 'none', 'important')
    panel.style.setProperty('left', `${rect.left}px`, 'important')
    panel.style.setProperty('top', `${rect.top}px`, 'important')
    panel.style.setProperty('bottom', 'auto', 'important')
  }
  
  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return
    
    const newX = e.clientX - dragOffset.x
    const newY = e.clientY - dragOffset.y
    
    // Viewport boundary clamping
    const maxX = window.innerWidth - panel.offsetWidth
    const maxY = window.innerHeight - panel.offsetHeight
    
    const clampedX = Math.max(0, Math.min(newX, maxX))
    const clampedY = Math.max(0, Math.min(newY, maxY))
    
    panel.style.setProperty('left', `${clampedX}px`, 'important')
    panel.style.setProperty('top', `${clampedY}px`, 'important')
  }
}
```

#### Resize System (Effects Panel)

```typescript
function setupPanelResize(panel: HTMLElement) {
  const resizeHandle = panel.querySelector('.effects-resize-handle') as HTMLElement
  
  let isResizing = false
  let startX = 0, startY = 0, startWidth = 0, startHeight = 0
  
  const onResizeMouseDown = (e: MouseEvent) => {
    isResizing = true
    startX = e.clientX
    startY = e.clientY
    
    const rect = panel.getBoundingClientRect()
    startWidth = rect.width
    startHeight = rect.height
    
    e.preventDefault()
    e.stopPropagation()
  }
  
  const onResizeMouseMove = (e: MouseEvent) => {
    if (!isResizing) return
    
    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY
    
    // Apply size constraints
    const newWidth = Math.max(280, Math.min(600, startWidth + deltaX))
    const newHeight = Math.max(200, Math.min(window.innerHeight * 0.8, startHeight + deltaY))
    
    panel.style.setProperty('width', `${newWidth}px`, 'important')
    panel.style.setProperty('height', `${newHeight}px`, 'important')
  }
}
```

## Settings Panel

### Layout Structure

The Settings Panel uses a CSS Grid layout to organize controls into a 2×3 matrix:

```css
.settings-panel {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: auto auto auto; /* Drag handle + 2 content rows */
  width: 750px; /* Fixed width prevents text wrapping */
  height: auto;
}
```

### Grid Contents

| Position | Control | Function |
|----------|---------|----------|
| **Row 1, Col 1** | Point Size Slider | Adjusts individual point rendering size |
| **Row 1, Col 2** | Sphere Radius Slider | Controls sphere mode radius (conditional) |
| **Row 1, Col 3** | Focal Length Slider | Camera field of view control |
| **Row 2, Col 1** | Fog Density Slider | Atmospheric depth effect |
| **Row 2, Col 2** | Sphere Mode Toggle | Switches rendering modes |
| **Row 2, Col 3** | Background Color Picker | HSV color selection |
| **Row 3** | Auto-Rotation Speed | Bidirectional speed control (spans full width) |

### Default Positioning

```css
.desktop-only .settings-panel {
  position: fixed !important;
  left: 50% !important;
  bottom: 40px !important;
  transform: translateX(-50%) !important; /* Centered horizontally */
}
```

## Effects Panel

### Panel Structure

```
┌─────────────────────────────────┐
│ [:::] Effects              [×] │ ← Drag Handle (20px height)
├─────────────────────────────────┤
│ Effect: [Dropdown] ▼           │ ← Header Controls
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ [Effect Card 1]             │ │
│ │ [Effect Card 2]             │ │ ← Scrollable Content Area
│ │ [Effect Parameters]         │ │   (flex: 1, overflow-y: auto)
│ │         ...                 │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ [+ Add Effect] [× Reset All]   │ ← Fixed Footer (flex-shrink: 0)
└─────────────────────────────────┘
```

### Resize Constraints

- **Minimum Size**: 280px × 200px (ensures usability)
- **Maximum Width**: 600px (prevents overwhelming the interface)
- **Maximum Height**: 80% of viewport height (maintains visibility)
- **Resize Handle**: 16px × 16px triangular grip in bottom-right corner

### Default Positioning

```css
.desktop-only .effects-panel {
  position: fixed !important;
  left: 12px !important;
  top: 150px !important; /* Below model dropdown */
  width: 360px;
  height: 400px;
}
```

### Scrollable Content Implementation

```css
.effects-panel-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* Essential for inner scrolling */
  padding: 15px;
  padding-bottom: 0; /* Space for resize handle */
}

.effects-panel-content {
  flex: 1; /* Takes remaining space */
  overflow-y: auto; /* Enables scrolling */
  overflow-x: hidden;
  padding-bottom: 8px;
}

.effects-panel-footer {
  flex-shrink: 0; /* Never shrinks - always visible */
  padding: 8px 15px;
  border-top: 1px solid rgba(0, 255, 0, 0.2);
  background: rgba(0, 0, 0, 0.3);
}
```

## CSS Architecture

### Critical Override Pattern

The drag system requires overriding CSS positioning with `!important` declarations:

```css
/* Base positioning (overridden during drag) */
.desktop-only .effects-panel {
  position: fixed !important;
  left: 12px !important;
  top: 150px !important;
  transform: none !important; /* Critical for drag positioning */
}

/* During drag operations */
panel.style.setProperty('left', `${newX}px`, 'important')
panel.style.setProperty('top', `${newY}px`, 'important')
panel.style.setProperty('transform', 'none', 'important')
```

### Drag Handle Styling

```css
.settings-drag-handle,
.effects-drag-handle {
  grid-column: 1 / -1; /* Span all columns */
  grid-row: 1; /* First row */
  height: 20px; /* Exactly 20px */
  background: rgba(0, 255, 0, 0.1);
  border-bottom: 1px solid rgba(0, 255, 0, 0.2);
  border-radius: 6px 6px 0 0;
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.drag-dots {
  display: flex;
  gap: 1px;
  align-items: center;
}

.drag-dot {
  width: 2px;
  height: 2px;
  background: rgba(0, 255, 0, 0.6);
  border-radius: 50%;
}
```

### Resize Handle Styling

```css
.effects-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: nw-resize;
  background: rgba(0, 255, 0, 0.1);
  border-radius: 0 0 6px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.resize-grip {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-bottom: 6px solid rgba(0, 255, 0, 0.6);
  transform: rotate(45deg);
}
```

## Footer Controls Integration

### Add Effect Button

The footer Add Effect button integrates with the existing effects system:

```typescript
function setupEffectsPanelFooter() {
  const addEffectButton = document.getElementById('desktop-add-effect-button')
  
  addEffectButton.addEventListener('click', () => {
    const effectsPanel = orbitalCamera.getEffectsPanel()
    if (effectsPanel) {
      // Check if modal is already open
      const modal = document.querySelector('.add-effect-dropdown') as HTMLElement
      if (modal?.style.display === 'flex') {
        // Close the modal
        effectsPanel.hideAddEffectModal()
      } else {
        // Open the modal
        effectsPanel.showAddEffectModal()
      }
    }
  })
}
```

### Reset All Button

```typescript
const resetEffectsButton = document.getElementById('desktop-reset-effects-button')

resetEffectsButton.addEventListener('click', () => {
  if (window.effectsChainManager) {
    window.effectsChainManager.clearEffects()
    
    // Update dropdown to reflect cleared state
    const effectsDropdown = document.getElementById('effects-main-dropdown') as HTMLSelectElement
    if (effectsDropdown) {
      effectsDropdown.value = 'none'
    }
  }
})
```

## Key Implementation Challenges Solved

### 1. CSS Transform Conflicts

**Problem**: CSS `transform: translateX(-50%)` with `!important` prevented drag positioning.

**Solution**: Override transforms during drag operations:
```typescript
panel.style.setProperty('transform', 'none', 'important')
panel.style.setProperty('left', `${rect.left}px`, 'important')
```

### 2. Event Delegation

**Problem**: Close buttons were triggering drag operations.

**Solution**: Exclude specific elements from drag detection:
```typescript
const target = e.target as HTMLElement
if (target.closest('.settings-close-button')) return
```

### 3. Viewport Boundary Management

**Problem**: Panels could be dragged off-screen.

**Solution**: Clamp positions to viewport boundaries:
```typescript
const maxX = window.innerWidth - panel.offsetWidth
const maxY = window.innerHeight - panel.offsetHeight
const clampedX = Math.max(0, Math.min(newX, maxX))
const clampedY = Math.max(0, Math.min(newY, maxY))
```

### 4. Scroll Area Implementation

**Problem**: Creating scrollable content within resizable panels.

**Solution**: Proper flex layout with overflow control:
```css
.effects-panel-content {
  flex: 1; /* Takes remaining space after header/footer */
  overflow-y: auto; /* Enables scrolling */
  overflow-x: hidden; /* Prevents horizontal scroll */
}
```

## User Experience Design

### Visual Feedback

1. **Cursor States**:
   - `grab` cursor on drag handles
   - `grabbing` cursor during drag operations
   - `nw-resize` cursor on resize handle

2. **Hover Effects**:
   - Drag handles lighten on hover
   - Resize handle changes background color
   - Footer buttons show hover states

3. **Visual Hierarchy**:
   - Fixed header with collapse controls
   - Scrollable middle section for content
   - Always-visible footer for core actions

### Workflow Optimization

1. **Effects Panel**: Positioned near model controls for immediate access
2. **Settings Panel**: Centered at bottom for non-intrusive global controls  
3. **Resize Capability**: Users can optimize panel size for their content
4. **Fixed Footer**: Core actions remain accessible during long effect chains

## Critical Discovery: Effects Preset Requirement

**Important**: The effects preset dropdown is essential for effects to display properly in the chain. Without selecting a preset first, effects remain invisible even when added to the chain manager. This is a key requirement for proper effects system operation.

## Development Guidelines

### Adding New Draggable Panels

1. **HTML Structure**:
   ```html
   <div id="new-panel" class="draggable-panel">
     <div class="panel-drag-handle" id="new-panel-drag-handle">
       <div class="drag-content">
         <div class="drag-dots">
           <div class="drag-dot"></div>
           <!-- Repeat 6 times -->
         </div>
         <span class="drag-label">Panel Name</span>
       </div>
       <button class="settings-close-button">×</button>
     </div>
     <!-- Panel content -->
   </div>
   ```

2. **Setup Function**:
   ```typescript
   function setupNewPanelDrag(panel: HTMLElement) {
     // Copy drag implementation from existing panels
     // Customize positioning and constraints as needed
   }
   ```

3. **CSS Positioning**:
   ```css
   .desktop-only .new-panel {
     position: fixed !important;
     left: /* desired position */ !important;
     top: /* desired position */ !important;
     transform: none !important;
   }
   ```

### Testing Checklist

- [ ] Panel drags smoothly without jumping
- [ ] Panel stays within viewport boundaries
- [ ] Close button doesn't trigger drag
- [ ] Resize handles work correctly (if applicable)
- [ ] Content scrolls properly (if applicable)
- [ ] Footer controls remain accessible
- [ ] Hover states provide clear feedback
- [ ] Panel positioning persists across interactions

## Performance Considerations

1. **Event Delegation**: Global mouse move/up listeners are efficient
2. **Transform Optimization**: Use CSS transforms when possible, absolute positioning only during drag
3. **Boundary Calculations**: Cache viewport dimensions for repeated calculations
4. **Debouncing**: Consider debouncing resize operations for complex content

This draggable panels system provides a foundation for creating flexible, user-controlled interfaces while maintaining performance and visual consistency with the application's terminal aesthetic.
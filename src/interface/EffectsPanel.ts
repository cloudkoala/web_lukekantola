import { EffectsChainManager, EFFECT_DEFINITIONS } from '../effects/EffectsChainManager'
import type { EffectInstance } from '../effects/EffectsChainManager'
import type { EffectType } from '../effects/PostProcessingPass'

// Helper function to convert RGB color string to hex
function rgbToHex(rgbString: string): string {
  const rgb = rgbString.match(/\d+/g)
  if (!rgb) return '#000000'
  const r = parseInt(rgb[0])
  const g = parseInt(rgb[1])
  const b = parseInt(rgb[2])
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

export class EffectsPanel {
  private chainManager: EffectsChainManager
  private panelElement: HTMLElement
  private chainContainer: HTMLElement
  private parametersContainer: HTMLElement
  private draggedElement: HTMLElement | null = null
  private draggedIndex: number = -1
  private addEffectModal: HTMLElement | null = null
  private collapseArrow: HTMLElement
  private panelCollapsible: HTMLElement
  private mainDropdown: HTMLSelectElement
  private savePresetButton: HTMLElement
  private isCollapsed: boolean = false
  private expandedEffects: Set<string> = new Set() // Track which effects have expanded parameters
  
  // Mobile elements
  private mobileChainContainer: HTMLElement | null = null
  private mobileParametersContainer: HTMLElement | null = null
  private mobileMainDropdown: HTMLSelectElement | null = null
  private mobileSavePresetButton: HTMLElement | null = null

  constructor(chainManager: EffectsChainManager) {
    this.chainManager = chainManager
    
    // Get desktop DOM elements
    this.panelElement = document.getElementById('effects-panel') as HTMLElement
    this.chainContainer = document.getElementById('effects-chain') as HTMLElement
    this.parametersContainer = document.getElementById('effect-parameters') as HTMLElement
    this.collapseArrow = document.getElementById('effects-panel-collapse') as HTMLElement
    this.panelCollapsible = document.getElementById('effects-panel-collapsible') as HTMLElement
    this.mainDropdown = document.getElementById('effects-main-dropdown') as HTMLSelectElement
    this.savePresetButton = document.getElementById('save-preset') as HTMLElement

    // Removed debug logging

    // Get mobile DOM elements (optional - may not exist on all pages)
    this.mobileChainContainer = document.getElementById('mobile-effects-chain')
    this.mobileParametersContainer = document.getElementById('mobile-effect-parameters')
    this.mobileMainDropdown = document.getElementById('mobile-effects-main-dropdown') as HTMLSelectElement
    this.mobileSavePresetButton = document.getElementById('mobile-save-preset')

    if (!this.panelElement || !this.chainContainer || !this.parametersContainer) {
      const missing = []
      if (!this.panelElement) missing.push('effects-panel')
      if (!this.chainContainer) missing.push('effects-chain')
      if (!this.parametersContainer) missing.push('effect-parameters')
      throw new Error(`Required effects panel DOM elements not found: ${missing.join(', ')}`)
    }

    this.setupEventListeners()
    this.setupCollapseToggle()
    this.setupMainDropdown()
    this.createAddEffectModal()
    this.updateChainDisplay()
    this.updateParametersDisplay()
    
    // Initialize collapsed state
    this.initializeCollapsedState()
    
    // Load default preset immediately - all connections should be established
    this.loadDefaultPreset()
  }

  private setupEventListeners(): void {
    // Chain updates - debounced to handle bulk operations during scene loading
    let updateTimeout: number | null = null
    this.chainManager.onChainUpdated(() => {
      // Clear any pending update
      if (updateTimeout) {
        clearTimeout(updateTimeout)
      }
      
      // Schedule update after a brief delay to batch rapid changes
      updateTimeout = setTimeout(() => {
        this.updateChainDisplay()
        updateTimeout = null
      }, 100)
    })

    // Effect selection
    this.chainManager.onEffectSelected((effectId) => {
      this.updateParametersDisplay()
      this.updateSelectionHighlight(effectId)
    })
  }

  private setupCollapseToggle(): void {
    // Desktop collapse toggle
    this.collapseArrow.addEventListener('click', () => {
      this.toggleCollapse()
    })
    
    // Also make the "Effect:" label clickable to toggle
    const effectLabel = this.panelElement.querySelector('.effects-panel-title-row label') as HTMLElement
    if (effectLabel) {
      effectLabel.style.cursor = 'pointer'
      effectLabel.addEventListener('click', () => {
        this.toggleCollapse()
      })
    }
    
    // Mobile doesn't have collapse functionality - always expanded
  }

  private initializeCollapsedState(): void {
    // Wrap arrow content in span for rotation
    this.collapseArrow.innerHTML = '<span>▼</span>'
    
    // Desktop starts collapsed, mobile is always expanded
    if (this.isCollapsed) {
      this.panelCollapsible.classList.add('collapsed')
      this.panelElement.classList.add('collapsed')
      this.collapseArrow.classList.add('collapsed')
    }
    
    // Mobile elements don't have collapsed state - always visible
  }

  private toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed
    
    // Only toggle desktop elements - mobile is always expanded
    if (this.isCollapsed) {
      this.panelCollapsible.classList.add('collapsed')
      this.panelElement.classList.add('collapsed')
      this.collapseArrow.classList.add('collapsed')
    } else {
      this.panelCollapsible.classList.remove('collapsed')
      this.panelElement.classList.remove('collapsed')
      this.collapseArrow.classList.remove('collapsed')
    }
  }

  private ensureExpanded(): void {
    if (this.isCollapsed) {
      this.toggleCollapse()
    }
  }

  private setupMainDropdown(): void {
    // Initialize dropdown with presets
    this.loadPresetsIntoDropdown()
    
    // Set up desktop dropdown change handler
    this.mainDropdown.addEventListener('change', () => {
      const value = this.mainDropdown.value
      this.handleDropdownChange(value)
      // Sync mobile dropdown
      if (this.mobileMainDropdown) {
        this.mobileMainDropdown.value = value
      }
    })
    
    // Set up mobile dropdown change handler
    if (this.mobileMainDropdown) {
      this.mobileMainDropdown.addEventListener('change', () => {
        const value = this.mobileMainDropdown!.value
        this.handleDropdownChange(value)
        // Sync desktop dropdown
        this.mainDropdown.value = value
      })
    }
    
    // Set up desktop save preset button
    this.savePresetButton.addEventListener('click', () => {
      this.showSavePresetDialog()
    })
    
    // Set up mobile save preset button
    if (this.mobileSavePresetButton) {
      this.mobileSavePresetButton.addEventListener('click', () => {
        this.showSavePresetDialog()
      })
    }
  }
  
  private handleDropdownChange(value: string): void {
    if (value === 'none') {
      // Clear all effects and disable effects pipeline
      this.chainManager.clearEffects()
      this.updateEffectsEnabled(false)
    } else if (value === 'custom') {
      // User selected custom - just enable effects, keep current chain
      this.updateEffectsEnabled(true)
    } else if (value.startsWith('effect:')) {
      // User selected an individual effect - add to existing chain
      const effectType = value.replace('effect:', '') as EffectType
      this.chainManager.addEffect(effectType)
      this.refreshChain()
      this.updateEffectsEnabled(true)
      
      // Switch dropdown to "Custom" since they now have a custom chain
      this.mainDropdown.value = 'custom'
      
      // Expand the panel so users can see and edit the effect
      this.ensureExpanded()
    } else {
      // Load a preset - clear expanded effects so they start collapsed
      this.expandedEffects.clear()
      this.loadPreset(value)
      this.updateEffectsEnabled(true)
      
      // Expand the panel so users can see the loaded effects
      this.ensureExpanded()
    }
  }
  
  private updateEffectsEnabled(enabled: boolean): void {
    // Update the PostProcessingPass enabled state
    const postProcessingPass = (window as any).postProcessingPass
    if (postProcessingPass) {
      postProcessingPass.enabled = enabled
      console.log('Effects pipeline', enabled ? 'enabled' : 'disabled')
    }
  }

  private loadPresetsIntoDropdown(): void {
    const presets = this.getSavedPresets()
    
    // Helper function to populate a dropdown
    const populateDropdown = (dropdown: HTMLSelectElement) => {
      // Clear existing options except "None"
      while (dropdown.children.length > 1) {
        dropdown.removeChild(dropdown.lastChild!)
      }
      
      // Add "Custom" option first
      const customOption = document.createElement('option')
      customOption.value = 'custom'
      customOption.textContent = 'Custom'
      dropdown.appendChild(customOption)
      
      // Create presets section
      if (Object.keys(presets).length > 0) {
        const presetsGroup = document.createElement('optgroup')
        presetsGroup.label = '── Presets ──'
        
        Object.keys(presets).forEach(name => {
          const option = document.createElement('option')
          option.value = name
          option.textContent = `📋 ${name}`
          presetsGroup.appendChild(option)
        })
        
        dropdown.appendChild(presetsGroup)
      }
      
      // Create effects section
      const effectsGroup = document.createElement('optgroup')
      effectsGroup.label = '── Effects ──'
      
      // Add individual effects
      EFFECT_DEFINITIONS.forEach(definition => {
        const option = document.createElement('option')
        option.value = `effect:${definition.type}`
        option.textContent = `⚡ ${definition.name}`
        effectsGroup.appendChild(option)
      })
      
      dropdown.appendChild(effectsGroup)
    }
    
    // Populate desktop dropdown
    populateDropdown(this.mainDropdown)
    
    // Populate mobile dropdown if it exists
    if (this.mobileMainDropdown) {
      populateDropdown(this.mobileMainDropdown)
    }
  }
  

  private getDefaultPresets(): Record<string, EffectInstance[]> {
    return {
      "Cheeky Castleton": [
        {
          id: "effect_2",
          type: "sepia",
          enabled: true,
          parameters: {
            intensity: 0.48
          }
        },
        {
          id: "effect_4",
          type: "crtgrain",
          enabled: true,
          parameters: {
            intensity: 0.14,
            noiseSeed: 0.35
          }
        },
        {
          id: "effect_7",
          type: "halftone",
          enabled: true,
          parameters: {
            intensity: 1,
            dotSize: 13,
            contrast: 2
          }
        },
        {
          id: "effect_6",
          type: "blur",
          enabled: true,
          parameters: {
            intensity: 0.49,
            blurAmount: 0.0005
          }
        },
        {
          id: "effect_8",
          type: "gamma",
          enabled: true,
          parameters: {
            gamma: 2.3,
            brightness: 1,
            contrast: 1.8,
            saturation: 1.8
          }
        },
        {
          id: "effect_5",
          type: "sobelthreshold",
          enabled: true,
          parameters: {
            intensity: 0.25,
            threshold: 0.87
          }
        },
        {
          id: "effect_3",
          type: "vignette",
          enabled: true,
          parameters: {
            intensity: 0.72,
            offset: 1.65,
            feather: 1.3
          }
        }
      ],
      "Fisher Two-Tone": [
        {
          id: "effect_2",
          type: "sepia",
          enabled: false,
          parameters: {
            intensity: 0.48
          }
        },
        {
          id: "effect_4",
          type: "crtgrain",
          enabled: false,
          parameters: {
            intensity: 0.14,
            noiseSeed: 0.35
          }
        },
        {
          id: "effect_7",
          type: "halftone",
          enabled: false,
          parameters: {
            intensity: 1,
            dotSize: 13,
            contrast: 1.3
          }
        },
        {
          id: "effect_8",
          type: "gamma",
          enabled: true,
          parameters: {
            gamma: 1.6,
            brightness: 1.1,
            contrast: 0.9,
            saturation: 2.2
          }
        },
        {
          id: "effect_14",
          type: "sobelthreshold",
          enabled: true,
          parameters: {
            intensity: 1,
            threshold: 0.56
          }
        },
        {
          id: "effect_3",
          type: "vignette",
          enabled: true,
          parameters: {
            intensity: 0.72,
            offset: 1.65,
            feather: 1.3
          }
        },
        {
          id: "effect_9",
          type: "colorify",
          enabled: true,
          parameters: {
            intensity: 1,
            colorR: 0.52,
            colorG: 0.34,
            colorB: 0.36
          }
        },
        {
          id: "effect_10",
          type: "bloom",
          enabled: true,
          parameters: {
            threshold: 0.58,
            intensity: 3,
            radius: 1
          }
        }
      ],
      "Delicate Disco": [
        {
          id: "effect_30",
          type: "sepia",
          enabled: true,
          parameters: {
            intensity: 0
          }
        },
        {
          id: "effect_31",
          type: "crtgrain",
          enabled: true,
          parameters: {
            intensity: 0.13,
            noiseSeed: 1
          }
        },
        {
          id: "effect_32",
          type: "halftone",
          enabled: true,
          parameters: {
            intensity: 1,
            dotSize: 24,
            contrast: 2
          }
        },
        {
          id: "effect_33",
          type: "blur",
          enabled: false,
          parameters: {
            intensity: 0.49,
            blurAmount: 0.0005
          }
        },
        {
          id: "effect_34",
          type: "gamma",
          enabled: true,
          parameters: {
            gamma: 2.6,
            brightness: 1.2,
            contrast: 2.1,
            saturation: 2.3
          }
        },
        {
          id: "effect_35",
          type: "sobelthreshold",
          enabled: true,
          parameters: {
            intensity: 0.25,
            threshold: 0.87
          }
        },
        {
          id: "effect_36",
          type: "vignette",
          enabled: true,
          parameters: {
            intensity: 0.72,
            offset: 1.65,
            feather: 1.3
          }
        }
      ],
      "Delicate Noir": [
        {
          id: "effect_31",
          type: "crtgrain",
          enabled: true,
          parameters: {
            intensity: 0.13,
            noiseSeed: 0.15
          }
        },
        {
          id: "effect_32",
          type: "halftone",
          enabled: true,
          parameters: {
            intensity: 0.67,
            dotSize: 9,
            contrast: 2
          }
        },
        {
          id: "effect_33",
          type: "blur",
          enabled: true,
          parameters: {
            intensity: 0.49,
            blurAmount: 0.0005
          }
        },
        {
          id: "effect_35",
          type: "sobelthreshold",
          enabled: true,
          parameters: {
            intensity: 0.25,
            threshold: 0.87
          }
        },
        {
          id: "effect_34",
          type: "gamma",
          enabled: true,
          parameters: {
            gamma: 2.6,
            brightness: 1.2,
            contrast: 2.1,
            saturation: 0
          }
        },
        {
          id: "effect_30",
          type: "sepia",
          enabled: true,
          parameters: {
            intensity: 0.48
          }
        },
        {
          id: "effect_36",
          type: "vignette",
          enabled: true,
          parameters: {
            intensity: 1,
            offset: 0.75,
            feather: 0.58
          }
        }
      ]
    }
  }

  private getSavedPresets(): Record<string, EffectInstance[]> {
    try {
      const saved = localStorage.getItem('effects-presets')
      const userPresets = saved ? JSON.parse(saved) : {}
      const defaultPresets = this.getDefaultPresets()
      
      // Merge default presets with user presets (user presets override defaults)
      return { ...defaultPresets, ...userPresets }
    } catch {
      return this.getDefaultPresets()
    }
  }

  private savePresets(presets: Record<string, EffectInstance[]>): void {
    try {
      localStorage.setItem('effects-presets', JSON.stringify(presets))
    } catch (error) {
      console.error('Failed to save presets:', error)
    }
  }

  private loadPreset(name: string): void {
    const presets = this.getSavedPresets()
    const preset = presets[name]
    
    if (preset) {
      // Clear current effects
      this.chainManager.clearEffects()
      this.chainManager.setLoadingFromScene(true) // Prevent auto-expansion
      
      // Load preset effects with fallback for renamed effects
      preset.forEach(effect => {
        try {
          // Handle legacy effect type renames
          let effectType = effect.type
          if ((effectType as string) === 'film') {
            console.warn('Converting legacy "film" effect to "crtgrain"')
            effectType = 'crtgrain'
          }
          
          this.chainManager.addEffect(effectType, effect.parameters)
        } catch (error) {
          console.warn(`Failed to load effect ${effect.type}:`, error)
        }
      })
      
      this.chainManager.setLoadingFromScene(false) // Re-enable auto-expansion
      
      // Refresh display
      this.refreshChain()
    }
  }

  private loadDefaultPreset(): void {
    console.log('Initializing effects system without default preset')
    // Initialize effects pipeline but don't load a preset
    this.updateEffectsEnabled(true)
    console.log('Effects system ready, waiting for scene to load effects')
  }


  private showSavePresetDialog(): void {
    const name = prompt('Enter preset name:')
    if (name && name.trim()) {
      this.saveCurrentAsPreset(name.trim())
    }
  }

  private saveCurrentAsPreset(name: string): void {
    const currentEffects = this.chainManager.getEffectsChain()
    const presets = this.getSavedPresets()
    
    presets[name] = currentEffects.map(effect => ({
      id: effect.id,
      type: effect.type,
      enabled: effect.enabled,
      parameters: { ...effect.parameters }
    }))
    
    this.savePresets(presets)
    this.loadPresetsIntoDropdown()
    
    // Select the newly saved preset
    this.mainDropdown.value = name
  }

  private createAddEffectModal(): void {
    // Check if mobile for responsive layout decisions
    const isMobile = document.body.classList.contains('touch-layout') || 
                     document.body.classList.contains('hybrid-layout') ||
                     window.matchMedia('(hover: none) and (pointer: coarse)').matches ||
                     'ontouchstart' in window
    
    // Create dropdown for effect selection
    this.addEffectModal = document.createElement('div')
    this.addEffectModal.className = 'add-effect-dropdown'
    this.addEffectModal.style.display = 'none'
    
    const dropdownContent = document.createElement('div')
    dropdownContent.className = 'add-effect-dropdown-content'
    
    // Add search input (no title needed for compact dropdown)
    const searchContainer = document.createElement('div')
    searchContainer.className = 'add-effect-search-container'
    if (isMobile) {
      // Add title and close button for mobile
      const headerContainer = document.createElement('div')
      headerContainer.className = 'mobile-modal-header'
      
      const modalTitle = document.createElement('h3')
      modalTitle.className = 'mobile-modal-title'
      modalTitle.textContent = 'Add Effect'
      
      const closeButton = document.createElement('button')
      closeButton.className = 'mobile-modal-close'
      closeButton.innerHTML = '×'
      closeButton.title = 'Close'
      closeButton.onclick = () => this.hideAddEffectModal()
      
      headerContainer.appendChild(modalTitle)
      headerContainer.appendChild(closeButton)
      dropdownContent.appendChild(headerContainer)
    }
    
    const searchInput = document.createElement('input')
    searchInput.type = 'text'
    searchInput.placeholder = 'Search effects...'
    searchInput.className = 'add-effect-search'
    searchContainer.appendChild(searchInput)
    dropdownContent.appendChild(searchContainer)
    
    const effectGrid = document.createElement('div')
    effectGrid.className = 'add-effect-grid'
    
    // Create all effect buttons and store references
    const effectButtons: Array<{button: HTMLButtonElement, definition: any}> = []
    
    // Define categories (same as mobile)
    const categories = {
      'Color': {
        effects: ['gamma', 'sepia', 'colorify', 'splittone', 'gradient', 'invert', 'bleachbypass', 'posterize']
      },
      'Blur': {
        effects: ['blur', 'bloom', 'motionblur', 'glow', 'dof', 'gaussianblur']
      },
      'Grain': {
        effects: ['crtgrain', 'film35mm', 'pixelate', 'noise2d']
      },
      'Post-Process': {
        effects: ['vignette', 'afterimage', 'sobel', 'sobelthreshold', 'threshold', 'oilpainting', 'ascii', 'halftone', 'circlepacking', 'engraving', 'datamosh', 'pixelsort']
      },
      '3D Effects': {
        effects: ['drawrange', 'pointnetwork', 'material', 'randomscale', 'topographic', 'fog', 'skysphere', 'sinradius']
      },
      'In Development': {
        effects: ['tsl', 'dotscreen']
      }
    }
    
    // Create effects organized by category with simple dividers
    Object.entries(categories).forEach(([categoryName, categoryData]) => {
      // Create category divider
      const categoryDivider = document.createElement('div')
      categoryDivider.className = 'effect-category-divider'
      categoryDivider.textContent = categoryName
      categoryDivider.style.cssText = `
        color: #888;
        font-size: 0.6rem;
        font-weight: bold;
        font-family: 'Space Mono', monospace;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 8px 0 4px 0;
        padding: 2px 0;
        border-bottom: 1px solid rgba(136, 136, 136, 0.2);
      `
      effectGrid.appendChild(categoryDivider)
      
      // Add effects for this category
      categoryData.effects.forEach(effectType => {
        const definition = EFFECT_DEFINITIONS.find(def => def.type === effectType)
        if (definition) {
          const button = document.createElement('button')
          button.className = 'add-effect-option'
          button.textContent = definition.name
          button.setAttribute('data-effect-name', definition.name.toLowerCase())
          button.setAttribute('data-effect-type', definition.type.toLowerCase())
          button.setAttribute('data-category', categoryName.toLowerCase())
          button.onclick = () => {
            this.chainManager.addEffect(definition.type)
            this.refreshChain() // Manually refresh after adding effect
            this.hideAddEffectModal()
            
            // Switch to Custom and enable effects
            this.mainDropdown.value = 'custom'
            this.updateEffectsEnabled(true)
          }
          effectGrid.appendChild(button)
          effectButtons.push({button, definition})
        }
      })
    })
    
    // Track selected index for keyboard navigation
    let selectedIndex = 0
    
    // Helper function to get visible buttons
    const getVisibleButtons = () => {
      return effectButtons.filter(({button}) => button.style.display !== 'none')
    }
    
    // Helper function to update selection highlight
    const updateSelection = () => {
      const visibleButtons = getVisibleButtons()
      
      // Remove previous highlight
      effectButtons.forEach(({button}) => {
        button.classList.remove('keyboard-selected')
      })
      
      // Add highlight to current selection
      if (visibleButtons.length > 0) {
        selectedIndex = Math.max(0, Math.min(selectedIndex, visibleButtons.length - 1))
        visibleButtons[selectedIndex].button.classList.add('keyboard-selected')
      }
    }
    
    // Add search functionality
    searchInput.addEventListener('input', (e) => {
      const searchTerm = (e.target as HTMLInputElement).value.toLowerCase().trim()
      
      // Track which categories have visible effects
      const visibleCategories = new Set<string>()
      
      effectButtons.forEach(({button, definition}) => {
        const name = definition.name.toLowerCase()
        const type = definition.type.toLowerCase()
        const category = button.getAttribute('data-category') || ''
        const matches = name.includes(searchTerm) || type.includes(searchTerm)
        
        button.style.display = matches ? 'block' : 'none'
        
        if (matches) {
          visibleCategories.add(category)
        }
      })
      
      // Show/hide category dividers based on whether they have visible effects
      const categoryDividers = effectGrid.querySelectorAll('.effect-category-divider')
      categoryDividers.forEach((divider) => {
        const categoryName = (divider as HTMLElement).textContent?.toLowerCase() || ''
        const shouldShow = visibleCategories.has(categoryName) || searchTerm === ''
        ;(divider as HTMLElement).style.display = shouldShow ? 'block' : 'none'
      })
      
      // Reset selection to top when search changes
      selectedIndex = 0
      updateSelection()
    })
    
    // Add keyboard support
    searchInput.addEventListener('keydown', (e) => {
      const visibleButtons = getVisibleButtons()
      
      if (e.key === 'Enter') {
        e.preventDefault()
        // Select the currently highlighted effect
        if (visibleButtons.length > 0 && visibleButtons[selectedIndex]) {
          visibleButtons[selectedIndex].button.click()
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        selectedIndex = Math.min(selectedIndex + 1, visibleButtons.length - 1)
        updateSelection()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        selectedIndex = Math.max(selectedIndex - 1, 0)
        updateSelection()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.hideAddEffectModal()
      }
    })
    
    // Initialize selection on first load
    setTimeout(() => updateSelection(), 0)
    
    dropdownContent.appendChild(effectGrid)
    
    this.addEffectModal.appendChild(dropdownContent)
    
    // Position dropdown relative to the effects panel, or body for mobile
    if (isMobile) {
      // On mobile, append to body and position as full-screen modal
      document.body.appendChild(this.addEffectModal)
      this.addEffectModal.classList.add('mobile-modal')
    } else {
      // On desktop, append to panel as before
      this.panelElement.appendChild(this.addEffectModal)
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (this.addEffectModal && this.addEffectModal.style.display !== 'none') {
        const isClickInside = this.addEffectModal.contains(e.target as Node) || 
                             (e.target as Element).closest('.add-effect-button')
        if (!isClickInside) {
          this.hideAddEffectModal()
        }
      }
    })
    
    // Store reference to search input for focus management
    this.addEffectModal.setAttribute('data-search-input', 'true')
  }
  
  private showAddEffectModal(): void {
    if (this.addEffectModal) {
      this.addEffectModal.style.display = 'flex'
      
      // Clear search and show all effects
      const searchInput = this.addEffectModal.querySelector('.add-effect-search') as HTMLInputElement
      if (searchInput) {
        searchInput.value = ''
        searchInput.focus()
        
        // Show all effect buttons
        const effectButtons = this.addEffectModal.querySelectorAll('.add-effect-option')
        effectButtons.forEach(button => {
          (button as HTMLElement).style.display = 'block'
        })
      }
    }
  }
  
  private hideAddEffectModal(): void {
    if (this.addEffectModal) {
      this.addEffectModal.style.display = 'none'
    }
  }

  private updateChainDisplay(): void {
    const effects = this.chainManager.getEffectsChain()
    
    // Helper function to update a chain container
    const updateContainer = (container: HTMLElement, dropdown: HTMLSelectElement) => {
      // Clear existing chain display
      container.innerHTML = ''
      
      // Update dropdown to "Custom" if there are effects and it's not set to a specific preset
      if (effects.length > 0 && dropdown.value === 'none') {
        dropdown.value = 'custom'
      } else if (effects.length === 0 && dropdown.value === 'custom') {
        dropdown.value = 'none'
      }
      
      if (effects.length === 0) {
        // Show add effect button when empty
        const addButton = document.createElement('button')
        addButton.className = 'add-effect-button empty-state'
        addButton.innerHTML = `
          <span class="add-effect-icon">+</span>
          <span class="add-effect-text">Add Effect</span>
        `
        addButton.onclick = () => this.showAddEffectModal()
        container.appendChild(addButton)
        
        // Ensure panel is expanded when showing Add Effect button
        this.ensureExpanded()
        return
      }

      // Create effect cards
      effects.forEach((effect, index) => {
        const card = this.createEffectCard(effect, index)
        container.appendChild(card)
      })
      
      // Create container for action buttons
      const actionButtonsContainer = document.createElement('div')
      actionButtonsContainer.className = 'chain-action-buttons'
      
      // Add a "+" button at the end of the chain
      const addButton = document.createElement('button')
      addButton.className = 'add-effect-button chain-end'
      addButton.innerHTML = `<span class="add-effect-icon">+</span>`
      addButton.title = 'Add Effect'
      addButton.onclick = () => this.showAddEffectModal()
      actionButtonsContainer.appendChild(addButton)
      
      // Add a reset button (only show if there are effects)
      if (effects.length > 0) {
        const resetButton = document.createElement('button')
        resetButton.className = 'reset-effects-button chain-end'
        resetButton.innerHTML = `<span class="reset-effect-icon">↻</span>`
        resetButton.title = 'Clear All Effects'
        resetButton.onclick = () => this.clearAllEffects()
        actionButtonsContainer.appendChild(resetButton)
      }
      
      container.appendChild(actionButtonsContainer)
    }
    
    // Update desktop container
    updateContainer(this.chainContainer, this.mainDropdown)
    
    // Update mobile container if it exists
    if (this.mobileChainContainer && this.mobileMainDropdown) {
      updateContainer(this.mobileChainContainer, this.mobileMainDropdown)
    }
    
    // Auto-expand parameters for newly added effects
    this.autoExpandNewEffect()
  }

  private autoExpandNewEffect(): void {
    const lastAddedEffectId = this.chainManager.getLastAddedEffectId()
    if (!lastAddedEffectId) return
    
    // Get the effect instance
    const effects = this.chainManager.getEffectsChain()
    const effect = effects.find(e => e.id === lastAddedEffectId)
    if (!effect) return
    
    // Check if the effect has parameters
    const definition = this.chainManager.getEffectDefinition(effect.type)
    const hasParameters = definition && Object.keys(definition.parameterDefinitions).length > 0
    
    if (hasParameters) {
      // Mark this effect as expanded
      this.expandedEffects.add(lastAddedEffectId)
    }
    
    // Clear the last added effect ID so it doesn't auto-expand again
    this.chainManager.clearLastAddedEffectId()
  }

  private createEffectCard(effect: EffectInstance, index: number): HTMLElement {
    const card = document.createElement('div')
    card.className = `effect-card ${effect.enabled ? 'enabled' : 'disabled'}`
    card.setAttribute('data-effect-id', effect.id)
    card.setAttribute('data-index', index.toString())
    card.draggable = false // Don't make the entire card draggable

    const definition = this.chainManager.getEffectDefinition(effect.type)
    const effectName = definition?.name || effect.type
    const hasParameters = definition && Object.keys(definition.parameterDefinitions).length > 0
    const supportsBlending = definition?.supportsBlending || false
    const blendMode = effect.blendMode || 'normal'
    const blendModeLabel = blendMode === 'add' ? 'A' : blendMode === 'multiply' ? 'M' : 'N'
    const blendModeClass = blendMode === 'add' ? 'add' : blendMode === 'multiply' ? 'multiply' : 'normal'

    card.innerHTML = `
      <div class="effect-card-header">
        ${hasParameters ? 
          `<button class="effect-expand-arrow" title="Show/hide parameters">▶</button>` :
          `<div class="effect-expand-spacer"></div>`
        }
        <div class="effect-name" draggable="true" title="Drag to reorder">${effectName}</div>
        <div class="effect-controls">
          ${supportsBlending ? 
            `<button class="effect-blend-mode ${blendModeClass}" 
                    title="Blend mode: ${blendMode}" 
                    data-effect-id="${effect.id}">
              ${blendModeLabel}
            </button>` : ''
          }
          <button class="effect-toggle ${effect.enabled ? 'enabled' : 'disabled'}" 
                  title="${effect.enabled ? 'Disable' : 'Enable'} effect">
            ${effect.enabled ? '●' : '○'}
          </button>
          <button class="effect-reset" title="Reset effect to defaults">↻</button>
          <button class="effect-remove" title="Remove effect">×</button>
        </div>
      </div>
      <div class="effect-parameters-container" style="display: none;" draggable="false">
        <!-- Parameters will be dynamically added here -->
      </div>
      <div class="effect-pipeline-connector"></div>
    `

    // Add event listeners
    this.setupCardEventListeners(card, effect)

    // Restore expanded state if this effect was previously expanded
    if (this.expandedEffects.has(effect.id) && hasParameters) {
      const parametersContainer = card.querySelector('.effect-parameters-container') as HTMLElement
      const expandButton = card.querySelector('.effect-expand-arrow') as HTMLElement
      
      if (parametersContainer && expandButton) {
        this.createEffectParameters(parametersContainer, effect)
        parametersContainer.style.display = 'block'
        expandButton.textContent = '▼'
        expandButton.title = 'Hide parameters'
      }
    }

    return card
  }

  private setupCardEventListeners(card: HTMLElement, effect: EffectInstance): void {

    // Toggle effect
    const toggleButton = card.querySelector('.effect-toggle') as HTMLElement
    toggleButton?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.chainManager.toggleEffect(effect.id)
      this.refreshChain() // Manually refresh to update visual state
    })

    // Reset effect
    const resetButton = card.querySelector('.effect-reset') as HTMLElement
    resetButton?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.chainManager.resetEffect(effect.id)
      this.refreshChain() // Manually refresh to update visual state and parameters
    })

    // Remove effect
    const removeButton = card.querySelector('.effect-remove') as HTMLElement
    removeButton?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.expandedEffects.delete(effect.id) // Clean up expanded state
      this.chainManager.removeEffect(effect.id)
      this.refreshChain() // Manually refresh after removing effect
      
      // Switch to None if no effects remain
      const remainingEffects = this.chainManager.getEffectsChain()
      if (remainingEffects.length === 0) {
        this.mainDropdown.value = 'none'
        this.updateEffectsEnabled(false)
      }
    })

    // Blend mode cycling
    const blendModeButton = card.querySelector('.effect-blend-mode') as HTMLElement
    blendModeButton?.addEventListener('click', (e) => {
      e.stopPropagation()
      const currentMode = effect.blendMode || 'normal'
      let nextMode: 'normal' | 'add' | 'multiply'
      
      // Cycle through modes: normal -> add -> multiply -> normal
      if (currentMode === 'normal') {
        nextMode = 'add'
      } else if (currentMode === 'add') {
        nextMode = 'multiply'
      } else {
        nextMode = 'normal'
      }
      
      this.chainManager.updateEffectBlendMode(effect.id, nextMode)
      this.refreshChain() // Refresh to update button appearance
    })

    // Expand/collapse parameters
    const expandButton = card.querySelector('.effect-expand-arrow') as HTMLElement
    expandButton?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.toggleEffectParameters(card, effect)
    })

    // Drag and drop - only from the effect name
    const effectName = card.querySelector('.effect-name') as HTMLElement
    effectName?.addEventListener('dragstart', (e) => {
      this.draggedElement = card
      this.draggedIndex = parseInt(card.getAttribute('data-index') || '-1')
      card.classList.add('dragging')
      
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/html', card.outerHTML)
      }
    })

    effectName?.addEventListener('dragend', () => {
      card.classList.remove('dragging')
      this.draggedElement = null
      this.draggedIndex = -1
    })

    card.addEventListener('dragover', (e) => {
      e.preventDefault()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move'
      }
    })

    card.addEventListener('drop', (e) => {
      e.preventDefault()
      if (this.draggedElement && this.draggedIndex !== -1) {
        const targetIndex = parseInt(card.getAttribute('data-index') || '-1')
        if (targetIndex !== -1 && targetIndex !== this.draggedIndex) {
          this.chainManager.moveEffect(this.draggedIndex, targetIndex)
          this.refreshChain() // Manually refresh after moving effect
        }
      }
    })
  }

  private updateSelectionHighlight(effectId: string | null): void {
    // Remove existing selection
    this.chainContainer.querySelectorAll('.effect-card').forEach(card => {
      card.classList.remove('selected')
    })

    // Add selection to current effect
    if (effectId) {
      const selectedCard = this.chainContainer.querySelector(`[data-effect-id="${effectId}"]`)
      selectedCard?.classList.add('selected')
    }
  }

  private updateParametersDisplay(): void {
    const selectedEffect = this.chainManager.getSelectedEffect()
    
    // Helper function to update a parameters container
    const updateContainer = (container: HTMLElement, idSuffix: string = '') => {
      // Clear existing parameters
      container.innerHTML = ''

      if (!selectedEffect) {
        const noSelectionMessage = document.createElement('div')
        noSelectionMessage.className = 'no-effect-selected'
        noSelectionMessage.textContent = 'Select an effect card to adjust its parameters'
        container.appendChild(noSelectionMessage)
        return
      }

      const definition = this.chainManager.getEffectDefinition(selectedEffect.type)
      if (!definition) return

      // Create parameter header
      const header = document.createElement('div')
      header.className = 'parameters-header'
      header.textContent = `${definition.name} Parameters`
      container.appendChild(header)

      // Create parameter controls
      Object.entries(definition.parameterDefinitions).forEach(([paramName, paramDef]) => {
        const currentValue = selectedEffect.parameters[paramName] || paramDef.min

        if (paramName === 'angle') {
          console.log('Creating angle slider:', {
            paramName,
            currentValue,
            paramDefMin: paramDef.min,
            paramDefMax: paramDef.max,
            effectParameters: selectedEffect.parameters
          })
        }

        const controlGroup = document.createElement('div')
        controlGroup.className = 'parameter-control'

        const label = document.createElement('label')
        label.textContent = `${paramDef.label}:`
        label.setAttribute('for', `param-${selectedEffect.id}-${paramName}${idSuffix}`)

        if (paramDef.type === 'color') {
          // Create simple color swatch for desktop (compact)
          const hexValue = '#' + Math.floor(currentValue).toString(16).padStart(6, '0')
          
          const colorSwatch = document.createElement('div')
          colorSwatch.className = 'desktop-color-swatch'
          colorSwatch.style.cssText = `
            width: 20px;
            height: 20px;
            background-color: ${hexValue};
            border: 1px solid #ffffff;
            border-radius: 50%;
            cursor: pointer;
            flex-shrink: 0;
          `

          // Create simple color picker popup on click
          colorSwatch.addEventListener('click', () => {
            const input = document.createElement('input')
            input.type = 'color'
            input.value = hexValue
            input.style.position = 'absolute'
            input.style.left = '-9999px'
            document.body.appendChild(input)
            
            // Real-time updates while color picking is active
            input.addEventListener('input', () => {
              const newHex = input.value
              const numericValue = parseInt(newHex.replace('#', ''), 16)
              colorSwatch.style.backgroundColor = newHex
              this.chainManager.updateEffectParameter(selectedEffect.id, paramName, numericValue)
            })
            
            // Final update when color picker is closed
            input.addEventListener('change', () => {
              const newHex = input.value
              const numericValue = parseInt(newHex.replace('#', ''), 16)
              colorSwatch.style.backgroundColor = newHex
              this.chainManager.updateEffectParameter(selectedEffect.id, paramName, numericValue)
              document.body.removeChild(input)
            })
            
            input.click()
          })

          controlGroup.appendChild(label)
          controlGroup.appendChild(colorSwatch)
        } else {
          // Create range slider for numeric parameters
          const slider = document.createElement('input')
          slider.type = 'range'
          slider.id = `param-${selectedEffect.id}-${paramName}${idSuffix}`
          slider.min = paramDef.min.toString()
          slider.max = paramDef.max.toString()
          slider.step = paramDef.step.toString()
          slider.value = currentValue.toString()

          if (paramName === 'angle') {
            console.log('Angle slider created with:', {
              min: slider.min,
              max: slider.max,
              step: slider.step,
              value: slider.value
            })
          }

          const valueDisplay = document.createElement('span')
          valueDisplay.className = 'parameter-value'
          valueDisplay.textContent = currentValue.toFixed(2)

          // Update parameter on change
          slider.addEventListener('input', () => {
            const newValue = parseFloat(slider.value)
            this.chainManager.updateEffectParameter(selectedEffect.id, paramName, newValue)
            valueDisplay.textContent = newValue.toFixed(2)
            
            // Sync with other container's slider if it exists
            const otherSliderId = idSuffix === '-mobile' ? 
              `param-${selectedEffect.id}-${paramName}` : 
              `param-${selectedEffect.id}-${paramName}-mobile`
            const otherSlider = document.getElementById(otherSliderId) as HTMLInputElement
            const otherValueDisplay = otherSlider?.parentElement?.querySelector('.parameter-value') as HTMLElement
            if (otherSlider) {
              otherSlider.value = newValue.toString()
              if (otherValueDisplay) {
                otherValueDisplay.textContent = newValue.toFixed(2)
              }
            }
          })

          controlGroup.appendChild(label)
          controlGroup.appendChild(slider)
          controlGroup.appendChild(valueDisplay)
        }
        
        container.appendChild(controlGroup)
      })
    }
    
    // Update desktop container
    updateContainer(this.parametersContainer)
    
    // Update mobile container if it exists
    if (this.mobileParametersContainer) {
      updateContainer(this.mobileParametersContainer, '-mobile')
    }
  }

  private clearAllEffects(): void {
    // Clear all effects from the chain
    this.chainManager.clearEffects()
    
    // Clear expanded effects tracking
    this.expandedEffects.clear()
    
    // Set dropdown to "None"
    this.mainDropdown.value = 'none'
    if (this.mobileMainDropdown) {
      this.mobileMainDropdown.value = 'none'
    }
    
    // Disable effects pipeline
    this.updateEffectsEnabled(false)
    
    // Refresh the display
    this.refreshChain()
    
    console.log('All effects cleared')
  }

  // Public methods for external control
  show(): void {
    this.panelElement.style.display = 'block'
  }

  hide(): void {
    this.panelElement.style.display = 'none'
  }

  toggle(): void {
    const isVisible = this.panelElement.style.display !== 'none'
    if (isVisible) {
      this.hide()
    } else {
      this.show()
    }
  }

  // Method to refresh the display (useful after external changes)
  refresh(): void {
    this.updateChainDisplay()
    this.updateParametersDisplay()
  }

  // Method to update display when effects are added/removed (call this manually)
  refreshChain(): void {
    this.updateChainDisplay()
  }

  // Method to clear expanded effects when loading scenes/presets from external sources
  clearExpandedEffects(): void {
    this.expandedEffects.clear()
  }

  private toggleEffectParameters(card: HTMLElement, effect: EffectInstance): void {
    const parametersContainer = card.querySelector('.effect-parameters-container') as HTMLElement
    const expandButton = card.querySelector('.effect-expand-arrow') as HTMLElement
    
    if (!parametersContainer || !expandButton) return

    const isVisible = parametersContainer.style.display !== 'none'
    
    if (isVisible) {
      // Collapse
      parametersContainer.style.display = 'none'
      expandButton.textContent = '▶'
      expandButton.title = 'Show parameters'
      this.expandedEffects.delete(effect.id)
    } else {
      // Expand
      this.createEffectParameters(parametersContainer, effect)
      parametersContainer.style.display = 'block'
      expandButton.textContent = '▼'
      expandButton.title = 'Hide parameters'
      this.expandedEffects.add(effect.id)
    }
  }

  private createEffectParameters(container: HTMLElement, effect: EffectInstance): void {
    // Clear existing parameters
    container.innerHTML = ''

    const definition = this.chainManager.getEffectDefinition(effect.type)
    if (!definition) return

    Object.entries(definition.parameterDefinitions).forEach(([paramName, paramDef]) => {
      const currentValue = effect.parameters[paramName] ?? definition.defaultParameters[paramName]
      
      const controlDiv = document.createElement('div')
      controlDiv.className = 'parameter-control'
      controlDiv.draggable = false
      
      if (paramDef.type === 'color') {
        // Create simple color swatch for expandable parameters
        const hexValue = '#' + Math.floor(currentValue).toString(16).padStart(6, '0')
        controlDiv.innerHTML = `
          <label class="parameter-label">${paramDef.label}:</label>
          <div class="desktop-color-swatch" style="
            width: 16px;
            height: 16px;
            background-color: ${hexValue};
            border: 1px solid #ffffff;
            border-radius: 50%;
            cursor: pointer;
            flex-shrink: 0;
            margin-left: auto;
          " data-param="${paramName}"></div>
        `
      } else {
        // Create range slider for numeric parameters
        controlDiv.innerHTML = `
          <label class="parameter-label">${paramDef.label}:</label>
          <input type="range" 
                 class="parameter-slider"
                 min="${paramDef.min}" 
                 max="${paramDef.max}" 
                 step="${paramDef.step}" 
                 value="${currentValue}"
                 data-param="${paramName}"
                 draggable="false">
          <span class="parameter-value">${currentValue}</span>
        `
      }
      
      // Add event listener for parameter changes
      const inputElement = controlDiv.querySelector('.parameter-slider') as HTMLInputElement
      const colorSwatch = controlDiv.querySelector('.desktop-color-swatch') as HTMLElement
      const valueSpan = controlDiv.querySelector('.parameter-value') as HTMLElement
      
      if (colorSwatch && paramDef.type === 'color') {
        // Handle color swatch clicks
        const parameterName = paramName // Capture in closure
        colorSwatch.addEventListener('click', (e) => {
          e.stopPropagation()
          const currentHex = rgbToHex(colorSwatch.style.backgroundColor)
          const input = document.createElement('input')
          input.type = 'color'
          input.value = currentHex
          input.style.position = 'absolute'
          input.style.left = '-9999px'
          document.body.appendChild(input)
          
          // Real-time updates while color picking is active
          input.addEventListener('input', () => {
            const newHex = input.value
            const numericValue = parseInt(newHex.replace('#', ''), 16)
            colorSwatch.style.backgroundColor = newHex
            this.chainManager.updateEffectParameter(effect.id, parameterName, numericValue)
          })
          
          // Final update when color picker is closed
          input.addEventListener('change', () => {
            const newHex = input.value
            const numericValue = parseInt(newHex.replace('#', ''), 16)
            colorSwatch.style.backgroundColor = newHex
            this.chainManager.updateEffectParameter(effect.id, parameterName, numericValue)
            document.body.removeChild(input)
          })
          
          input.click()
        })
      } else if (inputElement) {
        // Prevent all events on inputs from bubbling up to card
        inputElement.addEventListener('mousedown', (e) => {
          e.stopPropagation()
        })
        inputElement.addEventListener('mouseup', (e) => {
          e.stopPropagation()
        })
        inputElement.addEventListener('click', (e) => {
          e.stopPropagation()
        })
        inputElement.addEventListener('dragstart', (e) => {
          e.preventDefault()
          e.stopPropagation()
          return false
        })
        
        inputElement.addEventListener('input', (e) => {
          const target = e.target as HTMLInputElement
          const paramName = target.getAttribute('data-param')!
          
          // Handle range slider input
          const value = parseFloat(target.value)
          
          // Update the display
          valueSpan.textContent = value.toString()
          
          // Update the effect parameter
          this.chainManager.updateEffectParameter(effect.id, paramName, value)
        })
      }
      
      // Also prevent all events on the control div from bubbling up
      controlDiv.addEventListener('click', (e) => {
        e.stopPropagation()
      })
      controlDiv.addEventListener('mousedown', (e) => {
        e.stopPropagation()
      })
      controlDiv.addEventListener('dragstart', (e) => {
        e.preventDefault()
        e.stopPropagation()
        return false
      })
      
      container.appendChild(controlDiv)
    })
    
    // Prevent all events on the parameters container from bubbling up
    container.addEventListener('click', (e) => {
      e.stopPropagation()
    })
    container.addEventListener('mousedown', (e) => {
      e.stopPropagation()
    })
    container.addEventListener('dragstart', (e) => {
      e.preventDefault()
      e.stopPropagation()
      return false
    })
    container.addEventListener('drag', (e) => {
      e.preventDefault()
      e.stopPropagation()
      return false
    })
  }
}
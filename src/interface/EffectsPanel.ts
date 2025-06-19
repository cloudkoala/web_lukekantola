import { EffectsChainManager, EFFECT_DEFINITIONS } from '../effects/EffectsChainManager'
import type { EffectInstance } from '../effects/EffectsChainManager'

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
  private isCollapsed: boolean = true

  constructor(chainManager: EffectsChainManager) {
    this.chainManager = chainManager
    
    // Get DOM elements
    this.panelElement = document.getElementById('effects-panel') as HTMLElement
    this.chainContainer = document.getElementById('effects-chain') as HTMLElement
    this.parametersContainer = document.getElementById('effect-parameters') as HTMLElement
    this.collapseArrow = document.getElementById('effects-panel-collapse') as HTMLElement
    this.panelCollapsible = document.getElementById('effects-panel-collapsible') as HTMLElement
    this.mainDropdown = document.getElementById('effects-main-dropdown') as HTMLSelectElement
    this.savePresetButton = document.getElementById('save-preset') as HTMLElement

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
  }

  private setupEventListeners(): void {
    // Chain updates - temporarily disabled to prevent parameter expansion collapse
    // TODO: Make this more selective to only refresh when effects are added/removed/reordered
    // this.chainManager.onChainUpdated(() => {
    //   this.updateChainDisplay()
    // })

    // Effect selection
    this.chainManager.onEffectSelected((effectId) => {
      this.updateParametersDisplay()
      this.updateSelectionHighlight(effectId)
    })
  }

  private setupCollapseToggle(): void {
    this.collapseArrow.addEventListener('click', () => {
      this.toggleCollapse()
    })
  }

  private initializeCollapsedState(): void {
    if (this.isCollapsed) {
      this.panelCollapsible.classList.add('collapsed')
      this.panelElement.classList.add('collapsed')
      this.collapseArrow.classList.add('collapsed')
      this.collapseArrow.textContent = '▶'
    }
  }

  private toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed
    
    if (this.isCollapsed) {
      this.panelCollapsible.classList.add('collapsed')
      this.panelElement.classList.add('collapsed')
      this.collapseArrow.classList.add('collapsed')
      this.collapseArrow.textContent = '▶'
    } else {
      this.panelCollapsible.classList.remove('collapsed')
      this.panelElement.classList.remove('collapsed')
      this.collapseArrow.classList.remove('collapsed')
      this.collapseArrow.textContent = '▼'
    }
  }

  private setupMainDropdown(): void {
    // Initialize dropdown with presets
    this.loadPresetsIntoDropdown()
    
    // Set up main dropdown change handler
    this.mainDropdown.addEventListener('change', () => {
      const value = this.mainDropdown.value
      this.handleDropdownChange(value)
    })
    
    // Set up save preset button
    this.savePresetButton.addEventListener('click', () => {
      this.showSavePresetDialog()
    })
  }
  
  private handleDropdownChange(value: string): void {
    if (value === 'none') {
      // Clear all effects and disable effects pipeline
      this.chainManager.clearEffects()
      this.updateEffectsEnabled(false)
    } else if (value === 'custom') {
      // User selected custom - just enable effects, keep current chain
      this.updateEffectsEnabled(true)
    } else {
      // Load a preset
      this.loadPreset(value)
      this.updateEffectsEnabled(true)
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
    
    // Clear existing options except "None"
    while (this.mainDropdown.children.length > 1) {
      this.mainDropdown.removeChild(this.mainDropdown.lastChild!)
    }
    
    // Add preset options
    Object.keys(presets).forEach(name => {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      this.mainDropdown.appendChild(option)
    })
    
    // Add "Custom" option if not already present
    const hasCustom = Array.from(this.mainDropdown.options).some(option => option.value === 'custom')
    if (!hasCustom) {
      this.addCustomOption()
    }
  }
  
  private addCustomOption(): void {
    // Check if Custom option already exists
    const hasCustom = Array.from(this.mainDropdown.options).some(option => option.value === 'custom')
    if (!hasCustom) {
      const customOption = document.createElement('option')
      customOption.value = 'custom'
      customOption.textContent = 'Custom'
      this.mainDropdown.appendChild(customOption)
    }
  }

  private getDefaultPresets(): Record<string, EffectInstance[]> {
    return {
      "Cheeky Castleton": [
        {
          id: "effect_1",
          type: "background",
          enabled: true,
          parameters: {
            hue: 0.62,
            saturation: 27,
            lightness: 30
          }
        },
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
          type: "film",
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
          id: "effect_1",
          type: "background",
          enabled: true,
          parameters: {
            hue: 0.3,
            saturation: 46,
            lightness: 20
          }
        },
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
          type: "film",
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
          id: "effect_29",
          type: "background",
          enabled: true,
          parameters: {
            hue: 0.62,
            saturation: 27,
            lightness: 30
          }
        },
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
          type: "film",
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
          id: "effect_29",
          type: "background",
          enabled: true,
          parameters: {
            hue: 0.62,
            saturation: 27,
            lightness: 30
          }
        },
        {
          id: "effect_31",
          type: "film",
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
      
      // Load preset effects
      preset.forEach(effect => {
        this.chainManager.addEffect(effect.type, effect.parameters)
      })
      
      // Refresh display
      this.refreshChain()
    }
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
    // Create modal for effect selection
    this.addEffectModal = document.createElement('div')
    this.addEffectModal.className = 'add-effect-modal'
    this.addEffectModal.style.display = 'none'
    
    const modalContent = document.createElement('div')
    modalContent.className = 'add-effect-modal-content'
    
    const title = document.createElement('h3')
    title.textContent = 'Add Effect'
    title.className = 'add-effect-modal-title'
    modalContent.appendChild(title)
    
    const effectGrid = document.createElement('div')
    effectGrid.className = 'add-effect-grid'
    
    // Add effect buttons
    EFFECT_DEFINITIONS.forEach(definition => {
      const button = document.createElement('button')
      button.className = 'add-effect-option'
      button.textContent = definition.name
      button.onclick = () => {
        this.chainManager.addEffect(definition.type)
        this.refreshChain() // Manually refresh after adding effect
        this.hideAddEffectModal()
        
        // Switch to Custom and enable effects
        this.addCustomOption()
        this.mainDropdown.value = 'custom'
        this.updateEffectsEnabled(true)
      }
      effectGrid.appendChild(button)
    })
    
    modalContent.appendChild(effectGrid)
    
    // Close button
    const closeButton = document.createElement('button')
    closeButton.className = 'add-effect-close'
    closeButton.textContent = '×'
    closeButton.onclick = () => this.hideAddEffectModal()
    modalContent.appendChild(closeButton)
    
    this.addEffectModal.appendChild(modalContent)
    document.body.appendChild(this.addEffectModal)
    
    // Close modal when clicking outside
    this.addEffectModal.onclick = (e) => {
      if (e.target === this.addEffectModal) {
        this.hideAddEffectModal()
      }
    }
  }
  
  private showAddEffectModal(): void {
    if (this.addEffectModal) {
      this.addEffectModal.style.display = 'flex'
    }
  }
  
  private hideAddEffectModal(): void {
    if (this.addEffectModal) {
      this.addEffectModal.style.display = 'none'
    }
  }

  private updateChainDisplay(): void {
    // Clear existing chain display
    this.chainContainer.innerHTML = ''

    const effects = this.chainManager.getEffectsChain()
    
    // Update dropdown to "Custom" if there are effects and it's not set to a specific preset
    if (effects.length > 0 && this.mainDropdown.value === 'none') {
      // Ensure Custom option exists
      this.addCustomOption()
      this.mainDropdown.value = 'custom'
    } else if (effects.length === 0 && this.mainDropdown.value === 'custom') {
      this.mainDropdown.value = 'none'
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
      this.chainContainer.appendChild(addButton)
      return
    }

    // Create effect cards
    effects.forEach((effect, index) => {
      const card = this.createEffectCard(effect, index)
      this.chainContainer.appendChild(card)
    })
    
    // Add a "+" button at the end of the chain
    const addButton = document.createElement('button')
    addButton.className = 'add-effect-button chain-end'
    addButton.innerHTML = `<span class="add-effect-icon">+</span>`
    addButton.title = 'Add Effect'
    addButton.onclick = () => this.showAddEffectModal()
    this.chainContainer.appendChild(addButton)
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

    card.innerHTML = `
      <div class="effect-card-header">
        ${hasParameters ? 
          `<button class="effect-expand-arrow" title="Show/hide parameters">▶</button>` :
          `<div class="effect-expand-spacer"></div>`
        }
        <div class="effect-name" draggable="true" title="Drag to reorder">${effectName}</div>
        <div class="effect-controls">
          <button class="effect-toggle ${effect.enabled ? 'enabled' : 'disabled'}" 
                  title="${effect.enabled ? 'Disable' : 'Enable'} effect">
            ${effect.enabled ? '●' : '○'}
          </button>
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

    return card
  }

  private setupCardEventListeners(card: HTMLElement, effect: EffectInstance): void {

    // Toggle effect
    const toggleButton = card.querySelector('.effect-toggle') as HTMLElement
    toggleButton?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.chainManager.toggleEffect(effect.id)
    })

    // Remove effect
    const removeButton = card.querySelector('.effect-remove') as HTMLElement
    removeButton?.addEventListener('click', (e) => {
      e.stopPropagation()
      this.chainManager.removeEffect(effect.id)
      this.refreshChain() // Manually refresh after removing effect
      
      // Switch to None if no effects remain
      const remainingEffects = this.chainManager.getEffectsChain()
      if (remainingEffects.length === 0) {
        this.mainDropdown.value = 'none'
        this.updateEffectsEnabled(false)
      }
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
    
    // Clear existing parameters
    this.parametersContainer.innerHTML = ''

    if (!selectedEffect) {
      const noSelectionMessage = document.createElement('div')
      noSelectionMessage.className = 'no-effect-selected'
      noSelectionMessage.textContent = 'Select an effect card to adjust its parameters'
      this.parametersContainer.appendChild(noSelectionMessage)
      return
    }

    const definition = this.chainManager.getEffectDefinition(selectedEffect.type)
    if (!definition) return

    // Create parameter header
    const header = document.createElement('div')
    header.className = 'parameters-header'
    header.textContent = `${definition.name} Parameters`
    this.parametersContainer.appendChild(header)

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
      label.setAttribute('for', `param-${selectedEffect.id}-${paramName}`)

      const slider = document.createElement('input')
      slider.type = 'range'
      slider.id = `param-${selectedEffect.id}-${paramName}`
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
      })

      controlGroup.appendChild(label)
      controlGroup.appendChild(slider)
      controlGroup.appendChild(valueDisplay)
      this.parametersContainer.appendChild(controlGroup)
    })
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
    } else {
      // Expand
      this.createEffectParameters(parametersContainer, effect)
      parametersContainer.style.display = 'block'
      expandButton.textContent = '▼'
      expandButton.title = 'Hide parameters'
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
      
      // Add event listener for parameter changes
      const slider = controlDiv.querySelector('.parameter-slider') as HTMLInputElement
      const valueSpan = controlDiv.querySelector('.parameter-value') as HTMLElement
      
      // Prevent all events on sliders from bubbling up to card
      slider.addEventListener('mousedown', (e) => {
        e.stopPropagation()
      })
      slider.addEventListener('mouseup', (e) => {
        e.stopPropagation()
      })
      slider.addEventListener('click', (e) => {
        e.stopPropagation()
      })
      slider.addEventListener('dragstart', (e) => {
        e.preventDefault()
        e.stopPropagation()
        return false
      })
      
      slider.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement
        const value = parseFloat(target.value)
        const paramName = target.getAttribute('data-param')!
        
        // Update the display
        valueSpan.textContent = value.toString()
        
        // Update the effect parameter
        this.chainManager.updateEffectParameter(effect.id, paramName, value)
      })
      
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
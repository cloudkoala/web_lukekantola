import type { ProjectsConfig } from '../types'

export class ContentLoader {
  private projectsConfig: ProjectsConfig | null = null

  async loadProjectsConfig() {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}projects.json`)
      this.projectsConfig = await response.json()
      console.log('Projects configuration loaded:', this.projectsConfig)
    } catch (error) {
      console.error('Failed to load projects configuration:', error)
    }
  }

  getProjectsConfig(): ProjectsConfig | null {
    return this.projectsConfig
  }

  generateProjectsListingContent(): string {
    if (!this.projectsConfig) {
      return `
        <div class="projects-error">
          <p>Error: Projects configuration not loaded</p>
        </div>
      `
    }
    
    const projectEntries = Object.entries(this.projectsConfig.projects)
    
    if (projectEntries.length === 0) {
      return `
        <div class="projects-error">
          <p>No projects found</p>
        </div>
      `
    }
    
    // Generate card-style blog layout
    const projectCards = projectEntries.map(([projectId, projectData]) => {
      return `
        <article class="project-card" data-project-id="${projectId}">
          <div class="project-card-image" style="background-image: url('${import.meta.env.BASE_URL}images/projects/default.png');">
            <span>Project Image</span>
          </div>
          <div class="project-card-content">
            <div class="project-card-meta">
              <span class="project-year">${projectData.year}</span>
              <span class="project-status">${projectData.status}</span>
            </div>
            <h3 class="project-card-title">${projectData.title}</h3>
            <p class="project-card-description">${projectData.description}</p>
            <div class="project-card-tech">
              ${projectData.tech.map(tech => `<span class="tech-tag">${tech}</span>`).join('')}
            </div>
            <div class="project-card-actions">
              <button class="project-read-more" data-project-id="${projectId}">
                Read More <span class="arrow">→</span>
              </button>
            </div>
          </div>
        </article>
      `
    }).join('')
    
    return `
      <div class="projects-blog-layout">
        <div class="projects-grid">
          ${projectCards}
        </div>
      </div>
    `
  }
  
  generateProjectDetailContent(currentProjectId: string | null): string {
    if (!this.projectsConfig || !currentProjectId || !this.projectsConfig.projects[currentProjectId]) {
      return `
        <div class="terminal-section">
          <h3>$ cat ~/projects/error.log</h3>
          <p>Error: Project not found</p>
        </div>
      `
    }
    
    const project = this.projectsConfig.projects[currentProjectId]
    const techList = project.tech.map(tech => `• ${tech}`).join('<br>')
    
    return `
      <div class="terminal-section project-detail-header">
        <h3>$ cd ~/projects/${currentProjectId}/</h3>
        <div class="project-detail-meta">
          <span class="project-year">${project.year}</span>
          <span class="project-status">${project.status}</span>
        </div>
      </div>
      
      <div class="terminal-section">
        <h3>$ cat README.md</h3>
        <h2 class="project-detail-title">${project.title}</h2>
        <div class="project-detail-content">
          ${project.content.split('\n\n').map(paragraph => `<p>${paragraph}</p>`).join('')}
        </div>
      </div>
      
      <div class="terminal-section">
        <h3>$ cat tech-stack.txt</h3>
        <div class="project-tech-stack">
          ${techList}
        </div>
      </div>
    `
  }
}
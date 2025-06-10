# GitHub Pages Deployment Guide

## Overview
This project is configured for automated deployment to GitHub Pages using GitHub Actions.

## Quick Start

### 1. Repository Setup
1. Push this code to a GitHub repository
2. Ensure the repository name matches the `base` path in `vite.config.js` (currently set to `/gsplat-showcase/`)
3. If your repository has a different name, update the `base` field in `vite.config.js`

### 2. Enable GitHub Pages
1. Go to your repository Settings → Pages
2. Select "GitHub Actions" as the source
3. The deployment workflow will run automatically on the next push to main

### 3. Large File Setup (Git LFS)
Due to PLY files totaling 101MB, you'll need to set up Git LFS:

```bash
# Install Git LFS (if not already installed)
git lfs install

# Track existing PLY files
git lfs track "*.ply"

# Add and commit the .gitattributes file
git add .gitattributes
git commit -m "Add Git LFS tracking for PLY files"

# Migrate existing PLY files to LFS
git lfs migrate import --include="*.ply"

# Push to GitHub
git push origin main
```

### 4. Custom Domain Setup (Optional)
To use your custom domain (e.g., kantola.dev):

1. In repository Settings → Pages → Custom domain, enter your domain
2. Enable "Enforce HTTPS"
3. Update your DNS settings (see Domain Migration section below)

## Domain Migration from Squarespace

### DNS Configuration
Update these DNS records in your Squarespace domain settings:

#### For Apex Domain (kantola.dev):
```
Type: A, Host: @, Value: 185.199.108.153
Type: A, Host: @, Value: 185.199.109.153  
Type: A, Host: @, Value: 185.199.110.153
Type: A, Host: @, Value: 185.199.111.153
```

#### For WWW Subdomain:
```
Type: CNAME, Host: www, Value: yourusername.github.io
```

### Migration Steps
1. **Preparation** (48 hours before):
   - Lower DNS TTL to 300 seconds in Squarespace
   - Verify GitHub Pages deployment is working on temporary URL

2. **Migration** (maintenance window):
   - Update DNS records as shown above
   - Monitor DNS propagation (use whatsmydns.net)
   - Test site functionality on new domain

3. **Post-Migration**:
   - Enable HTTPS in GitHub Pages settings
   - Verify SSL certificate provisioning
   - Test all functionality on new domain

## Build Configuration

### Vite Configuration
- Base path configured for GitHub Pages subdirectory hosting
- Code splitting enabled for Three.js to reduce bundle sizes
- PLY files included as assets
- Optimized build settings for production

### Bundle Analysis
Current build creates:
- `three.js`: 471KB (gzipped: 118KB) - Main Three.js library
- `three-examples.js`: 25KB (gzipped: 6.7KB) - OrbitControls and PLYLoader
- `index.js`: 30KB (gzipped: 8KB) - Application code
- `index.css`: 12.6KB (gzipped: 2.8KB) - Styles

## Troubleshooting

### Build Issues
- **"terser not found"**: Fixed by using esbuild minification
- **Large bundle warnings**: Fixed with code splitting configuration
- **Asset loading**: Ensure base path matches repository name

### Deployment Issues
- **404 on deployment**: Check base path in vite.config.js
- **Assets not loading**: Verify PLY files are tracked with Git LFS
- **Build fails**: Check Node.js version compatibility (requires 18+)

### Domain Issues
- **DNS not propagating**: Wait up to 72 hours, use DNS checking tools
- **SSL certificate issues**: Wait 24 hours after DNS propagation
- **Mixed content errors**: Ensure all assets use HTTPS or relative URLs

## Performance Considerations

### Git LFS Limits
- GitHub provides 1GB storage and 1GB bandwidth per month free
- Additional usage: $5/month for 50GB storage + 50GB bandwidth
- Monitor usage in repository settings

### Alternative for Large Files
If Git LFS costs become prohibitive, consider:
- External CDN hosting for PLY files
- On-demand loading of models
- Compressed PLY formats
- Progressive mesh loading

## Monitoring and Maintenance

### Uptime Monitoring
Consider setting up monitoring with:
- UptimeRobot (free)
- Pingdom
- GitHub's built-in uptime monitoring

### Analytics
- GitHub Pages supports Google Analytics
- Consider privacy-focused alternatives like Plausible
- Monitor Core Web Vitals for performance

## Cost Analysis

### Savings vs Squarespace
- **Current Squarespace**: ~$144-216/year (hosting + domain)
- **GitHub Pages**: $0 hosting + domain registration cost
- **Potential Git LFS**: $5/month if exceeding free limits
- **Net savings**: $100-200/year

### Next Steps
1. Test deployment on temporary GitHub Pages URL
2. Set up Git LFS for PLY files
3. Plan domain migration maintenance window
4. Set up monitoring and analytics
5. Consider performance optimizations for international users
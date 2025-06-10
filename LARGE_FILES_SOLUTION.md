# Solution for Large PLY Files (101MB)

## ⚠️ Git LFS Quota Exceeded

GitHub's free Git LFS has a 1GB bandwidth limit per month, and your PLY files (101MB) have exceeded this limit.

## Alternative Solutions

### Option 1: Remove Large Files & Use External Hosting (Recommended)
Move PLY files to a CDN or external storage:

1. **Remove PLY files from repository:**
   ```bash
   git rm --cached public/*.ply
   git commit -m "Remove large PLY files for external hosting"
   ```

2. **Host files externally:**
   - **GitHub Releases**: Upload PLY files as release assets (2GB limit per file)
   - **Cloudflare R2**: Free tier with 10GB storage
   - **AWS S3**: Pay-as-you-go storage
   - **Firebase Storage**: Free tier with 1GB storage

3. **Update code to load from external URLs:**
   ```typescript
   // In main.ts, update the model paths
   const BASE_MODEL_URL = 'https://github.com/cloudkoala/gsplat-testing/releases/download/models/'
   // or your CDN URL
   ```

### Option 2: Compress PLY Files
Reduce file sizes before committing:

1. **Use PLY compression tools:**
   ```bash
   # Install compression tools (if available)
   npm install ply-compressor
   ```

2. **Compress each file:**
   - Target: Reduce 101MB to under 50MB total
   - May affect point cloud quality

### Option 3: Git LFS Alternative (Recommended for Immediate Deploy)
Deploy without the large files first, add them later:

1. **Deploy without PLY files:**
   ```bash
   git rm --cached public/*.ply
   git commit -m "Temporarily remove PLY files for deployment"
   git push origin main
   ```

2. **Test deployment with fallback:**
   - Site will use the demo point cloud if PLY files fail to load
   - Verify GitHub Pages deployment works

3. **Add external file hosting later**

## Quick Deploy Solution (Do This Now)

Let's get your site deployed immediately:

```bash
# Remove PLY files from git (keep local copies)
git rm --cached public/*.ply

# Add them to gitignore temporarily
echo "public/*.ply" >> .gitignore

# Commit and push
git add .
git commit -m "Remove large PLY files for GitHub Pages deployment"
git push origin main
```

Your site will deploy with the demo point cloud. Once deployed, we can add the PLY files via external hosting.

## External Hosting Setup (Next Steps)

### GitHub Releases Method (Free & Easy):
1. Create a new release in your repository
2. Upload PLY files as release assets
3. Update model paths to use release URLs:
   ```
   https://github.com/cloudkoala/gsplat-testing/releases/download/v1.0.0/Castleton_001.ply
   ```

### Cloudflare R2 Method (Free Tier):
1. Sign up for Cloudflare R2
2. Create a bucket
3. Upload PLY files
4. Get public URLs
5. Update model configuration

## Cost Comparison

### Git LFS (Current Issue):
- Free: 1GB storage + 1GB bandwidth/month
- Paid: $5/month for 50GB each
- **Problem**: Already exceeded free tier

### GitHub Releases (Recommended):
- **Cost**: Free
- **Limits**: 2GB per file, unlimited storage
- **Perfect for your 54MB max file size**

### External CDN:
- **Cloudflare R2**: Free 10GB/month
- **AWS S3**: ~$0.023/GB/month
- **Much cheaper than Git LFS**

## Action Plan

1. **Immediate**: Remove PLY files, deploy basic site
2. **Next**: Upload PLY files to GitHub Releases
3. **Update**: Modify code to load from release URLs
4. **Test**: Verify all models load correctly
5. **Optimize**: Consider compression for faster loading

This approach will get your site live immediately and provide a better long-term solution than Git LFS!
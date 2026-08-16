# GitHub Webhook Setup for NoteBooks Framework

This guide explains how to set up GitHub webhooks to automatically notify the NoteBooks app when files are updated or rebuilt.

## Overview

When your GitHub repository is updated, GitHub Actions can POST to your app's refresh signal endpoint to notify it of changes. This allows the app to intelligently update caches and refresh content without requiring users to manually reload the page.

## Signal Types

### Directory Signal
Use this when your entire repository has been rebuilt or all files may have changed.

**Effect:**
- Clears all browser caches (localStorage, service worker caches, IndexedDB)
- Refreshes the entire file tree in the UI
- Shows "Repository files updated!" notification
- Users keep their session state but see fresh content

**When to use:**
- After running a full build/rebuild pipeline
- When the repository structure changes significantly
- When you want to force all users to see the latest files

### File Signal  
Use this when a single file or small set of files has been updated.

**Effect:**
- Does NOT clear caches for the current session
- Shows "File updated: [path]. Refresh to see changes." notification
- Users can continue working and refresh when ready
- On full page refresh, all caches are cleared

**When to use:**
- Single file edits or small updates
- When you want minimal disruption to user workflow
- For gradual rollouts of content updates

## Webhook Setup

### 1. Add GitHub Actions Workflow

Create `.github/workflows/notify-app.yml`:

```yaml
name: Notify App of Updates

on:
  # Run when your build/publish workflow completes
  workflow_run:
    workflows: ["Build and Deploy"]
    types: [completed]
  
  # Or run on direct push to main
  push:
    branches: [main]
    paths:
      - 'notebooks/**'
      - 'content/**'

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
      
      - name: Get commit hash
        id: commit
        run: echo "hash=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT
      
      - name: Notify app of directory update
        run: |
          curl -X POST \
            -H "Content-Type: application/json" \
            -d '{
              "signal": "github-push",
              "type": "directory",
              "path": ".",
              "reason": "Repository rebuild",
              "commitHash": "${{ steps.commit.outputs.hash }}"
            }' \
            ${{ secrets.APP_WEBHOOK_URL }}/api/refresh-signal
        env:
          APP_WEBHOOK_URL: ${{ secrets.APP_WEBHOOK_URL }}
```

### 2. Set Up Repository Secret

1. Go to your GitHub repository → Settings → Secrets and Variables → Actions
2. Create a new repository secret named `APP_WEBHOOK_URL`
3. Set the value to your app's webhook endpoint, e.g.:
   ```
   https://your-app.com/api/refresh-signal
   ```

## Manual Webhook Requests

You can also manually trigger updates using curl:

### Directory Update (Full Refresh)
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "signal": "manual-rebuild",
    "type": "directory",
    "path": ".",
    "reason": "Manual full rebuild",
    "commitHash": "abc123def"
  }' \
  http://localhost:4000/api/refresh-signal
```

### File Update (Notification Only)
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "signal": "file-edit",
    "type": "file",
    "path": "/notebooks/biology/chapter-1.md",
    "reason": "Content update",
    "commitHash": "xyz789"
  }' \
  http://localhost:4000/api/refresh-signal
```

## Webhook Request Schema

```json
{
  "signal": "string - unique identifier for this signal",
  "type": "directory | file - what kind of update",
  "path": "string (optional) - file or directory path",
  "reason": "string (optional) - why the update occurred",
  "commitHash": "string (optional) - git commit hash"
}
```

## Client-Side Behavior

The app checks for updates every 30 seconds by default. When a new signal is detected:

1. **Directory signals:**
   - All caches are cleared
   - File tree is reloaded from server
   - Status message: "Repository files updated!"
   - New version auto-detected when deployment completes

2. **File signals:**
   - Current session data preserved
   - User notification displayed
   - Status message: "File updated: [path]. Refresh to see changes."
   - Caches cleared only on next full page reload or version change

## Testing Your Webhook

1. Start your app: `npm run dev`
2. In another terminal, send a test signal:
   ```bash
   curl -X POST \
     -H "Content-Type: application/json" \
     -d '{
       "signal": "test",
       "type": "directory"
     }' \
     http://localhost:4000/api/refresh-signal
   ```
3. Watch the app's browser console for `[refresh]` messages
4. File tree should refresh and show notification

## Troubleshooting

### Webhook not reaching app
- Verify `APP_WEBHOOK_URL` secret is set correctly
- Check app is deployed and accessible from GitHub
- Review GitHub Actions logs for curl errors

### Updates not detected
- Check browser console for `[checkForUpdate]` and `[refresh]` messages
- Ensure update check interval hasn't been modified
- Verify `/api/refresh-signal` endpoint is accessible

### Cache not clearing
- Check browser DevTools → Application tab for cache contents
- Verify `invalidateAllCaches()` is being called
- Check for JavaScript errors in console

## Advanced Configuration

### Customize Update Check Interval

In `bin/app.js`, modify the interval (currently 30000ms = 30 seconds):
```javascript
setInterval(checkForUpdate, 30000) // Change this value
```

### Skip Cache Clearing for Specific Updates

Modify `checkForUpdate()` in `bin/app.js` to filter signals by reason or path:
```javascript
if (signal.reason === 'minor-update') {
  // Don't clear cache for minor updates
  return;
}
```

### Webhook Authentication (Optional)

For production deployments, consider adding HMAC signature verification:

1. Store a webhook secret in environment: `WEBHOOK_SECRET`
2. GitHub signs request with this secret
3. Server verifies signature before processing

See Express middleware examples for HMAC verification patterns.

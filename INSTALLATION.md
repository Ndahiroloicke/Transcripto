# Installation Guide - Meeting Transcript Saver

## Quick Installation (Developer Mode)

### Step 1: Prepare the Extension
1. Ensure all files are in the `C:\Work\Transcripto` directory
2. Verify the following files exist:
   - `manifest.json`
   - `contentScript.js`
   - `background.js`
   - `popup.html` and `popup.js`
   - `options.html` and `options.js`
   - `styles.css`
   - `icons/` folder with icon files
   - `README.md`

### Step 2: Load in Chrome
1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Enable **"Developer mode"** (toggle in top-right corner)
4. Click **"Load unpacked"** button
5. Browse to and select the `C:\Work\Transcripto` folder
6. Click **"Select Folder"**

### Step 3: Verify Installation
- The extension should appear in your extensions list
- Look for "Meeting Transcript Saver" with version 0.1.0
- The extension icon should appear in your Chrome toolbar
- If there are errors, check the "Errors" section in the extension details

## Testing the Extension

### Test on Zoom Web
1. Go to `zoom.us` and join a meeting
2. Enable captions in Zoom
3. Look for the floating "Transcript" button
4. Click to start capturing

### Test on Google Meet
1. Go to `meet.google.com` and join a meeting
2. Enable live captions
3. The extension should auto-detect and show controls

### Test on Microsoft Teams
1. Go to `teams.microsoft.com` (web version)
2. Join a meeting and enable live transcription
3. Extension should activate automatically

## Troubleshooting

### Extension Won't Load
- Check that all files are present in the directory
- Ensure `manifest.json` is valid JSON
- Look for error messages in Chrome extensions page

### Not Working on Meeting Sites
- Make sure you're using the web versions, not desktop apps
- Captions must be enabled in the meeting platform
- Check browser console for error messages

### Icons Not Showing
- Icons are SVG format, should work in modern Chrome
- If issues persist, the extension will still function without icons

## File Structure Verification

Your directory should look like this:
```
C:\Work\Transcripto/
├── manifest.json
├── contentScript.js
├── background.js
├── popup.html
├── popup.js
├── options.html
├── options.js
├── styles.css
├── icons/
│   ├── icon16.png
│   ├── icon16.svg
│   ├── icon48.png
│   ├── icon48.svg
│   ├── icon128.png
│   └── icon128.svg
├── README.md
└── INSTALLATION.md
```

## Next Steps

1. **Test Thoroughly**: Try the extension on different meeting platforms
2. **Check Permissions**: Extension only requests minimal necessary permissions
3. **Explore Settings**: Visit the options page to configure export preferences
4. **Report Issues**: Note any problems for future improvements

## Development Notes

- Extension uses Manifest V3 (latest Chrome extension format)
- All data is stored locally using `chrome.storage.local`
- No external servers or APIs are contacted
- Content scripts only run on meeting platform domains

## Uninstalling

To remove the extension:
1. Go to `chrome://extensions/`
2. Find "Meeting Transcript Saver"
3. Click "Remove"
4. Confirm deletion

All local transcript data will be removed when uninstalling.

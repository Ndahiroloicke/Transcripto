# Meeting Transcript Saver 📝

A Chrome extension that captures live meeting captions from web meeting platforms (Zoom, Google Meet, Microsoft Teams) and automatically saves transcripts locally.

## Features

### 🎯 Core Functionality
- **Live Caption Capture**: Automatically detects and captures live captions from meeting platforms
- **Real-time Saving**: Saves transcripts continuously during meetings to prevent data loss
- **Multi-platform Support**: Works with Zoom Web, Google Meet, and Microsoft Teams
- **Speaker Attribution**: Preserves speaker names when available in captions

### 📁 Export Options
- **Multiple Formats**: Export as Plain Text (.txt), Markdown (.md), or JSON (.json)
- **Auto-export**: Automatically save transcripts when meetings end
- **Manual Export**: Export current session anytime during or after meetings

### 🎛️ User Interface
- **Floating Button**: Unobtrusive capture control that appears on meeting pages
- **Live Sidebar**: View transcript in real-time during meetings
- **Extension Popup**: Quick status check and session management
- **Settings Page**: Comprehensive configuration options

### 🔧 Management Features
- **Session History**: View and manage all captured sessions
- **Storage Management**: Automatic cleanup of old sessions
- **Privacy-focused**: All data stored locally on your device

## Installation

### From Source (Development)
1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension should now appear in your extensions list

### From Chrome Web Store
*Coming soon - extension will be published after testing*

## Usage

### Quick Start
1. Join a meeting on Zoom Web, Google Meet, or Microsoft Teams
2. Enable captions in your meeting platform
3. The extension will automatically detect the meeting and show a floating "Transcript" button
4. Click the button to start capturing captions
5. Transcripts are saved automatically and can be exported anytime

### Detailed Instructions

#### Starting Capture
- **Automatic**: Extension auto-starts when captions are detected
- **Manual**: Click the floating "Transcript" button to start/stop
- **Status**: Green = recording, Red = stopped

#### Viewing Live Transcript
- Click "Show Live Transcript" in the popup to open the sidebar
- View captions in real-time with timestamps and speaker names
- Search through transcript content during meetings

#### Exporting Transcripts
- **During Meeting**: Click "Export Current Session" in popup
- **After Meeting**: Access via popup or options page
- **Bulk Export**: Export all sessions from settings page

#### Managing Sessions
- View recent sessions in extension popup
- Access full session history in options page
- Delete individual sessions or bulk cleanup old ones

## Platform Support

### Zoom Web Client
- ✅ Live captions capture
- ✅ Speaker attribution
- ✅ Auto-detection of meeting state

### Google Meet
- ✅ Live captions capture
- ✅ Speaker attribution
- ✅ Auto-detection of meeting state

### Microsoft Teams (Web)
- ✅ Live captions capture
- ✅ Speaker attribution
- ✅ Auto-detection of meeting state

### YouTube (NEW!)
- ✅ Video caption capture with auto-export
- ✅ AI-powered speaker differentiation (Person 1, Person 2)
- ✅ Video end detection with automatic transcript download
- ✅ Enhanced metadata (video title, channel, URL)
- ✅ Support for interviews, podcasts, and multi-speaker content

### Requirements
- **Meeting Platforms**: Captions must be enabled, web versions only
- **YouTube**: Enable CC (Closed Captions) on any video
- **Speaker Detection**: Works best with conversation-style content

## Settings

Access settings via the extension popup → "Settings" link.

### Export Settings
- **Auto-export**: Automatically save transcripts when meetings end
- **Default Format**: Choose between TXT, Markdown, or JSON

### Storage Settings
- **Retention Period**: How long to keep transcripts (default: 30 days)
- **Session Size Limit**: Maximum captions per session (default: 10,000)

### Session Management
- View storage statistics
- Export all sessions at once
- Clean up old sessions
- Emergency delete all data

## Privacy & Security

### Local Storage Only
- All transcripts stored locally in browser storage
- No data sent to external servers
- No cloud storage unless you manually export

### Minimal Permissions
- Only requests access to meeting platform domains
- No access to other websites or sensitive data
- Storage permission only for local transcript saving

### Data Retention
- Configurable auto-cleanup of old sessions
- Manual deletion options available
- Clear data export for portability

## Technical Details

### Architecture
- **Content Script**: Captures captions from meeting pages
- **Service Worker**: Manages storage and exports
- **Popup Interface**: Quick controls and status
- **Options Page**: Comprehensive settings

### Browser Compatibility
- Chrome 88+ (Manifest V3 required)
- Other Chromium-based browsers (Edge, Brave, etc.)

### File Structure
```
transcripto/
├── manifest.json          # Extension configuration
├── contentScript.js       # Caption capture logic
├── background.js          # Service worker for storage
├── popup.html/js          # Extension popup interface
├── options.html/js        # Settings page
├── styles.css             # UI styling
├── icons/                 # Extension icons
└── README.md              # This file
```

## Development

### Setup
1. Clone the repository
2. Load as unpacked extension in Chrome
3. Test on supported meeting platforms

### Testing Platforms
- Zoom: Join test meeting with captions enabled
- Google Meet: Use meet.google.com with live captions
- Teams: Access via teams.microsoft.com web interface

### Debugging
- Check browser console for content script logs
- Use Chrome DevTools Extensions tab for service worker logs
- Test caption detection with various meeting scenarios

## Troubleshooting

### Common Issues

#### Extension Not Working
- Ensure you're using the web version of meeting platforms
- Check that captions are enabled in the meeting
- Refresh the meeting page and try again

#### Captions Not Captured
- Verify captions are visible on the page
- Check if host has enabled captions for all participants
- Try manually starting capture via the floating button

#### Export Failed
- Check browser's download settings
- Ensure sufficient disk space
- Try exporting in a different format

#### Performance Issues
- Reduce max session size in settings
- Clear old sessions regularly
- Close unnecessary browser tabs during meetings

### Getting Help
1. Check the extension popup for status information
2. Look for error messages in browser console
3. Try disabling/re-enabling the extension
4. Clear extension data and restart

## Roadmap

### Upcoming Features
- PDF export format
- Google Drive integration
- Advanced search and filtering
- Meeting summary generation
- Action item extraction

### Future Enhancements
- Support for more meeting platforms
- Cloud sync options
- Team collaboration features
- AI-powered transcript analysis

## Contributing

This extension is currently in development. Future contributions will be welcomed once the codebase is stabilized.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This extension captures captions that are already visible on meeting platforms. Users should:
- Obtain appropriate permissions before recording meetings
- Comply with company policies and local laws
- Respect privacy of meeting participants
- Use transcripts responsibly and ethically

The extension developers are not responsible for how users employ this tool or any legal implications of its use.

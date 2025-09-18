# YouTube Testing Guide - Meeting Transcript Saver

## Overview

The extension now supports YouTube videos with enhanced features:
- ✅ **Automatic caption capture** from YouTube videos
- ✅ **Speaker differentiation** (Person 1, Person 2) using AI heuristics
- ✅ **Auto-export** when video ends
- ✅ **Enhanced metadata** including video title, channel, and URL

## How to Test YouTube Support

### Step 1: Enable the Extension
1. Load the extension in Chrome (Developer mode)
2. Ensure YouTube permissions are granted
3. Navigate to any YouTube video

### Step 2: Enable Captions on YouTube
1. Open any YouTube video
2. Click the **CC (Closed Captions)** button in the video player
3. Captions should appear at the bottom of the video
4. The extension will automatically detect captions and start capturing

### Step 3: Test Speaker Differentiation

#### Recommended Test Videos:
- **Interviews**: Search for "interview" or "podcast" on YouTube
- **Conversations**: Videos with 2-3 people talking
- **Debates**: Political debates or discussion panels
- **Talk Shows**: Late night shows with host + guest format

#### Good Test Examples:
- Any interview format video (Joe Rogan, etc.)
- TED Talks with Q&A sections
- News interviews or panel discussions
- Educational videos with multiple speakers

### Step 4: Monitor the Extension

#### Visual Indicators:
- **Floating Button**: Should appear on YouTube pages
- **Status**: Shows "Recording Video..." when active
- **Auto-Start**: Extension automatically starts when captions are detected

#### Console Monitoring:
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Look for messages like:
   ```
   Meeting Transcript Saver: Initialized for youtube
   Meeting Transcript Saver: YouTube captions now available, starting capture
   ```

### Step 5: Test Speaker Detection

The extension uses heuristics to detect speaker changes:

#### What Triggers Speaker Changes:
- **Long pauses** (3+ seconds of silence)
- **Sentence boundaries** (periods, question marks)
- **Transition words** ("yes", "well", "so", "now", etc.)
- **Text length changes** (dramatic changes in caption length)

#### Expected Behavior:
- First speaker gets labeled "Person 1"
- When speaker change is detected, switches to "Person 2"
- Alternates between Person 1 and Person 2
- Shows speaker stats in exported transcript

### Step 6: Test Auto-Export

#### Automatic Export Triggers:
- **Video ends** naturally
- **User navigates away** from video
- **Video changes** (in playlists)

#### Manual Export:
- Click extension icon → "Export Current Session"
- Or use floating button controls

### Step 7: Verify Export Quality

#### Check Export Content:
- **Metadata**: Video title, channel, URL
- **Speaker Labels**: "Person 1:", "Person 2:"
- **Timestamps**: Each caption has timestamp
- **Speaker Stats**: Summary of speaker segments

#### Export Formats:
- **TXT**: Plain text with metadata header
- **Markdown**: Formatted with headers and links
- **JSON**: Complete data structure

## Testing Scenarios

### Scenario 1: Simple Interview
1. Find a 5-10 minute interview video
2. Enable captions and let extension auto-start
3. Watch for speaker changes during conversation
4. Let video end naturally
5. Check auto-exported transcript

### Scenario 2: Multiple Videos
1. Start a playlist with captions enabled
2. Extension should handle video transitions
3. Each video gets its own transcript
4. Previous transcripts auto-export when new video starts

### Scenario 3: Manual Control
1. Start video without captions
2. Extension waits (shows "No captions detected")
3. Enable captions manually
4. Extension should start capturing within 3 seconds
5. Use floating button to stop/start manually

## Expected Results

### Good Speaker Detection:
- Clear speaker alternation in conversation videos
- Logical speaker changes at sentence boundaries
- Reasonable speaker segment counts

### Transcript Quality:
```
YouTube Video Transcript
Platform: youtube
Title: Amazing Interview with Expert
Channel: Great Channel
Video ID: dQw4w9WgXcQ
URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ
Total Captions: 45
Speakers Detected: 2
Speaker Segments: Person 1 (23), Person 2 (22)

--- TRANSCRIPT ---

[10:23:45 AM] Person 1: Welcome to our show today.
[10:23:48 AM] Person 2: Thank you for having me.
[10:23:52 AM] Person 1: So tell us about your project.
[10:23:55 AM] Person 2: Well, it all started when...
```

## Troubleshooting

### Extension Not Starting:
- Check that captions are enabled (CC button)
- Refresh the YouTube page
- Check browser console for errors

### Poor Speaker Detection:
- Works best with clear conversation patterns
- Single speaker videos will show mostly one speaker
- Very fast conversations may not switch accurately

### No Auto-Export:
- Make sure video actually ends (not paused)
- Check Downloads folder for exported files
- Try manual export via extension popup

### Captions Not Detected:
- Some videos don't have captions available
- Auto-generated captions work better than hardcoded ones
- Try different videos if captions aren't appearing

## Performance Notes

- **CPU Usage**: Minimal impact during normal playback
- **Memory**: Stores captions locally, cleans up automatically
- **Network**: No external API calls, purely local processing
- **Storage**: Transcripts saved locally in browser storage

## Future Improvements

The current implementation provides a solid foundation for:
- More sophisticated speaker identification
- Integration with YouTube's speaker metadata (when available)
- Better handling of multiple speakers (3+)
- Custom speaker naming
- Integration with YouTube playlists and channels

Test thoroughly and report any issues or unexpected behavior!

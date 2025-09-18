// background.js - Service worker for transcript management and export
'use strict';

// Session management
let activeSessions = new Map();
let settings = {
  autoExport: true,
  exportFormat: 'txt',
  retentionDays: 30,
  maxSessionSize: 10000 // max lines per session
};

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Meeting Transcript Saver installed');
  
  // Load saved settings
  try {
    const result = await chrome.storage.local.get(['mts_settings']);
    if (result.mts_settings) {
      settings = { ...settings, ...result.mts_settings };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  
  // Clean up old sessions on install
  cleanupOldSessions();
});

// Message handling from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'START_SESSION':
          await handleStartSession(message.payload, sender.tab);
          sendResponse({ success: true });
          break;
        
        case 'STOP_SESSION':
          await handleStopSession(message.payload);
          sendResponse({ success: true });
          break;
        
        case 'NEW_CAPTION':
          await handleNewCaption(message.payload);
          sendResponse({ success: true });
          break;
        
        case 'EXPORT_SESSION':
          await handleExportSession(message.payload);
          sendResponse({ success: true });
          break;
        
        case 'GET_SESSIONS':
          const sessions = await getAllSessions();
          sendResponse({ sessions });
          break;
        
        case 'DELETE_SESSION':
          await deleteSession(message.payload.sessionId);
          sendResponse({ success: true });
          break;
        
        case 'GET_SETTINGS':
          sendResponse({ settings });
          break;
        
        case 'UPDATE_SETTINGS':
          await updateSettings(message.payload);
          sendResponse({ success: true });
          break;
        
        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ error: error.message });
    }
  })();
  
  return true; // Keep message channel open for async response
});

// Handle session start
async function handleStartSession(payload, tab) {
  const { sessionId, site, videoInfo, speakerDiarizationEnabled } = payload;
  
  const session = {
    id: sessionId,
    site,
    startTime: new Date().toISOString(),
    endTime: null,
    tabId: tab?.id,
    url: tab?.url,
    title: videoInfo?.title || tab?.title || `${site} ${site === 'youtube' ? 'video' : 'meeting'}`,
    captions: [],
    isActive: true,
    // YouTube-specific metadata
    ...(site === 'youtube' && videoInfo && {
      videoInfo: {
        title: videoInfo.title,
        channel: videoInfo.channel,
        videoId: videoInfo.videoId,
        url: videoInfo.url
      },
      speakerDiarizationEnabled: speakerDiarizationEnabled || false,
      speakerStats: {
        totalSpeakers: 0,
        speakerSegments: {}
      }
    })
  };
  
  activeSessions.set(sessionId, session);
  
  // Save to storage
  await saveSession(session);
  
  // Show notification
  if (chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Meeting Transcript Saver',
      message: `Started capturing transcript for ${site} meeting`
    });
  }
  
  console.log(`Started session ${sessionId} for ${site}`);
}

// Handle session stop
async function handleStopSession(payload) {
  const { sessionId } = payload;
  const session = activeSessions.get(sessionId);
  
  if (!session) {
    console.warn(`Session ${sessionId} not found`);
    return;
  }
  
  session.isActive = false;
  session.endTime = new Date().toISOString();
  
  // Save final session state
  await saveSession(session);
  
  // Auto-export if enabled
  if (settings.autoExport) {
    await exportSession(session);
  }
  
  // Remove from active sessions
  activeSessions.delete(sessionId);
  
  console.log(`Stopped session ${sessionId}`);
}

// Handle new caption
async function handleNewCaption(payload) {
  const { sessionId, text, speaker, timestamp, site, videoInfo, speakerStats } = payload;
  let session = activeSessions.get(sessionId);
  
  if (!session) {
    // Try to recover session from storage
    session = await loadSession(sessionId);
    if (session) {
      activeSessions.set(sessionId, session);
    } else {
      console.warn(`Session ${sessionId} not found for caption`);
      return;
    }
  }
  
  // Add caption to session
  const caption = {
    text: text.trim(),
    speaker,
    timestamp,
    index: session.captions.length
  };
  
  session.captions.push(caption);
  
  // Update YouTube-specific speaker statistics
  if (site === 'youtube' && speakerStats) {
    session.speakerStats = {
      totalSpeakers: speakerStats.totalSpeakers,
      currentSpeaker: speakerStats.currentSpeaker,
      speakerSegments: session.speakerStats?.speakerSegments || {}
    };
    
    // Track speaker segment counts
    if (speaker) {
      session.speakerStats.speakerSegments[speaker] = 
        (session.speakerStats.speakerSegments[speaker] || 0) + 1;
    }
  }
  
  // Limit session size
  if (session.captions.length > settings.maxSessionSize) {
    session.captions = session.captions.slice(-settings.maxSessionSize);
  }
  
  // Save periodically (every 10 captions or 30 seconds)
  const shouldSave = session.captions.length % 10 === 0 || 
    (Date.now() - (session.lastSaved || 0)) > 30000;
  
  if (shouldSave) {
    session.lastSaved = Date.now();
    await saveSession(session);
  }
}

// Handle export request
async function handleExportSession(payload) {
  const { sessionId } = payload;
  let session = activeSessions.get(sessionId);
  
  if (!session) {
    session = await loadSession(sessionId);
  }
  
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }
  
  await exportSession(session);
}

// Save session to storage
async function saveSession(session) {
  try {
    const key = `session_${session.id}`;
    await chrome.storage.local.set({ [key]: session });
  } catch (error) {
    console.error('Failed to save session:', error);
  }
}

// Load session from storage
async function loadSession(sessionId) {
  try {
    const key = `session_${sessionId}`;
    const result = await chrome.storage.local.get([key]);
    return result[key] || null;
  } catch (error) {
    console.error('Failed to load session:', error);
    return null;
  }
}

// Get all sessions
async function getAllSessions() {
  try {
    const result = await chrome.storage.local.get(null);
    const sessions = [];
    
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith('session_') && value.id) {
        sessions.push(value);
      }
    }
    
    // Sort by start time (newest first)
    return sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  } catch (error) {
    console.error('Failed to get sessions:', error);
    return [];
  }
}

// Delete session
async function deleteSession(sessionId) {
  try {
    const key = `session_${sessionId}`;
    await chrome.storage.local.remove([key]);
    activeSessions.delete(sessionId);
  } catch (error) {
    console.error('Failed to delete session:', error);
  }
}

// Export session to file
async function exportSession(session, format = null) {
  const exportFormat = format || settings.exportFormat;
  
  try {
    let content, filename, mimeType;
    
    switch (exportFormat) {
      case 'txt':
        content = formatAsText(session);
        filename = `transcript_${session.site}_${formatDate(session.startTime)}.txt`;
        mimeType = 'text/plain';
        break;
      
      case 'md':
        content = formatAsMarkdown(session);
        filename = `transcript_${session.site}_${formatDate(session.startTime)}.md`;
        mimeType = 'text/markdown';
        break;
      
      case 'json':
        content = JSON.stringify(session, null, 2);
        filename = `transcript_${session.site}_${formatDate(session.startTime)}.json`;
        mimeType = 'application/json';
        break;
      
      default:
        throw new Error(`Unsupported export format: ${exportFormat}`);
    }
    
    // Create blob and download using data URL
    const blob = new Blob([content], { type: mimeType });
    const reader = new FileReader();
    
    return new Promise((resolve, reject) => {
      reader.onload = async () => {
        try {
          await chrome.downloads.download({
            url: reader.result,
            filename,
            saveAs: false
          });
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    
    // Show notification
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Transcript Exported',
        message: `Saved as ${filename}`
      });
    }
    
    console.log(`Exported session ${session.id} as ${filename}`);
    
  } catch (error) {
    console.error('Export failed:', error);
    
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Export Failed',
        message: `Failed to export transcript: ${error.message}`
      });
    }
  }
}

// Format session as plain text
function formatAsText(session) {
  const isYouTube = session.site === 'youtube';
  const lines = [
    isYouTube ? `YouTube Video Transcript` : `Meeting Transcript`,
    `Platform: ${session.site}`,
    `Started: ${new Date(session.startTime).toLocaleString()}`,
    session.endTime ? `Ended: ${new Date(session.endTime).toLocaleString()}` : 'Status: Active',
    session.title ? `Title: ${session.title}` : '',
    ...(isYouTube && session.videoInfo ? [
      `Channel: ${session.videoInfo.channel}`,
      `Video ID: ${session.videoInfo.videoId}`,
      `URL: ${session.videoInfo.url}`
    ] : []),
    `Total Captions: ${session.captions.length}`,
    ...(isYouTube && session.speakerStats?.totalSpeakers > 0 ? [
      `Speakers Detected: ${session.speakerStats.totalSpeakers}`,
      `Speaker Segments: ${Object.entries(session.speakerStats.speakerSegments || {})
        .map(([speaker, count]) => `${speaker} (${count})`)
        .join(', ')}`
    ] : []),
    '',
    '--- TRANSCRIPT ---',
    ''
  ];
  
  session.captions.forEach(caption => {
    const time = new Date(caption.timestamp).toLocaleTimeString();
    const speaker = caption.speaker ? `${caption.speaker}: ` : '';
    lines.push(`[${time}] ${speaker}${caption.text}`);
  });
  
  return lines.join('\n');
}

// Format session as Markdown
function formatAsMarkdown(session) {
  const isYouTube = session.site === 'youtube';
  const lines = [
    isYouTube ? `# YouTube Video Transcript` : `# Meeting Transcript`,
    '',
    `**Platform:** ${session.site}  `,
    `**Started:** ${new Date(session.startTime).toLocaleString()}  `,
    session.endTime ? `**Ended:** ${new Date(session.endTime).toLocaleString()}  ` : '**Status:** Active  ',
    session.title ? `**Title:** ${session.title}  ` : '',
    ...(isYouTube && session.videoInfo ? [
      `**Channel:** ${session.videoInfo.channel}  `,
      `**Video ID:** ${session.videoInfo.videoId}  `,
      `**URL:** [${session.videoInfo.url}](${session.videoInfo.url})  `
    ] : []),
    `**Total Captions:** ${session.captions.length}  `,
    ...(isYouTube && session.speakerStats?.totalSpeakers > 0 ? [
      `**Speakers Detected:** ${session.speakerStats.totalSpeakers}  `,
      `**Speaker Segments:** ${Object.entries(session.speakerStats.speakerSegments || {})
        .map(([speaker, count]) => `${speaker} (${count})`)
        .join(', ')}  `
    ] : []),
    '',
    '## Transcript',
    ''
  ];
  
  let currentSpeaker = null;
  
  session.captions.forEach(caption => {
    const time = new Date(caption.timestamp).toLocaleTimeString();
    
    if (caption.speaker && caption.speaker !== currentSpeaker) {
      currentSpeaker = caption.speaker;
      lines.push(`### ${currentSpeaker}`);
      lines.push('');
    }
    
    lines.push(`**${time}:** ${caption.text}`);
    lines.push('');
  });
  
  return lines.join('\n');
}

// Format date for filename
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toISOString().slice(0, 19).replace(/:/g, '-');
}

// Update settings
async function updateSettings(newSettings) {
  settings = { ...settings, ...newSettings };
  
  try {
    await chrome.storage.local.set({ mts_settings: settings });
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

// Clean up old sessions
async function cleanupOldSessions() {
  if (settings.retentionDays <= 0) return;
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - settings.retentionDays);
    
    const result = await chrome.storage.local.get(null);
    const keysToRemove = [];
    
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith('session_') && value.startTime) {
        const sessionDate = new Date(value.startTime);
        if (sessionDate < cutoffDate) {
          keysToRemove.push(key);
        }
      }
    }
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`Cleaned up ${keysToRemove.length} old sessions`);
    }
  } catch (error) {
    console.error('Failed to cleanup old sessions:', error);
  }
}

// Periodic cleanup (run every hour)
setInterval(cleanupOldSessions, 60 * 60 * 1000);

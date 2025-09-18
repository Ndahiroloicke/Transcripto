// contentScript.js - Captures live captions from meeting platforms
(() => {
  'use strict';

  // Debug logging
  console.log('🔥 Meeting Transcript Saver: Content script loaded!', window.location.href);

  // Detect current meeting platform
  const SITE = (() => {
    const hostname = location.hostname.toLowerCase();
    if (hostname.includes('zoom.us')) return 'zoom';
    if (hostname.includes('meet.google')) return 'meet';
    if (hostname.includes('teams.microsoft')) return 'teams';
    if (hostname.includes('youtube.com')) return 'youtube';
    return 'unknown';
  })();

  // Platform-specific selectors for caption elements
  const SELECTOR_MAP = {
    zoom: [
      '[data-testid="caption-content"]',
      '.caption-content',
      '.captions-container',
      '.aria-live',
      '.live-transcription-content'
    ],
    meet: [
      '[data-is-muted="false"] .captions-text',
      '.Kf2eze',
      '.captions',
      '[jsname="YSxPC"]',
      '.live-captions-panel'
    ],
    teams: [
      '.transcription-text',
      '.roster-transcript',
      '.live-captions',
      '[data-tid="live-captions"]'
    ],
    youtube: [
      '.caption-window',
      '.ytp-caption-segment',
      '.captions-text',
      '.ytp-caption-window-container',
      '.ytp-caption-window-rollup'
    ]
  };

  // State management
  let isCapturing = false;
  let lastProcessedText = '';
  let sessionId = null;
  let captionObserver = null;
  let floatingUI = null;
  let sidebar = null;

  // YouTube and speaker differentiation state
  let youtubePlayer = null;
  let videoEndObserver = null;
  let speakerDiarization = {
    enabled: SITE === 'youtube',
    speakers: new Map(), // voice patterns to speaker mapping
    currentSpeaker: null,
    speakerCount: 0,
    voiceAnalysis: {
      lastVolume: 0,
      lastPitch: 0,
      silenceThreshold: 500, // ms
      lastSpeechTime: 0
    }
  };

  // Utility functions
  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  const extractTextFromNode = (node) => {
    if (!node) return '';
    // Remove extra whitespace and normalize
    return (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ');
  };

  const findCaptionElements = () => {
    const selectors = SELECTOR_MAP[SITE] || [];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        return Array.from(elements);
      }
    }
    return [];
  };

  // YouTube-specific functions
  const getYouTubePlayer = () => {
    return document.querySelector('video') || document.getElementById('movie_player');
  };

  const getYouTubeVideoInfo = () => {
    const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer') || 
                         document.querySelector('#title h1') ||
                         document.querySelector('h1[class*="title"]');
    const channelElement = document.querySelector('#channel-name a') ||
                          document.querySelector('.ytd-channel-name a') ||
                          document.querySelector('#owner-name a');
    
    return {
      title: titleElement ? titleElement.textContent.trim() : 'YouTube Video',
      channel: channelElement ? channelElement.textContent.trim() : 'Unknown Channel',
      url: window.location.href,
      videoId: new URLSearchParams(window.location.search).get('v') || 'unknown'
    };
  };

  const setupVideoEndDetection = () => {
    const player = getYouTubePlayer();
    if (!player) {
      console.log('❌ No YouTube player found for video end detection');
      return;
    }

    youtubePlayer = player;
    console.log('🎥 Setting up video end detection for player:', player);
    
    // Multiple ways to detect video end
    
    // Method 1: Video 'ended' event
    player.addEventListener('ended', () => {
      console.log('🔚 Video ended event fired');
      handleVideoEnd();
    });
    
    // Method 2: Video 'pause' event near the end
    player.addEventListener('pause', () => {
      if (player.currentTime >= player.duration - 1) {
        console.log('⏸️ Video paused at end, treating as ended');
        handleVideoEnd();
      }
    });
    
    // Method 3: Monitor video progress
    let lastTime = 0;
    const checkVideoProgress = () => {
      if (!isCapturing || !player) return;
      
      const currentTime = player.currentTime;
      const duration = player.duration;
      
      // If video reaches 98% completion and stops progressing
      if (duration > 0 && currentTime >= duration * 0.98) {
        if (Math.abs(currentTime - lastTime) < 0.1) { // Not progressing
          console.log('🏁 Video reached end (98% + not progressing)');
          handleVideoEnd();
          return;
        }
      }
      
      lastTime = currentTime;
    };
    
    const progressInterval = setInterval(checkVideoProgress, 2000);
    
    // Method 4: Page navigation/close
    window.addEventListener('beforeunload', () => {
      console.log('🚪 Page unloading, forcing export');
      handleVideoEnd();
    });
    
    // Method 5: Monitor for video changes (playlist, autoplay, etc.)
    let lastVideoId = getYouTubeVideoInfo().videoId;
    const checkVideoChange = () => {
      const currentVideoId = getYouTubeVideoInfo().videoId;
      if (currentVideoId !== lastVideoId && isCapturing) {
        console.log('🔄 Video changed, exporting previous session');
        handleVideoEnd();
        lastVideoId = currentVideoId;
        // Auto-start for new video if captions are available
        setTimeout(() => {
          if (findCaptionElements().length > 0) {
            console.log('🆕 Starting capture for new video');
            startCapture();
          }
        }, 2000);
      }
    };
    
    setInterval(checkVideoChange, 3000);
    
    // Cleanup function
    window.addEventListener('beforeunload', () => {
      clearInterval(progressInterval);
    });
  };

  const handleVideoEnd = () => {
    console.log('🎬 Video end event triggered!', { isCapturing, SITE, sessionId });
    
    if (!isCapturing || SITE !== 'youtube') {
      console.log('❌ Not auto-exporting:', { isCapturing, SITE });
      return;
    }
    
    console.log('📥 YouTube video ended, auto-exporting transcript...');
    
    // Stop capture and export
    stopCapture();
    
    // Auto-export after a brief delay
    setTimeout(() => {
      if (sessionId) {
        console.log('📤 Sending export request for session:', sessionId);
        safeSendMessage({
          type: 'EXPORT_SESSION',
          payload: { sessionId, autoExport: true }
        }).then(() => {
          console.log('✅ Export request sent successfully');
        }).catch(error => {
          console.error('❌ Export request failed:', error);
        });
      } else {
        console.error('❌ No sessionId available for export');
      }
    }, 1000);
  };

  // Simple speaker differentiation based on text patterns and timing
  const analyzeSpeakerChange = (text, timestamp) => {
    if (!speakerDiarization.enabled) return null;
    
    const now = Date.now();
    const timeSinceLastSpeech = now - speakerDiarization.voiceAnalysis.lastSpeechTime;
    
    // Simple heuristics for speaker change detection
    const indicators = {
      longPause: timeSinceLastSpeech > 3000, // 3 second pause
      textLengthChange: Math.abs(text.length - (lastProcessedText?.length || 0)) > 20,
      punctuationPattern: /[.!?]$/.test(text.trim()),
      newSentenceStart: /^[A-Z]/.test(text.trim()),
      commonTransitions: /^(yes|no|well|so|now|okay|alright|right)\b/i.test(text.trim())
    };
    
    // Score for speaker change likelihood
    let changeScore = 0;
    if (indicators.longPause) changeScore += 3;
    if (indicators.punctuationPattern && indicators.newSentenceStart) changeScore += 2;
    if (indicators.commonTransitions) changeScore += 1;
    if (indicators.textLengthChange) changeScore += 1;
    
    // Determine if this is likely a new speaker
    const shouldChangeSpeaker = changeScore >= 3 || 
      (speakerDiarization.currentSpeaker === null) ||
      (timeSinceLastSpeech > 5000); // Definitely new speaker after 5 seconds
    
    if (shouldChangeSpeaker) {
      // Simple speaker assignment (Person 1, Person 2, etc.)
      if (speakerDiarization.currentSpeaker === null || 
          speakerDiarization.currentSpeaker === 'Person 1') {
        speakerDiarization.currentSpeaker = 'Person 2';
      } else {
        speakerDiarization.currentSpeaker = 'Person 1';
      }
      
      // Track unique speakers
      if (!speakerDiarization.speakers.has(speakerDiarization.currentSpeaker)) {
        speakerDiarization.speakers.set(speakerDiarization.currentSpeaker, {
          firstSeen: timestamp,
          segments: 0
        });
        speakerDiarization.speakerCount = speakerDiarization.speakers.size;
      }
    }
    
    speakerDiarization.voiceAnalysis.lastSpeechTime = now;
    
    if (speakerDiarization.speakers.has(speakerDiarization.currentSpeaker)) {
      speakerDiarization.speakers.get(speakerDiarization.currentSpeaker).segments++;
    }
    
    return speakerDiarization.currentSpeaker;
  };

  // Parse speaker from caption text
  const parseSpeaker = (text) => {
    // Common patterns: "John Doe: message", "John: message", "John - message"
    const patterns = [
      /^([A-Za-z0-9\s_-]{2,30})\s*:\s*(.+)$/,
      /^([A-Za-z0-9\s_-]{2,30})\s*-\s*(.+)$/,
      /^([A-Za-z0-9\s_-]{2,30})\s*>\s*(.+)$/
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          speaker: match[1].trim(),
          text: match[2].trim()
        };
      }
    }
    
    return { speaker: null, text };
  };

  // Utility function to check if extension context is valid
  const isExtensionContextValid = () => {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch (error) {
      return false;
    }
  };

  // Safe message sending with context validation
  const safeSendMessage = (message) => {
    return new Promise((resolve, reject) => {
      if (!isExtensionContextValid()) {
        console.warn('⚠️ Extension context invalidated, skipping message:', message.type);
        reject(new Error('Extension context invalidated'));
        return;
      }

      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('⚠️ Runtime error:', chrome.runtime.lastError.message);
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        console.warn('⚠️ Failed to send message:', error);
        reject(error);
      }
    });
  };

  // Process new caption text
  const processNewCaption = debounce((text) => {
    if (!text || text === lastProcessedText || !isCapturing) return;
    
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      console.warn('⚠️ Extension context invalidated, stopping caption processing');
      return;
    }
    
    // Find new content by comparing with last processed text
    let newContent = text;
    if (lastProcessedText && text.startsWith(lastProcessedText)) {
      newContent = text.slice(lastProcessedText.length).trim();
    }
    
    if (!newContent) return;
    
    const timestamp = new Date().toISOString();
    const { speaker: parsedSpeaker, text: cleanText } = parseSpeaker(newContent);
    
    // Use parsed speaker or apply speaker differentiation for YouTube
    let finalSpeaker = parsedSpeaker;
    if (!finalSpeaker && SITE === 'youtube' && speakerDiarization.enabled) {
      finalSpeaker = analyzeSpeakerChange(cleanText, timestamp);
    }
    
    const captionData = {
      site: SITE,
      text: cleanText,
      speaker: finalSpeaker,
      timestamp,
      sessionId,
      // Add YouTube-specific metadata
      ...(SITE === 'youtube' && {
        videoInfo: getYouTubeVideoInfo(),
        speakerStats: {
          totalSpeakers: speakerDiarization.speakerCount,
          currentSpeaker: speakerDiarization.currentSpeaker
        }
      })
    };

    // Send to background script safely
    safeSendMessage({
      type: 'NEW_CAPTION',
      payload: captionData
    }).catch(error => {
      console.warn('⚠️ Failed to send caption data:', error.message);
    });

    // Update sidebar if open
    if (sidebar && sidebar.isVisible) {
      updateSidebarContent(captionData);
    }

    lastProcessedText = text;
  }, 500);

  // Set up MutationObserver for caption detection
  const setupCaptionObserver = () => {
    if (captionObserver) {
      captionObserver.disconnect();
    }

    captionObserver = new MutationObserver((mutations) => {
      if (!isCapturing) return;

      const captionElements = findCaptionElements();
      if (captionElements.length === 0) return;

      // Process text from all caption elements
      const allText = captionElements
        .map(extractTextFromNode)
        .filter(text => text.length > 0)
        .join(' ');

      if (allText) {
        processNewCaption(allText);
      }
    });

    // Observe the entire document for caption changes
    captionObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  };

  // Create floating UI button
  const createFloatingUI = () => {
    if (document.getElementById('mts-floating')) return;

    const container = document.createElement('div');
    container.id = 'mts-floating';
    container.className = 'mts-floating-container';
    
    container.innerHTML = `
      <div class="mts-controls">
        <button id="mts-toggle-btn" class="mts-btn mts-btn-primary" title="Toggle Meeting Transcript Saver">
          <span class="mts-icon">📝</span>
          <span class="mts-text">Transcript</span>
        </button>
        <button id="mts-export-btn" class="mts-btn mts-btn-success" title="Export Current Transcript" style="margin-left: 8px;">
          <span class="mts-icon">💾</span>
          <span class="mts-text">Export</span>
        </button>
      </div>
      <div id="mts-status" class="mts-status"></div>
    `;

    document.body.appendChild(container);

    const toggleBtn = document.getElementById('mts-toggle-btn');
    const exportBtn = document.getElementById('mts-export-btn');
    const statusEl = document.getElementById('mts-status');

    toggleBtn.addEventListener('click', toggleCapture);
    exportBtn.addEventListener('click', () => {
      if (sessionId && isCapturing) {
        console.log('📤 Manual export requested for session:', sessionId);
        safeSendMessage({
          type: 'EXPORT_SESSION',
          payload: { sessionId, autoExport: false }
        }).then(() => {
          console.log('✅ Manual export request sent');
          exportBtn.textContent = '✓ Exported!';
          setTimeout(() => {
            exportBtn.innerHTML = '<span class="mts-icon">💾</span><span class="mts-text">Export</span>';
          }, 2000);
        }).catch(error => {
          console.error('❌ Manual export failed:', error);
          exportBtn.textContent = '❌ Failed';
          setTimeout(() => {
            exportBtn.innerHTML = '<span class="mts-icon">💾</span><span class="mts-text">Export</span>';
          }, 2000);
        });
      } else {
        console.log('❌ No active session to export');
        alert('No active transcript session to export. Start capturing first!');
      }
    });

    floatingUI = {
      container,
      toggleBtn,
      statusEl,
      updateStatus: (status, isActive) => {
        statusEl.textContent = status;
        toggleBtn.classList.toggle('mts-active', isActive);
      }
    };

    return floatingUI;
  };

  // Toggle caption capture
  const toggleCapture = () => {
    if (isCapturing) {
      stopCapture();
    } else {
      startCapture();
    }
  };

  const startCapture = () => {
    isCapturing = true;
    sessionId = `session_${Date.now()}`;
    
    // Reset speaker differentiation state
    if (SITE === 'youtube') {
      speakerDiarization.currentSpeaker = null;
      speakerDiarization.speakers.clear();
      speakerDiarization.speakerCount = 0;
      speakerDiarization.voiceAnalysis.lastSpeechTime = 0;
      
      // Set up YouTube-specific features
      setupVideoEndDetection();
    }
    
    setupCaptionObserver();
    
    if (floatingUI) {
      const status = SITE === 'youtube' ? 'Recording Video...' : 'Recording...';
      floatingUI.updateStatus(status, true);
    }

    // Notify background script with additional YouTube info
    const sessionPayload = { 
      sessionId, 
      site: SITE,
      ...(SITE === 'youtube' && {
        videoInfo: getYouTubeVideoInfo(),
        speakerDiarizationEnabled: speakerDiarization.enabled
      })
    };

    safeSendMessage({
      type: 'START_SESSION',
      payload: sessionPayload
    }).catch(error => {
      console.warn('⚠️ Failed to start session:', error.message);
    });

    console.log(`Meeting Transcript Saver: Started capturing for ${SITE}`);
  };

  const stopCapture = () => {
    isCapturing = false;
    
    if (captionObserver) {
      captionObserver.disconnect();
      captionObserver = null;
    }

    if (floatingUI) {
      floatingUI.updateStatus('Stopped', false);
    }

    // Notify background script
    safeSendMessage({
      type: 'STOP_SESSION',
      payload: { sessionId }
    }).catch(error => {
      console.warn('⚠️ Failed to stop session:', error.message);
    });

    console.log('Meeting Transcript Saver: Stopped capturing');
  };

  // Update sidebar content
  const updateSidebarContent = (captionData) => {
    if (!sidebar || !sidebar.contentEl) return;

    const entry = document.createElement('div');
    entry.className = 'mts-transcript-entry';
    
    const time = new Date(captionData.timestamp).toLocaleTimeString();
    const speaker = captionData.speaker ? `<strong>${captionData.speaker}:</strong> ` : '';
    
    entry.innerHTML = `
      <div class="mts-entry-time">${time}</div>
      <div class="mts-entry-content">${speaker}${captionData.text}</div>
    `;

    sidebar.contentEl.appendChild(entry);
    sidebar.contentEl.scrollTop = sidebar.contentEl.scrollHeight;
  };

  // Create sidebar for live transcript view
  const createSidebar = () => {
    if (document.getElementById('mts-sidebar')) return;

    const sidebar = document.createElement('div');
    sidebar.id = 'mts-sidebar';
    sidebar.className = 'mts-sidebar mts-sidebar-hidden';
    
    sidebar.innerHTML = `
      <div class="mts-sidebar-header">
        <h3>Live Transcript</h3>
        <div class="mts-sidebar-controls">
          <button id="mts-export-btn" class="mts-btn mts-btn-small">Export</button>
          <button id="mts-close-sidebar" class="mts-btn mts-btn-small">×</button>
        </div>
      </div>
      <div class="mts-sidebar-content" id="mts-transcript-content">
        <div class="mts-empty-state">Start capturing to see live transcript...</div>
      </div>
    `;

    document.body.appendChild(sidebar);

    const closeBtn = document.getElementById('mts-close-sidebar');
    const exportBtn = document.getElementById('mts-export-btn');
    const contentEl = document.getElementById('mts-transcript-content');

    closeBtn.addEventListener('click', () => toggleSidebar(false));
    exportBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'EXPORT_SESSION', payload: { sessionId } });
    });

    return {
      element: sidebar,
      contentEl,
      isVisible: false
    };
  };

  const toggleSidebar = (show = null) => {
    if (!sidebar) {
      sidebar = createSidebar();
    }

    const shouldShow = show !== null ? show : sidebar.element.classList.contains('mts-sidebar-hidden');
    
    if (shouldShow) {
      sidebar.element.classList.remove('mts-sidebar-hidden');
      sidebar.isVisible = true;
    } else {
      sidebar.element.classList.add('mts-sidebar-hidden');
      sidebar.isVisible = false;
    }
  };

  // Message handling from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'GET_STATUS':
        sendResponse({
          isCapturing,
          sessionId,
          site: SITE,
          captionElementsFound: findCaptionElements().length > 0
        });
        break;
      
      case 'TOGGLE_CAPTURE':
        toggleCapture();
        sendResponse({ success: true });
        break;
      
      case 'TOGGLE_SIDEBAR':
        toggleSidebar();
        sendResponse({ success: true });
        break;
      
      case 'FORCE_EXPORT':
        if (sessionId) {
          chrome.runtime.sendMessage({
            type: 'EXPORT_SESSION',
            payload: { sessionId }
          });
        }
        sendResponse({ success: true });
        break;
    }
  });

  // Initialize when page loads
  const initialize = () => {
    if (SITE === 'unknown') {
      console.log('Meeting Transcript Saver: Unsupported site');
      return;
    }

    // Check if extension context is valid before initializing
    if (!isExtensionContextValid()) {
      console.warn('⚠️ Extension context is invalid, please refresh the page');
      
      // Show a user-friendly notification
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        background: #ff5722 !important;
        color: white !important;
        padding: 16px 20px !important;
        border-radius: 8px !important;
        z-index: 2147483647 !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 14px !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
        max-width: 300px !important;
      `;
      notification.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px;">⚠️ Extension Reload Required</div>
        <div style="font-size: 13px; opacity: 0.9;">Please refresh this page to use Meeting Transcript Saver</div>
        <button onclick="window.location.reload()" style="
          background: rgba(255,255,255,0.2) !important;
          border: 1px solid rgba(255,255,255,0.3) !important;
          color: white !important;
          padding: 6px 12px !important;
          border-radius: 4px !important;
          margin-top: 8px !important;
          cursor: pointer !important;
          font-size: 12px !important;
        ">Refresh Page</button>
      `;
      
      document.body.appendChild(notification);
      
      // Auto-remove after 10 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 10000);
      
      return;
    }

    console.log(`🚀 Meeting Transcript Saver: Initialized for ${SITE}`);
    
    // Create UI elements
    createFloatingUI();
    
    // YouTube-specific initialization
    if (SITE === 'youtube') {
      // Wait longer for YouTube to load captions
      setTimeout(() => {
        const captionElements = findCaptionElements();
        if (captionElements.length > 0 && !isCapturing) {
          console.log('Meeting Transcript Saver: Auto-starting capture (YouTube captions detected)');
          startCapture();
        } else {
          console.log('Meeting Transcript Saver: No captions detected. Enable captions on YouTube to start transcription.');
        }
      }, 5000); // Longer delay for YouTube
      
      // Also check periodically for captions being enabled
      const captionChecker = setInterval(() => {
        if (!isCapturing && findCaptionElements().length > 0) {
          console.log('Meeting Transcript Saver: YouTube captions now available, starting capture');
          startCapture();
          clearInterval(captionChecker);
        }
      }, 3000);
      
      // Stop checking after 30 seconds
      setTimeout(() => clearInterval(captionChecker), 30000);
      
    } else {
      // Auto-start capture if captions are already visible (meeting platforms)
      setTimeout(() => {
        const captionElements = findCaptionElements();
        if (captionElements.length > 0 && !isCapturing) {
          console.log('Meeting Transcript Saver: Auto-starting capture (captions detected)');
          startCapture();
        }
      }, 2000);
    }
  };

  // Handle page navigation and cleanup
  const cleanup = () => {
    if (isCapturing) {
      stopCapture();
    }
    if (captionObserver) {
      captionObserver.disconnect();
    }
  };

  // Initialize extension
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);

})();

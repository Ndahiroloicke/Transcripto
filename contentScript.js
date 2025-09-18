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
      '.ytp-caption-window-rollup',
      '.ytp-caption-window-bottom',
      '.ytp-caption-window-top',
      '.ytp-caption-window',
      '[class*="caption"]',
      '[class*="subtitle"]',
      '.html5-video-player .captions-text',
      '.html5-video-player [class*="caption"]',
      // YouTube Shorts specific selectors
      '.reel-video-in-sequence [class*="caption"]',
      '.shorts-player [class*="caption"]',
      '.shorts-video-container [class*="caption"]',
      '#shorts-player [class*="caption"]',
      '[data-layer="4"] [class*="caption"]',
      '.caption-visual-line',
      '.ytp-caption-window-container *'
    ]
  };

  // State management
  let isCapturing = false;
  let lastProcessedText = '';
  let lastPolledText = '';
  let sessionId = null;
  let captionObserver = null;
  let captionPollingInterval = null;
  let floatingUI = null;
  let sidebar = null;

  // YouTube and speaker differentiation state
  let youtubePlayer = null;
  let videoEndObserver = null;
  let speakerDiarization = {
    enabled: false, // Disabled - causes false positives without real audio analysis
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

  // Calculate text similarity (0 = completely different, 1 = identical)
  const calculateTextSimilarity = (text1, text2) => {
    if (!text1 || !text2) return 0;
    if (text1 === text2) return 1;
    
    // Simple word-based similarity
    const words1 = text1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const words2 = text2.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    if (words1.length === 0 && words2.length === 0) return 1;
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);
    
    return commonWords.length / totalWords;
  };

  const extractTextFromNode = (node) => {
    if (!node) return '';
    // Remove extra whitespace and normalize
    return (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ');
  };

  const findCaptionElements = () => {
    const selectors = SELECTOR_MAP[SITE] || [];
    console.log(`🔍 Looking for captions with ${selectors.length} selectors for ${SITE}:`, selectors);
    
    const allElements = [];
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`✅ Found ${elements.length} elements with selector: ${selector}`);
          allElements.push(...Array.from(elements));
        }
      } catch (error) {
        console.warn(`❌ Invalid selector: ${selector}`, error);
      }
    }
    
    // Filter for elements with actual caption text content (not UI elements)
    const validElements = allElements.filter(element => {
      const text = extractTextFromNode(element);
      if (!text || text.length === 0) return false;
      
      // Filter out common non-caption elements
      const lowerText = text.toLowerCase();
      const trimmedText = text.trim();
      
      // More comprehensive filtering
      const isTimeDisplay = /^\d+:\d+(\s*\/\s*\d+:\d+)?$/.test(trimmedText);
      const isVideoMetadata = element.closest('.yt-video-attribute-view-model') !== null;
      const isPlayerControl = element.closest('.ytp-chrome-controls') !== null;
      const isVideoTitle = element.closest('#title') !== null || element.closest('.title') !== null;
      const isChannelInfo = lowerText.includes('hillsong') || lowerText.includes('soundtrack') || lowerText.includes('movie');
      const isTooltip = lowerText.includes('pull up for precise seeking') || lowerText.includes('subtitles/closed captions');
      const isPlayerUI = trimmedText.match(/^\d+\s+\d+:\d+\s*\/\s*\d+:\d+$/) || // "06 0:04 / 9:36"
                        trimmedText.match(/^\(\w\)\s+\d+:\d+\s*\/\s*\d+:\d+$/); // "(c) 0:29 / 9:36"
      
      // Only include elements that are specifically caption containers
      const isCaptionContainer = element.classList.contains('ytp-caption-segment') ||
                                element.classList.contains('caption-visual-line') ||
                                (element.classList.contains('captions-text') && 
                                 element.closest('.ytp-caption-window-container'));
      
      if (isTimeDisplay || isVideoMetadata || isPlayerControl || isVideoTitle || isChannelInfo || isTooltip || isPlayerUI) {
        console.log(`🚫 Filtered out non-caption element: "${text.substring(0, 50)}..."`);
        return false;
      }
      
      // Only return true if it's definitely a caption element AND has meaningful text
      return isCaptionContainer && text.length > 5;
    });
    
    console.log(`📝 Total valid caption elements found: ${validElements.length}`);
    
    if (validElements.length > 0) {
      validElements.forEach((element, index) => {
        const text = extractTextFromNode(element);
        console.log(`📄 Caption element ${index + 1}:`, {
          tag: element.tagName,
          className: element.className,
          text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          visible: element.offsetWidth > 0 && element.offsetHeight > 0
        });
      });
      return validElements;
    }
    
    // If no valid elements found, let's debug what's available
    console.log('🔍 No valid caption elements found. Checking for any caption-like elements...');
    const allCaptionLike = document.querySelectorAll('[class*="caption"], [class*="subtitle"], [class*="transcript"]');
    if (allCaptionLike.length > 0) {
      console.log(`📋 Found ${allCaptionLike.length} caption-like elements:`, 
        Array.from(allCaptionLike).map(el => ({
          tag: el.tagName,
          className: el.className,
          text: extractTextFromNode(el).substring(0, 50),
          visible: el.offsetWidth > 0 && el.offsetHeight > 0
        }))
      );
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
          console.error('❌ Export request failed, using local export:', error);
          // If auto-export fails due to context invalidation, export locally
          if (localTranscriptBuffer.length > 0) {
            exportLocalTranscript();
          }
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

  // Local storage for transcript data when extension context is invalid
  let localTranscriptBuffer = [];
  let contextInvalidNotificationShown = false;

  // Utility function to check if extension context is valid
  const isExtensionContextValid = () => {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch (error) {
      return false;
    }
  };

  // Store transcript data locally when context is invalid
  const storeTranscriptLocally = (data) => {
    localTranscriptBuffer.push({
      ...data,
      timestamp: new Date().toISOString(),
      localId: Date.now() + Math.random()
    });
    
    // Keep only last 100 entries to prevent memory issues
    if (localTranscriptBuffer.length > 100) {
      localTranscriptBuffer = localTranscriptBuffer.slice(-100);
    }
    
    console.log('📝 Stored transcript locally:', data.text?.substring(0, 50) + '...');
  };

  // Show the local export button when extension context is invalid
  const showLocalExportButton = () => {
    const localExportBtn = document.getElementById('mts-local-export-btn');
    if (localExportBtn) {
      localExportBtn.style.display = 'inline-flex';
      localExportBtn.title = `Download Local Transcript (${localTranscriptBuffer.length} entries)`;
    }
  };

  // Show persistent notification about context invalidation
  const showContextInvalidNotification = () => {
    if (contextInvalidNotificationShown) return;
    contextInvalidNotificationShown = true;
    
    // Show the local export button
    showLocalExportButton();
    
    const notification = document.createElement('div');
    notification.id = 'mts-context-notification';
    notification.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      background: #ff9800 !important;
      color: white !important;
      padding: 16px 20px !important;
      border-radius: 8px !important;
      z-index: 2147483647 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-size: 14px !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
      max-width: 350px !important;
      border-left: 4px solid #f57c00 !important;
    `;
    
    notification.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px;">⚠️ Extension Connection Lost</div>
      <div style="font-size: 13px; opacity: 0.9; margin-bottom: 10px;">
        Transcript is being saved locally. Your data won't be lost!<br>
        Use the orange "Local" button to download your transcript.
      </div>
      <div style="display: flex; gap: 8px;">
        <button onclick="window.location.reload()" style="
          background: rgba(255,255,255,0.2) !important;
          border: 1px solid rgba(255,255,255,0.3) !important;
          color: white !important;
          padding: 6px 12px !important;
          border-radius: 4px !important;
          cursor: pointer !important;
          font-size: 12px !important;
        ">Refresh Page</button>
        <button onclick="document.getElementById('mts-context-notification').style.display='none'" style="
          background: transparent !important;
          border: 1px solid rgba(255,255,255,0.3) !important;
          color: white !important;
          padding: 6px 12px !important;
          border-radius: 4px !important;
          cursor: pointer !important;
          font-size: 12px !important;
        ">Dismiss</button>
      </div>
    `;
    
    document.body.appendChild(notification);
  };

  // Export local transcript data as file
  const exportLocalTranscript = () => {
    if (localTranscriptBuffer.length === 0) {
      console.warn('⚠️ No local transcript data to export');
      return;
    }
    
    const videoInfo = getYouTubeVideoInfo();
    const transcript = localTranscriptBuffer
      .map(entry => `${entry.timestamp} ${entry.speaker ? entry.speaker + ':' : ''} ${entry.text}`)
      .join('\n\n');
    
    const content = `YouTube Video Transcript - Local Backup
Title: ${videoInfo?.title || 'Unknown'}
Channel: ${videoInfo?.channel || 'Unknown'}
URL: ${videoInfo?.url || window.location.href}
Date: ${new Date().toLocaleDateString()}
Time: ${new Date().toLocaleTimeString()}

Total Entries: ${localTranscriptBuffer.length}

--- TRANSCRIPT ---

${transcript}`;
    
    // Create and download file
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript_${videoInfo?.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'youtube'}_${Date.now()}.txt`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('📥 Local transcript exported successfully');
    
    // Show success message
    const successMsg = document.createElement('div');
    successMsg.style.cssText = `
      position: fixed !important;
      top: 80px !important;
      right: 20px !important;
      background: #4CAF50 !important;
      color: white !important;
      padding: 12px 16px !important;
      border-radius: 6px !important;
      z-index: 2147483648 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-size: 13px !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
    `;
    successMsg.textContent = '✅ Transcript downloaded successfully!';
    document.body.appendChild(successMsg);
    
    setTimeout(() => {
      if (successMsg.parentNode) {
        successMsg.parentNode.removeChild(successMsg);
      }
    }, 3000);
  };

  // Safe message sending with context validation and local storage fallback
  const safeSendMessage = (message) => {
    return new Promise((resolve, reject) => {
      if (!isExtensionContextValid()) {
        console.warn('⚠️ Extension context invalidated, using local storage for:', message.type);
        
        // Store transcript data locally if it's a caption
        if (message.type === 'NEW_CAPTION' && message.payload) {
          storeTranscriptLocally(message.payload);
          showContextInvalidNotification();
          resolve({ success: true, stored_locally: true });
          return;
        }
        
        // For other message types, show notification and reject
        showContextInvalidNotification();
        reject(new Error('Extension context invalidated'));
        return;
      }

      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('⚠️ Runtime error:', chrome.runtime.lastError.message);
            
            // If it's a caption and we get a runtime error, store locally
            if (message.type === 'NEW_CAPTION' && message.payload) {
              storeTranscriptLocally(message.payload);
              showContextInvalidNotification();
              resolve({ success: true, stored_locally: true });
            } else {
              reject(new Error(chrome.runtime.lastError.message));
            }
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        console.warn('⚠️ Failed to send message:', error);
        
        // If it's a caption and we get an error, store locally
        if (message.type === 'NEW_CAPTION' && message.payload) {
          storeTranscriptLocally(message.payload);
          showContextInvalidNotification();
          resolve({ success: true, stored_locally: true });
        } else {
          reject(error);
        }
      }
    });
  };

  // Process new caption text
  const processNewCaption = debounce((text) => {
    if (!text || !isCapturing) return;
    
    // Better deduplication using similarity
    const similarity = calculateTextSimilarity(text, lastProcessedText);
    if (similarity > 0.7) {
      console.log(`🔄 Skipping similar text (similarity: ${similarity.toFixed(2)})`);
      return;
    }
    
    const contextValid = isExtensionContextValid();
    if (!contextValid) {
      console.warn('⚠️ Extension context invalidated, using local storage only');
      showContextInvalidNotification();
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

    // Always store locally first
    storeTranscriptLocally(captionData);
    
    // Send to background script only if context is valid
    if (contextValid) {
      safeSendMessage({
        type: 'NEW_CAPTION',
        payload: captionData
      }).catch(error => {
        console.warn('⚠️ Failed to send caption data:', error.message);
        // Ensure local storage even if sending fails
        storeTranscriptLocally(captionData);
      });
    } else {
      console.log('📝 Stored caption locally (context invalid):', cleanText.substring(0, 50) + '...');
    }

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
      console.log(`🔄 MutationObserver triggered with ${mutations.length} mutations, isCapturing: ${isCapturing}`);
      
      if (!isCapturing) return;

      const captionElements = findCaptionElements();
      console.log(`📝 Found ${captionElements.length} caption elements in observer`);
      
      if (captionElements.length === 0) return;

      // Process text from all caption elements and deduplicate
      const captionTexts = captionElements
        .map(extractTextFromNode)
        .filter(text => text.length > 0)
        .map(text => {
          // Clean up the text - remove timestamps and duplicates
          let cleanText = text.replace(/\d+:\d+\s*\/\s*\d+:\d+/g, '').trim();
          
          // Remove excessive repetition within the same text
          const words = cleanText.split(/\s+/);
          const uniqueWords = [];
          let lastWord = '';
          let repeatCount = 0;
          
          for (const word of words) {
            if (word === lastWord) {
              repeatCount++;
              if (repeatCount < 3) { // Allow up to 2 repetitions
                uniqueWords.push(word);
              }
            } else {
              uniqueWords.push(word);
              repeatCount = 0;
            }
            lastWord = word;
          }
          
          return uniqueWords.join(' ');
        })
        .filter(text => text.length > 5);
      
      // Get the longest/most complete text (usually the most recent caption)
      const allText = captionTexts.length > 0 ? captionTexts[captionTexts.length - 1] : '';
      console.log(`📄 Cleaned caption texts: ${captionTexts.length} texts, selected: "${allText.substring(0, 100)}..."`);
      

      console.log(`📄 Extracted text from captions: "${allText.substring(0, 100)}..."`);

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
        <button id="mts-local-export-btn" class="mts-btn mts-btn-warning" title="Download Local Transcript" style="margin-left: 8px; display: none;">
          <span class="mts-icon">📥</span>
          <span class="mts-text">Local</span>
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
          // If export fails, show local export option
          showLocalExportButton();
        });
        } else {
          console.log('❌ No active session to export');
          // Check if we have local data to export
          if (localTranscriptBuffer.length > 0) {
            console.log(`📝 No active session but found ${localTranscriptBuffer.length} local entries, exporting...`);
            exportLocalTranscript();
            exportBtn.textContent = '✓ Local Export!';
            setTimeout(() => {
              exportBtn.innerHTML = '<span class="mts-icon">💾</span><span class="mts-text">Export</span>';
            }, 2000);
          } else {
            alert('No transcript data available. Make sure captions are enabled and start capturing first!');
          }
        }
    });

    // Local export button event listener
    const localExportBtn = document.getElementById('mts-local-export-btn');
    if (localExportBtn) {
      localExportBtn.addEventListener('click', () => {
        exportLocalTranscript();
      });
    }

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
      // Force check captions before starting
      console.log('🔍 Force checking captions before starting...');
      const captionElements = findCaptionElements();
      if (captionElements.length > 0) {
        console.log('✅ Captions found, starting capture');
        startCapture();
      } else {
        console.log('❌ No captions found, starting anyway (captions might appear later)');
        startCapture();
      }
    }
  };

  const startCapture = () => {
    console.log('🎬 Starting capture...');
    isCapturing = true;
    sessionId = `session_${Date.now()}`;
    console.log(`📝 Session ID: ${sessionId}, isCapturing: ${isCapturing}`);
    
    // Reset speaker differentiation state
    if (SITE === 'youtube') {
      speakerDiarization.currentSpeaker = null;
      speakerDiarization.speakers.clear();
      speakerDiarization.speakerCount = 0;
      speakerDiarization.voiceAnalysis.lastSpeechTime = 0;
      
      // Set up YouTube-specific features
      setupVideoEndDetection();
    }
    
    console.log('🔍 Setting up caption observer...');
    setupCaptionObserver();
    
    // Add polling as fallback for YouTube (captions might not trigger mutations)
    if (SITE === 'youtube') {
      console.log('⏰ Setting up caption polling for YouTube...');
      if (captionPollingInterval) {
        clearInterval(captionPollingInterval);
      }
      
      captionPollingInterval = setInterval(() => {
        if (!isCapturing) {
          clearInterval(captionPollingInterval);
          return;
        }
        
        console.log('🔍 Polling for captions...');
        const captionElements = findCaptionElements();
        console.log(`📝 Polling found ${captionElements.length} caption elements`);
        
        if (captionElements.length > 0) {
          // Process and clean caption text (same logic as MutationObserver)
          const captionTexts = captionElements
            .map(extractTextFromNode)
            .filter(text => text.length > 0)
            .map(text => {
              // Clean up the text - remove timestamps and duplicates
              let cleanText = text.replace(/\d+:\d+\s*\/\s*\d+:\d+/g, '').trim();
              
              // Remove excessive repetition within the same text
              const words = cleanText.split(/\s+/);
              const uniqueWords = [];
              let lastWord = '';
              let repeatCount = 0;
              
              for (const word of words) {
                if (word === lastWord) {
                  repeatCount++;
                  if (repeatCount < 3) { // Allow up to 2 repetitions
                    uniqueWords.push(word);
                  }
                } else {
                  uniqueWords.push(word);
                  repeatCount = 0;
                }
                lastWord = word;
              }
              
              return uniqueWords.join(' ');
            })
            .filter(text => text.length > 5);
          
          // Get the longest/most complete text (usually the most recent caption)
          const allText = captionTexts.length > 0 ? captionTexts[captionTexts.length - 1] : '';
            
          console.log(`📄 Cleaned text: "${allText.substring(0, 100)}..." (length: ${allText.length})`);
          console.log(`📄 Last polled text: "${lastPolledText.substring(0, 50)}..." (length: ${lastPolledText.length})`);
          
          // Improved text comparison - check if new text contains significantly different content
          const textSimilarity = calculateTextSimilarity(allText, lastPolledText);
          
          if (allText && textSimilarity < 0.8 && allText.length > 5) {
            console.log(`📊 NEW CAPTION TEXT DETECTED (similarity: ${textSimilarity.toFixed(2)}): "${allText.substring(0, 100)}..."`);
            processNewCaption(allText);
            lastPolledText = allText;
          } else if (textSimilarity >= 0.8) {
            console.log(`📄 Similar text as before (similarity: ${textSimilarity.toFixed(2)}), skipping...`);
          }
      } else {
        console.log('❌ No caption elements found during polling');
        // Show help message occasionally
        if (Math.random() < 0.1) { // 10% chance
          console.log('💡 TIP: Make sure captions are enabled on the YouTube video (click the CC button)');
        }
      }
      }, 500); // Poll every 500ms for better caption capture
    }
    
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
    console.log('🛑 Stopping capture...');
    isCapturing = false;
    
    if (captionObserver) {
      captionObserver.disconnect();
      captionObserver = null;
    }
    
    if (captionPollingInterval) {
      clearInterval(captionPollingInterval);
      captionPollingInterval = null;
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
      console.warn('⚠️ Extension context is invalid, continuing in local-only mode');
      showContextInvalidNotification();
      // Don't return - continue with local-only functionality
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

  // Load Python integration if available
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('extension_integration.js');
  script.onload = () => console.log('🐍 Python integration loaded');
  script.onerror = () => console.log('ℹ️  Python integration not available');
  (document.head || document.documentElement).appendChild(script);

  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);

})();

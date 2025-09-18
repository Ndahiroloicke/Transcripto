// popup.js - Popup interface logic
'use strict';

// DOM elements
let elements = {};

// Current tab and status
let currentTab = null;
let currentStatus = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  elements = {
    statusText: document.getElementById('status-text'),
    statusIndicator: document.getElementById('status-indicator'),
    platform: document.getElementById('platform'),
    captionsDetected: document.getElementById('captions-detected'),
    toggleCapture: document.getElementById('toggle-capture'),
    toggleText: document.getElementById('toggle-text'),
    toggleSidebar: document.getElementById('toggle-sidebar'),
    exportCurrent: document.getElementById('export-current'),
    sessionsList: document.getElementById('sessions-list'),
    openOptions: document.getElementById('open-options')
  };
  
  // Set up event listeners
  setupEventListeners();
  
  // Get current tab
  currentTab = await getCurrentTab();
  
  // Load initial data
  await Promise.all([
    updateStatus(),
    loadRecentSessions()
  ]);
});

// Set up event listeners
function setupEventListeners() {
  elements.toggleCapture.addEventListener('click', handleToggleCapture);
  elements.toggleSidebar.addEventListener('click', handleToggleSidebar);
  elements.exportCurrent.addEventListener('click', handleExportCurrent);
  elements.openOptions.addEventListener('click', handleOpenOptions);
}

// Get current active tab
async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  } catch (error) {
    console.error('Failed to get current tab:', error);
    return null;
  }
}

// Update status from content script
async function updateStatus() {
  if (!currentTab) {
    updateStatusUI({
      isCapturing: false,
      site: 'unknown',
      captionElementsFound: false,
      error: 'No active tab'
    });
    return;
  }
  
  // Check if we're on a supported site
  const hostname = new URL(currentTab.url || '').hostname.toLowerCase();
  const supportedSites = ['zoom.us', 'meet.google.com', 'teams.microsoft.com', 'youtube.com'];
  const isSupported = supportedSites.some(site => hostname.includes(site));
  
  if (!isSupported) {
    updateStatusUI({
      isCapturing: false,
      site: 'unsupported',
      captionElementsFound: false,
      error: 'Unsupported site'
    });
    return;
  }
  
  try {
    // Get status from content script
    const response = await chrome.tabs.sendMessage(currentTab.id, { type: 'GET_STATUS' });
    currentStatus = response;
    updateStatusUI(response);
  } catch (error) {
    console.error('Failed to get status from content script:', error);
    updateStatusUI({
      isCapturing: false,
      site: 'unknown',
      captionElementsFound: false,
      error: 'Content script not loaded'
    });
  }
}

// Update UI based on status
function updateStatusUI(status) {
  const { isCapturing, site, captionElementsFound, error } = status;
  
  // Update status indicator
  if (error) {
    elements.statusText.textContent = 'Error';
    elements.statusIndicator.className = 'status-indicator status-inactive';
    elements.platform.textContent = error;
  } else if (isCapturing) {
    elements.statusText.textContent = 'Recording';
    elements.statusIndicator.className = 'status-indicator status-active';
  } else {
    elements.statusText.textContent = 'Stopped';
    elements.statusIndicator.className = 'status-indicator status-inactive';
  }
  
  // Update platform
  if (!error) {
    const platformNames = {
      zoom: 'Zoom',
      meet: 'Google Meet',
      teams: 'Microsoft Teams',
      youtube: 'YouTube',
      unknown: 'Unknown',
      unsupported: 'Unsupported'
    };
    elements.platform.textContent = platformNames[site] || site;
  }
  
  // Update captions detection
  if (error) {
    elements.captionsDetected.textContent = 'N/A';
  } else {
    elements.captionsDetected.textContent = captionElementsFound ? 'Detected' : 'Not found';
  }
  
  // Update button states
  elements.toggleCapture.disabled = !!error;
  elements.toggleSidebar.disabled = !!error;
  elements.exportCurrent.disabled = !!error || !isCapturing;
  
  // Update toggle button text
  if (isCapturing) {
    elements.toggleText.textContent = 'Stop Capture';
    elements.toggleCapture.className = 'btn btn-danger';
  } else {
    elements.toggleText.textContent = 'Start Capture';
    elements.toggleCapture.className = 'btn btn-success';
  }
}

// Handle toggle capture
async function handleToggleCapture() {
  if (!currentTab) return;
  
  try {
    elements.toggleCapture.disabled = true;
    
    await chrome.tabs.sendMessage(currentTab.id, { type: 'TOGGLE_CAPTURE' });
    
    // Update status after a brief delay
    setTimeout(updateStatus, 500);
    
  } catch (error) {
    console.error('Failed to toggle capture:', error);
    showError('Failed to toggle capture');
  } finally {
    elements.toggleCapture.disabled = false;
  }
}

// Handle toggle sidebar
async function handleToggleSidebar() {
  if (!currentTab) return;
  
  try {
    await chrome.tabs.sendMessage(currentTab.id, { type: 'TOGGLE_SIDEBAR' });
  } catch (error) {
    console.error('Failed to toggle sidebar:', error);
    showError('Failed to toggle sidebar');
  }
}

// Handle export current session
async function handleExportCurrent() {
  if (!currentTab || !currentStatus?.sessionId) return;
  
  try {
    elements.exportCurrent.disabled = true;
    elements.exportCurrent.textContent = 'Exporting...';
    
    await chrome.runtime.sendMessage({
      type: 'EXPORT_SESSION',
      payload: { sessionId: currentStatus.sessionId }
    });
    
    elements.exportCurrent.textContent = 'Exported!';
    setTimeout(() => {
      elements.exportCurrent.textContent = 'Export Current Session';
    }, 2000);
    
  } catch (error) {
    console.error('Failed to export session:', error);
    showError('Failed to export session');
  } finally {
    elements.exportCurrent.disabled = false;
  }
}

// Handle open options
function handleOpenOptions() {
  chrome.runtime.openOptionsPage();
}

// Load recent sessions
async function loadRecentSessions() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SESSIONS' });
    const sessions = response.sessions || [];
    
    displaySessions(sessions.slice(0, 5)); // Show only last 5 sessions
    
  } catch (error) {
    console.error('Failed to load sessions:', error);
    elements.sessionsList.innerHTML = '<div class="empty-sessions">Failed to load sessions</div>';
  }
}

// Display sessions in the list
function displaySessions(sessions) {
  if (sessions.length === 0) {
    elements.sessionsList.innerHTML = '<div class="empty-sessions">No recent sessions</div>';
    return;
  }
  
  const sessionElements = sessions.map(session => {
    const startTime = new Date(session.startTime);
    const duration = session.endTime 
      ? Math.round((new Date(session.endTime) - startTime) / 1000 / 60)
      : 'Active';
    
    const platformNames = {
      zoom: 'Zoom',
      meet: 'Meet',
      teams: 'Teams',
      youtube: 'YouTube'
    };
    
    return `
      <div class="session-item">
        <div class="session-info">
          <div class="session-title">${platformNames[session.site] || session.site} - ${session.captions?.length || 0} captions</div>
          <div class="session-meta">${startTime.toLocaleDateString()} ${startTime.toLocaleTimeString()} • ${duration}${typeof duration === 'number' ? 'min' : ''}</div>
        </div>
        <div class="session-actions">
          <button class="btn btn-small btn-secondary" onclick="exportSession('${session.id}')">Export</button>
          <button class="btn btn-small btn-danger" onclick="deleteSession('${session.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
  
  elements.sessionsList.innerHTML = sessionElements;
}

// Export specific session
window.exportSession = async function(sessionId) {
  try {
    await chrome.runtime.sendMessage({
      type: 'EXPORT_SESSION',
      payload: { sessionId }
    });
    
    showSuccess('Session exported!');
    
  } catch (error) {
    console.error('Failed to export session:', error);
    showError('Failed to export session');
  }
};

// Delete specific session
window.deleteSession = async function(sessionId) {
  if (!confirm('Are you sure you want to delete this session?')) {
    return;
  }
  
  try {
    await chrome.runtime.sendMessage({
      type: 'DELETE_SESSION',
      payload: { sessionId }
    });
    
    // Reload sessions list
    await loadRecentSessions();
    
    showSuccess('Session deleted');
    
  } catch (error) {
    console.error('Failed to delete session:', error);
    showError('Failed to delete session');
  }
};

// Show error message
function showError(message) {
  // Simple error display - could be enhanced with toast notifications
  console.error(message);
  // You could add a toast notification system here
}

// Show success message
function showSuccess(message) {
  // Simple success display - could be enhanced with toast notifications
  console.log(message);
  // You could add a toast notification system here
}

// Refresh data periodically when popup is open
setInterval(async () => {
  if (document.visibilityState === 'visible') {
    await updateStatus();
  }
}, 2000);

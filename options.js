// options.js - Settings page logic
'use strict';

// Default settings
const DEFAULT_SETTINGS = {
  autoExport: true,
  exportFormat: 'txt',
  retentionDays: 30,
  maxSessionSize: 10000
};

// DOM elements
let elements = {};

// Initialize options page
document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  elements = {
    autoExport: document.getElementById('auto-export'),
    exportFormat: document.getElementById('export-format'),
    retentionDays: document.getElementById('retention-days'),
    maxSessionSize: document.getElementById('max-session-size'),
    totalSessions: document.getElementById('total-sessions'),
    totalCaptions: document.getElementById('total-captions'),
    storageUsed: document.getElementById('storage-used'),
    saveSettings: document.getElementById('save-settings'),
    resetSettings: document.getElementById('reset-settings'),
    exportAll: document.getElementById('export-all'),
    cleanupOld: document.getElementById('cleanup-old'),
    deleteAll: document.getElementById('delete-all'),
    statusMessage: document.getElementById('status-message')
  };
  
  // Set up event listeners
  setupEventListeners();
  
  // Load current settings and stats
  await Promise.all([
    loadSettings(),
    loadStats()
  ]);
});

// Set up event listeners
function setupEventListeners() {
  elements.saveSettings.addEventListener('click', handleSaveSettings);
  elements.resetSettings.addEventListener('click', handleResetSettings);
  elements.exportAll.addEventListener('click', handleExportAll);
  elements.cleanupOld.addEventListener('click', handleCleanupOld);
  elements.deleteAll.addEventListener('click', handleDeleteAll);
}

// Load current settings
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = response.settings || DEFAULT_SETTINGS;
    
    // Populate form fields
    elements.autoExport.checked = settings.autoExport;
    elements.exportFormat.value = settings.exportFormat;
    elements.retentionDays.value = settings.retentionDays;
    elements.maxSessionSize.value = settings.maxSessionSize;
    
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('Failed to load settings', 'error');
  }
}

// Load statistics
async function loadStats() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SESSIONS' });
    const sessions = response.sessions || [];
    
    // Calculate stats
    const totalSessions = sessions.length;
    const totalCaptions = sessions.reduce((sum, session) => sum + (session.captions?.length || 0), 0);
    
    // Estimate storage usage (rough calculation)
    const storageSize = sessions.reduce((sum, session) => {
      const sessionData = JSON.stringify(session);
      return sum + sessionData.length;
    }, 0);
    
    // Update UI
    elements.totalSessions.textContent = totalSessions.toLocaleString();
    elements.totalCaptions.textContent = totalCaptions.toLocaleString();
    elements.storageUsed.textContent = formatBytes(storageSize);
    
  } catch (error) {
    console.error('Failed to load stats:', error);
    elements.totalSessions.textContent = 'Error';
    elements.totalCaptions.textContent = 'Error';
    elements.storageUsed.textContent = 'Error';
  }
}

// Handle save settings
async function handleSaveSettings() {
  try {
    elements.saveSettings.disabled = true;
    elements.saveSettings.textContent = 'Saving...';
    
    // Validate inputs
    const retentionDays = parseInt(elements.retentionDays.value);
    const maxSessionSize = parseInt(elements.maxSessionSize.value);
    
    if (isNaN(retentionDays) || retentionDays < 0 || retentionDays > 365) {
      throw new Error('Retention days must be between 0 and 365');
    }
    
    if (isNaN(maxSessionSize) || maxSessionSize < 1000 || maxSessionSize > 50000) {
      throw new Error('Max session size must be between 1,000 and 50,000');
    }
    
    // Collect settings
    const settings = {
      autoExport: elements.autoExport.checked,
      exportFormat: elements.exportFormat.value,
      retentionDays,
      maxSessionSize
    };
    
    // Save settings
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: settings
    });
    
    showStatus('Settings saved successfully!', 'success');
    
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus(error.message || 'Failed to save settings', 'error');
  } finally {
    elements.saveSettings.disabled = false;
    elements.saveSettings.textContent = 'Save Settings';
  }
}

// Handle reset settings
async function handleResetSettings() {
  if (!confirm('Are you sure you want to reset all settings to defaults?')) {
    return;
  }
  
  try {
    elements.resetSettings.disabled = true;
    elements.resetSettings.textContent = 'Resetting...';
    
    // Reset to defaults
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: DEFAULT_SETTINGS
    });
    
    // Update form
    elements.autoExport.checked = DEFAULT_SETTINGS.autoExport;
    elements.exportFormat.value = DEFAULT_SETTINGS.exportFormat;
    elements.retentionDays.value = DEFAULT_SETTINGS.retentionDays;
    elements.maxSessionSize.value = DEFAULT_SETTINGS.maxSessionSize;
    
    showStatus('Settings reset to defaults', 'success');
    
  } catch (error) {
    console.error('Failed to reset settings:', error);
    showStatus('Failed to reset settings', 'error');
  } finally {
    elements.resetSettings.disabled = false;
    elements.resetSettings.textContent = 'Reset to Defaults';
  }
}

// Handle export all sessions
async function handleExportAll() {
  try {
    elements.exportAll.disabled = true;
    elements.exportAll.textContent = 'Exporting...';
    
    const response = await chrome.runtime.sendMessage({ type: 'GET_SESSIONS' });
    const sessions = response.sessions || [];
    
    if (sessions.length === 0) {
      showStatus('No sessions to export', 'error');
      return;
    }
    
    // Export each session
    let exported = 0;
    for (const session of sessions) {
      try {
        await chrome.runtime.sendMessage({
          type: 'EXPORT_SESSION',
          payload: { sessionId: session.id }
        });
        exported++;
      } catch (error) {
        console.error(`Failed to export session ${session.id}:`, error);
      }
    }
    
    showStatus(`Exported ${exported} of ${sessions.length} sessions`, 'success');
    
  } catch (error) {
    console.error('Failed to export sessions:', error);
    showStatus('Failed to export sessions', 'error');
  } finally {
    elements.exportAll.disabled = false;
    elements.exportAll.textContent = 'Export All Sessions';
  }
}

// Handle cleanup old sessions
async function handleCleanupOld() {
  const retentionDays = parseInt(elements.retentionDays.value);
  
  if (retentionDays <= 0) {
    showStatus('Cleanup is disabled when retention is set to 0 (keep forever)', 'error');
    return;
  }
  
  if (!confirm(`Are you sure you want to delete sessions older than ${retentionDays} days?`)) {
    return;
  }
  
  try {
    elements.cleanupOld.disabled = true;
    elements.cleanupOld.textContent = 'Cleaning...';
    
    const response = await chrome.runtime.sendMessage({ type: 'GET_SESSIONS' });
    const sessions = response.sessions || [];
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    let deleted = 0;
    for (const session of sessions) {
      const sessionDate = new Date(session.startTime);
      if (sessionDate < cutoffDate) {
        try {
          await chrome.runtime.sendMessage({
            type: 'DELETE_SESSION',
            payload: { sessionId: session.id }
          });
          deleted++;
        } catch (error) {
          console.error(`Failed to delete session ${session.id}:`, error);
        }
      }
    }
    
    showStatus(`Deleted ${deleted} old sessions`, 'success');
    
    // Reload stats
    await loadStats();
    
  } catch (error) {
    console.error('Failed to cleanup sessions:', error);
    showStatus('Failed to cleanup sessions', 'error');
  } finally {
    elements.cleanupOld.disabled = false;
    elements.cleanupOld.textContent = 'Clean Up Old Sessions';
  }
}

// Handle delete all sessions
async function handleDeleteAll() {
  const confirmText = 'DELETE ALL SESSIONS';
  const userInput = prompt(
    `This will permanently delete ALL transcript sessions and cannot be undone.\n\nType "${confirmText}" to confirm:`
  );
  
  if (userInput !== confirmText) {
    return;
  }
  
  try {
    elements.deleteAll.disabled = true;
    elements.deleteAll.textContent = 'Deleting...';
    
    const response = await chrome.runtime.sendMessage({ type: 'GET_SESSIONS' });
    const sessions = response.sessions || [];
    
    let deleted = 0;
    for (const session of sessions) {
      try {
        await chrome.runtime.sendMessage({
          type: 'DELETE_SESSION',
          payload: { sessionId: session.id }
        });
        deleted++;
      } catch (error) {
        console.error(`Failed to delete session ${session.id}:`, error);
      }
    }
    
    showStatus(`Deleted ${deleted} sessions`, 'success');
    
    // Reload stats
    await loadStats();
    
  } catch (error) {
    console.error('Failed to delete sessions:', error);
    showStatus('Failed to delete sessions', 'error');
  } finally {
    elements.deleteAll.disabled = false;
    elements.deleteAll.textContent = 'Delete All Sessions';
  }
}

// Show status message
function showStatus(message, type = 'success') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message status-${type}`;
  elements.statusMessage.style.display = 'block';
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    elements.statusMessage.style.display = 'none';
  }, 5000);
}

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

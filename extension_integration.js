// extension_integration.js
// Integration script to connect Chrome extension with Python transcription app

(() => {
  'use strict';

  // Configuration
  const PYTHON_APP_URL = 'http://localhost:5000';
  const INTEGRATION_ENABLED = true;

  // Integration state
  let pythonAppConnected = false;
  let integrationActive = false;

  // Check if Python app is running
  const checkPythonApp = async () => {
    try {
      const response = await fetch(`${PYTHON_APP_URL}/api/status`);
      if (response.ok) {
        pythonAppConnected = true;
        console.log('🐍 Python transcription app detected!');
        return true;
      }
    } catch (error) {
      pythonAppConnected = false;
    }
    return false;
  };

  // Send video info to Python app
  const sendVideoInfoToPython = async (videoInfo) => {
    if (!pythonAppConnected) return false;

    try {
      const response = await fetch(`${PYTHON_APP_URL}/api/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_info: videoInfo
        })
      });

      if (response.ok) {
        console.log('✅ Python app started transcription');
        return true;
      }
    } catch (error) {
      console.error('❌ Failed to start Python transcription:', error);
    }
    return false;
  };

  // Stop Python transcription
  const stopPythonTranscription = async () => {
    if (!pythonAppConnected) return false;

    try {
      const response = await fetch(`${PYTHON_APP_URL}/api/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        console.log('🛑 Python app stopped transcription');
        return true;
      }
    } catch (error) {
      console.error('❌ Failed to stop Python transcription:', error);
    }
    return false;
  };

  // Get transcript from Python app
  const getPythonTranscript = async () => {
    if (!pythonAppConnected) return null;

    try {
      const response = await fetch(`${PYTHON_APP_URL}/api/transcript`);
      if (response.ok) {
        const data = await response.json();
        return data.transcript;
      }
    } catch (error) {
      console.error('❌ Failed to get Python transcript:', error);
    }
    return null;
  };

  // Create integration UI
  const createIntegrationUI = () => {
    if (!INTEGRATION_ENABLED) return;

    // Add integration status to floating UI
    const floatingUI = document.getElementById('mts-floating');
    if (!floatingUI) return;

    // Create integration indicator
    const integrationIndicator = document.createElement('div');
    integrationIndicator.id = 'mts-python-indicator';
    integrationIndicator.style.cssText = `
      position: absolute;
      top: -8px;
      right: -8px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: ${pythonAppConnected ? '#28a745' : '#dc3545'};
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      cursor: help;
    `;
    integrationIndicator.title = pythonAppConnected 
      ? '🐍 Python transcription app connected' 
      : '🐍 Python transcription app not detected';

    floatingUI.appendChild(integrationIndicator);

    // Add integration controls
    const integrationControls = document.createElement('div');
    integrationControls.id = 'mts-integration-controls';
    integrationControls.style.cssText = `
      margin-top: 8px;
      padding: 8px;
      background: rgba(0,0,0,0.1);
      border-radius: 4px;
      font-size: 12px;
      display: ${pythonAppConnected ? 'block' : 'none'};
    `;

    integrationControls.innerHTML = `
      <div style="margin-bottom: 4px; font-weight: 600;">🐍 Python Integration</div>
      <button id="mts-python-start" style="
        background: #28a745; color: white; border: none; padding: 4px 8px;
        border-radius: 3px; font-size: 11px; margin-right: 4px; cursor: pointer;
      ">Start Python</button>
      <button id="mts-python-stop" style="
        background: #dc3545; color: white; border: none; padding: 4px 8px;
        border-radius: 3px; font-size: 11px; margin-right: 4px; cursor: pointer;
      ">Stop Python</button>
      <button id="mts-python-view" style="
        background: #007bff; color: white; border: none; padding: 4px 8px;
        border-radius: 3px; font-size: 11px; cursor: pointer;
      ">View App</button>
    `;

    floatingUI.appendChild(integrationControls);

    // Add event listeners
    document.getElementById('mts-python-start')?.addEventListener('click', async () => {
      const videoInfo = getYouTubeVideoInfo();
      const success = await sendVideoInfoToPython(videoInfo);
      if (success) {
        integrationActive = true;
        updateIntegrationStatus();
      }
    });

    document.getElementById('mts-python-stop')?.addEventListener('click', async () => {
      const success = await stopPythonTranscription();
      if (success) {
        integrationActive = false;
        updateIntegrationStatus();
      }
    });

    document.getElementById('mts-python-view')?.addEventListener('click', () => {
      window.open(PYTHON_APP_URL, '_blank');
    });
  };

  // Update integration status
  const updateIntegrationStatus = () => {
    const indicator = document.getElementById('mts-python-indicator');
    const controls = document.getElementById('mts-integration-controls');

    if (indicator) {
      indicator.style.background = pythonAppConnected ? '#28a745' : '#dc3545';
      indicator.title = pythonAppConnected 
        ? `🐍 Python app ${integrationActive ? 'recording' : 'connected'}` 
        : '🐍 Python transcription app not detected';
    }

    if (controls) {
      controls.style.display = pythonAppConnected ? 'block' : 'none';
    }
  };

  // Enhanced startCapture function with Python integration
  const originalStartCapture = window.startCapture;
  if (originalStartCapture) {
    window.startCapture = async () => {
      // Start original capture
      originalStartCapture();

      // Also start Python transcription if available
      if (pythonAppConnected && !integrationActive) {
        const videoInfo = getYouTubeVideoInfo();
        const success = await sendVideoInfoToPython(videoInfo);
        if (success) {
          integrationActive = true;
          updateIntegrationStatus();
          console.log('🐍 Python transcription started automatically');
        }
      }
    };
  }

  // Enhanced stopCapture function with Python integration
  const originalStopCapture = window.stopCapture;
  if (originalStopCapture) {
    window.stopCapture = async () => {
      // Stop original capture
      originalStopCapture();

      // Also stop Python transcription if active
      if (pythonAppConnected && integrationActive) {
        const success = await stopPythonTranscription();
        if (success) {
          integrationActive = false;
          updateIntegrationStatus();
          console.log('🐍 Python transcription stopped automatically');
        }
      }
    };
  }

  // Initialize integration
  const initializeIntegration = async () => {
    if (!INTEGRATION_ENABLED) {
      console.log('🐍 Python integration disabled');
      return;
    }

    console.log('🐍 Checking for Python transcription app...');
    
    const isConnected = await checkPythonApp();
    
    if (isConnected) {
      console.log('✅ Python transcription app is available!');
      console.log('🚀 Enhanced transcription features enabled');
      
      // Create integration UI after a delay to ensure main UI is loaded
      setTimeout(createIntegrationUI, 2000);
      
      // Periodically check connection
      setInterval(async () => {
        const wasConnected = pythonAppConnected;
        const isNowConnected = await checkPythonApp();
        
        if (wasConnected !== isNowConnected) {
          console.log(isNowConnected 
            ? '✅ Python app reconnected' 
            : '❌ Python app disconnected'
          );
          updateIntegrationStatus();
        }
      }, 10000); // Check every 10 seconds
      
    } else {
      console.log('ℹ️  Python transcription app not detected');
      console.log('💡 For enhanced transcription:');
      console.log('   1. Run: python transcription_app.py');
      console.log('   2. Open: http://localhost:5000');
      console.log('   3. Refresh this page');
    }
  };

  // Start integration when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeIntegration);
  } else {
    initializeIntegration();
  }

  // Expose integration functions globally for debugging
  window.pythonIntegration = {
    checkConnection: checkPythonApp,
    startTranscription: sendVideoInfoToPython,
    stopTranscription: stopPythonTranscription,
    getTranscript: getPythonTranscript,
    isConnected: () => pythonAppConnected,
    isActive: () => integrationActive
  };

})();

#!/usr/bin/env python3
"""
Setup script for Advanced Transcription App
Installs dependencies and sets up the environment
"""

import subprocess
import sys
import os
from pathlib import Path

def run_command(command):
    """Run a shell command and return success status"""
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {command}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {command}")
        print(f"Error: {e.stderr}")
        return False

def check_python_version():
    """Check if Python version is compatible"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print("❌ Python 3.8 or higher is required")
        return False
    print(f"✅ Python {version.major}.{version.minor}.{version.micro}")
    return True

def install_system_dependencies():
    """Install system-level dependencies"""
    print("🔧 Installing system dependencies...")
    
    # Check operating system
    if sys.platform.startswith('win'):
        print("🪟 Windows detected")
        print("📋 Please ensure you have:")
        print("   - Microsoft C++ Build Tools installed")
        print("   - Windows SDK installed")
        print("   - Audio drivers properly configured")
        
    elif sys.platform.startswith('darwin'):
        print("🍎 macOS detected")
        # Install portaudio for pyaudio
        run_command("brew install portaudio")
        
    elif sys.platform.startswith('linux'):
        print("🐧 Linux detected")
        # Install portaudio and other dependencies
        run_command("sudo apt-get update")
        run_command("sudo apt-get install -y portaudio19-dev python3-pyaudio")

def install_python_dependencies():
    """Install Python packages"""
    print("🐍 Installing Python dependencies...")
    
    # Upgrade pip first
    run_command(f"{sys.executable} -m pip install --upgrade pip")
    
    # Install basic requirements
    run_command(f"{sys.executable} -m pip install -r requirements.txt")
    
    print("📦 Core dependencies installed!")

def setup_whisper():
    """Download Whisper model"""
    print("🤖 Setting up Whisper model...")
    
    # Create a test script to download the model
    test_script = """
import whisper
print("Downloading Whisper base model...")
model = whisper.load_model("base")
print("✅ Whisper model ready!")
"""
    
    try:
        exec(test_script)
    except Exception as e:
        print(f"⚠️ Whisper setup issue: {e}")
        print("The model will be downloaded on first use.")

def setup_speaker_diarization():
    """Setup speaker diarization (optional)"""
    print("🎭 Setting up speaker diarization...")
    
    try:
        # Try to install pyannote.audio
        run_command(f"{sys.executable} -m pip install pyannote.audio")
        
        print("✅ Speaker diarization available!")
        print("📋 To use speaker diarization:")
        print("   1. Sign up at https://huggingface.co/")
        print("   2. Get your access token")
        print("   3. Add token to transcription_app.py")
        
    except Exception as e:
        print("⚠️ Speaker diarization not installed (optional)")
        print("This is optional - transcription will work without it")

def create_run_script():
    """Create a convenient run script"""
    print("📝 Creating run script...")
    
    if sys.platform.startswith('win'):
        # Windows batch file
        script_content = """@echo off
echo Starting Advanced Transcription App...
python transcription_app.py
pause
"""
        with open("run_app.bat", "w") as f:
            f.write(script_content)
        print("✅ Created run_app.bat")
        
    else:
        # Unix shell script
        script_content = """#!/bin/bash
echo "Starting Advanced Transcription App..."
python3 transcription_app.py
"""
        with open("run_app.sh", "w") as f:
            f.write(script_content)
        os.chmod("run_app.sh", 0o755)
        print("✅ Created run_app.sh")

def main():
    """Main setup function"""
    print("🚀 Advanced Transcription App Setup")
    print("=" * 50)
    
    # Check Python version
    if not check_python_version():
        sys.exit(1)
    
    # Install system dependencies
    install_system_dependencies()
    
    # Install Python dependencies
    install_python_dependencies()
    
    # Setup Whisper
    setup_whisper()
    
    # Setup speaker diarization (optional)
    setup_speaker_diarization()
    
    # Create run script
    create_run_script()
    
    print("\n🎉 Setup complete!")
    print("=" * 50)
    print("📋 Next steps:")
    print("1. Run the app: python transcription_app.py")
    print("2. Open browser: http://localhost:5000")
    print("3. Start your Chrome extension")
    print("4. Begin transcribing!")
    print("\n💡 For best results:")
    print("- Use a good microphone")
    print("- Minimize background noise")
    print("- Speak clearly")

if __name__ == "__main__":
    main()

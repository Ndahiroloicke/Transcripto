# 🎙️ Advanced Transcription App

A powerful Python companion app for the Meeting Transcript Saver Chrome extension, providing high-quality real-time audio transcription with speaker identification.

## ✨ Features

- **🎯 Real-time Audio Transcription** - Uses OpenAI Whisper for state-of-the-art accuracy
- **🎭 Speaker Diarization** - Identifies different speakers automatically (optional)
- **🌐 Web Interface** - Beautiful, responsive web UI for control and monitoring
- **⚡ Real-time Updates** - Live transcript updates via WebSocket
- **💾 Export Options** - Download transcripts in multiple formats
- **🔧 Easy Setup** - Automated installation and configuration

## 🆚 Comparison: JavaScript vs Python

### Current JavaScript Extension
- ✅ Works in browser
- ✅ No additional setup
- ❌ Limited to YouTube captions
- ❌ Poor speaker detection
- ❌ Missing content
- ❌ Dependent on caption quality

### New Python App
- ✅ **Direct audio capture** - Works with any audio source
- ✅ **Superior accuracy** - OpenAI Whisper transcription
- ✅ **Real speaker identification** - AI-powered speaker diarization
- ✅ **Complete coverage** - Captures all audio, not just captions
- ✅ **Better timing** - Precise timestamp control
- ✅ **Works everywhere** - Not limited to YouTube

## 🚀 Quick Start

### 1. Prerequisites
- **Python 3.8+** installed
- **Audio drivers** properly configured
- **Microphone access** enabled

### 2. Installation
```bash
# Clone or download the files
cd transcripto

# Run the automated setup
python setup.py
```

### 3. Run the App
```bash
# Start the transcription server
python transcription_app.py

# Or use the convenience script:
# Windows: run_app.bat
# Mac/Linux: ./run_app.sh
```

### 4. Access Web Interface
Open your browser and go to: **http://localhost:5000**

## 📋 Detailed Setup Instructions

### Windows Setup
```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Install audio dependencies (if needed)
# Download and install Microsoft C++ Build Tools
# Ensure Windows SDK is installed

# 3. Run the app
python transcription_app.py
```

### macOS Setup
```bash
# 1. Install system dependencies
brew install portaudio

# 2. Install Python dependencies
pip3 install -r requirements.txt

# 3. Run the app
python3 transcription_app.py
```

### Linux Setup
```bash
# 1. Install system dependencies
sudo apt-get update
sudo apt-get install portaudio19-dev python3-pyaudio

# 2. Install Python dependencies
pip3 install -r requirements.txt

# 3. Run the app
python3 transcription_app.py
```

## 🎛️ Usage Guide

### Starting Transcription
1. **Launch the app**: `python transcription_app.py`
2. **Open web interface**: http://localhost:5000
3. **Check status**: Ensure Whisper is loaded (green indicator)
4. **Start recording**: Click "Start Recording" button
5. **Monitor transcript**: Watch real-time transcription appear

### Integration with Chrome Extension
1. **Keep Python app running** in the background
2. **Use Chrome extension** as normal on YouTube
3. **Get enhanced transcripts** from Python app
4. **Export high-quality results** from web interface

### Export Options
- **Real-time viewing** in web interface
- **Text export** via "Export Transcript" button
- **Automatic formatting** with timestamps and speakers

## ⚙️ Configuration

### Audio Settings
Edit `transcription_app.py` to customize:
```python
# Audio capture settings
CHUNK = 1024          # Audio buffer size
RATE = 16000          # Sample rate (16kHz recommended for Whisper)
RECORD_SECONDS = 30   # Processing chunk duration
```

### Whisper Model Selection
Choose model size vs. accuracy trade-off:
```python
model_size = "base"    # Options: tiny, base, small, medium, large
```

**Model Comparison:**
- `tiny` - Fastest, least accurate
- `base` - Good balance (recommended)
- `small` - Better accuracy, slower
- `medium` - High accuracy, requires more RAM
- `large` - Best accuracy, requires GPU/lots of RAM

### Speaker Diarization Setup (Optional)
1. **Sign up** at [Hugging Face](https://huggingface.co/)
2. **Get access token** from your profile
3. **Add token** to `transcription_app.py`:
```python
self.diarization_pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token="your_token_here"  # Add your token
)
```

## 🛠️ Troubleshooting

### Common Issues

**"No audio input detected"**
- Check microphone permissions
- Verify audio device in system settings
- Try different audio input device

**"Whisper model loading failed"**
- Ensure stable internet connection for first download
- Check available disk space (models are ~100MB-1GB)
- Verify Python has write permissions

**"PyAudio installation failed"**
- **Windows**: Install Microsoft C++ Build Tools
- **macOS**: Run `brew install portaudio`
- **Linux**: Run `sudo apt-get install portaudio19-dev`

**"Permission denied" errors**
- Run with administrator/sudo privileges if needed
- Check file permissions in project directory

### Performance Optimization

**For better performance:**
- Use **GPU acceleration** if available (install CUDA)
- Choose smaller Whisper model for real-time use
- Close unnecessary applications
- Use **wired headphones** to reduce audio feedback

**For better accuracy:**
- Use **high-quality microphone**
- Minimize background noise
- Speak clearly and at consistent volume
- Use larger Whisper model if hardware permits

## 🔧 Advanced Features

### API Endpoints
The app provides REST API endpoints:
- `GET /api/status` - Get current status
- `POST /api/start` - Start transcription
- `POST /api/stop` - Stop transcription
- `GET /api/transcript` - Get current transcript
- `GET /api/export` - Export transcript file

### WebSocket Events
Real-time updates via Socket.IO:
- `status_update` - App status changes
- `new_transcript` - New transcript entries
- `connect/disconnect` - Connection events

### Custom Integration
Integrate with other applications:
```python
import requests

# Start transcription
response = requests.post('http://localhost:5000/api/start')

# Get transcript
transcript = requests.get('http://localhost:5000/api/transcript').json()
```

## 📊 System Requirements

### Minimum Requirements
- **CPU**: Dual-core 2.0GHz
- **RAM**: 4GB
- **Storage**: 2GB free space
- **OS**: Windows 10, macOS 10.14, Ubuntu 18.04+

### Recommended Requirements
- **CPU**: Quad-core 3.0GHz+
- **RAM**: 8GB+
- **Storage**: 5GB+ free space
- **GPU**: NVIDIA GPU with CUDA support (optional)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push branch: `git push origin feature-name`
5. Submit pull request

## 📄 License

This project is licensed under the MIT License - see LICENSE file for details.

## 🆘 Support

- **Documentation**: Check this README and code comments
- **Issues**: Report bugs and request features
- **Discussions**: Ask questions and share tips

## 🎯 Roadmap

- [ ] **Multi-language support** - Automatic language detection
- [ ] **Cloud integration** - Google Drive, Dropbox sync
- [ ] **Advanced export** - PDF, Word, subtitle formats
- [ ] **Meeting integration** - Zoom, Teams, Meet plugins
- [ ] **Mobile app** - iOS/Android companion
- [ ] **Team features** - Shared transcripts, collaboration

---

**Made with ❤️ for better meeting transcription**

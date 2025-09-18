#!/usr/bin/env python3
"""
Advanced Transcription App for Meeting Transcript Saver
Uses OpenAI Whisper and pyannote-audio for high-quality transcription and speaker diarization
"""

import os
import sys
import json
import time
import threading
import queue
import wave
import tempfile
from datetime import datetime
from pathlib import Path

# Audio processing
import pyaudio
import numpy as np
from scipy.io import wavfile

# ML Models
import whisper
import torch

# Web interface
from flask import Flask, render_template, request, jsonify, send_file
from flask_socketio import SocketIO, emit

# Speaker diarization (optional - requires additional setup)
try:
    from pyannote.audio import Pipeline
    DIARIZATION_AVAILABLE = True
except ImportError:
    DIARIZATION_AVAILABLE = False
    print("⚠️  Speaker diarization not available. Install pyannote-audio for speaker identification.")

class TranscriptionApp:
    def __init__(self):
        self.app = Flask(__name__, template_folder='templates')
        self.socketio = SocketIO(self.app, cors_allowed_origins="*")
        
        # Audio settings
        self.CHUNK = 1024
        self.FORMAT = pyaudio.paInt16
        self.CHANNELS = 1
        self.RATE = 16000
        self.RECORD_SECONDS = 30  # Process audio in 30-second chunks
        
        # State
        self.is_recording = False
        self.audio_queue = queue.Queue()
        self.transcript_buffer = []
        self.session_id = None
        
        # Models
        self.whisper_model = None
        self.diarization_pipeline = None
        
        # Audio interface
        self.audio = pyaudio.PyAudio()
        self.stream = None
        
        # Setup routes
        self.setup_routes()
        
    def setup_routes(self):
        """Setup Flask routes"""
        
        @self.app.route('/')
        def index():
            return render_template('index.html')
        
        @self.app.route('/api/status')
        def status():
            return jsonify({
                'is_recording': self.is_recording,
                'whisper_loaded': self.whisper_model is not None,
                'diarization_available': DIARIZATION_AVAILABLE,
                'session_id': self.session_id,
                'transcript_count': len(self.transcript_buffer)
            })
        
        @self.app.route('/api/start', methods=['POST'])
        def start_recording():
            data = request.get_json()
            video_info = data.get('video_info', {})
            
            if not self.is_recording:
                self.start_transcription(video_info)
                return jsonify({'success': True, 'message': 'Transcription started'})
            return jsonify({'success': False, 'message': 'Already recording'})
        
        @self.app.route('/api/stop', methods=['POST'])
        def stop_recording():
            if self.is_recording:
                self.stop_transcription()
                return jsonify({'success': True, 'message': 'Transcription stopped'})
            return jsonify({'success': False, 'message': 'Not recording'})
        
        @self.app.route('/api/transcript')
        def get_transcript():
            return jsonify({
                'transcript': self.transcript_buffer,
                'session_id': self.session_id
            })
        
        @self.app.route('/api/export')
        def export_transcript():
            if not self.transcript_buffer:
                return jsonify({'success': False, 'message': 'No transcript data'})
            
            # Create export file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"transcript_{timestamp}.txt"
            filepath = Path(tempfile.gettempdir()) / filename
            
            # Format transcript
            content = self.format_transcript()
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            
            return send_file(filepath, as_attachment=True, download_name=filename)
        
        # WebSocket events
        @self.socketio.on('connect')
        def handle_connect():
            print('🔌 Client connected')
            emit('status_update', self.get_status())
        
        @self.socketio.on('disconnect')
        def handle_disconnect():
            print('🔌 Client disconnected')
    
    def load_models(self):
        """Load Whisper and speaker diarization models"""
        print("🤖 Loading Whisper model...")
        
        # Load Whisper model (start with base, can upgrade to large)
        model_size = "base"  # Options: tiny, base, small, medium, large
        self.whisper_model = whisper.load_model(model_size)
        print(f"✅ Whisper model '{model_size}' loaded successfully")
        
        # Load speaker diarization if available
        if DIARIZATION_AVAILABLE:
            try:
                print("🎭 Loading speaker diarization model...")
                # Note: This requires a Hugging Face token for some models
                self.diarization_pipeline = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token="hf_..."  # You'll need to add your HF token
                )
                print("✅ Speaker diarization loaded successfully")
            except Exception as e:
                print(f"⚠️  Could not load speaker diarization: {e}")
                DIARIZATION_AVAILABLE = False
    
    def get_audio_devices(self):
        """List available audio devices"""
        devices = []
        for i in range(self.audio.get_device_count()):
            info = self.audio.get_device_info_by_index(i)
            if info['maxInputChannels'] > 0:  # Input device
                devices.append({
                    'index': i,
                    'name': info['name'],
                    'channels': info['maxInputChannels']
                })
        return devices
    
    def start_transcription(self, video_info=None):
        """Start real-time transcription"""
        if self.is_recording:
            return
        
        print("🎙️  Starting transcription...")
        
        # Load models if not already loaded
        if self.whisper_model is None:
            self.load_models()
        
        self.is_recording = True
        self.session_id = f"session_{int(time.time())}"
        self.transcript_buffer = []
        
        # Start audio recording thread
        self.recording_thread = threading.Thread(target=self._record_audio)
        self.recording_thread.daemon = True
        self.recording_thread.start()
        
        # Start transcription processing thread
        self.processing_thread = threading.Thread(target=self._process_audio)
        self.processing_thread.daemon = True
        self.processing_thread.start()
        
        # Emit status update
        self.socketio.emit('status_update', self.get_status())
        print("✅ Transcription started successfully")
    
    def stop_transcription(self):
        """Stop transcription"""
        if not self.is_recording:
            return
        
        print("🛑 Stopping transcription...")
        self.is_recording = False
        
        # Stop audio stream
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
            self.stream = None
        
        # Emit status update
        self.socketio.emit('status_update', self.get_status())
        print("✅ Transcription stopped")
    
    def _record_audio(self):
        """Record audio in chunks"""
        try:
            # Open audio stream
            self.stream = self.audio.open(
                format=self.FORMAT,
                channels=self.CHANNELS,
                rate=self.RATE,
                input=True,
                frames_per_buffer=self.CHUNK
            )
            
            print("🎤 Audio recording started")
            
            audio_buffer = []
            frames_per_chunk = int(self.RATE * self.RECORD_SECONDS / self.CHUNK)
            frame_count = 0
            
            while self.is_recording:
                try:
                    data = self.stream.read(self.CHUNK, exception_on_overflow=False)
                    audio_buffer.append(data)
                    frame_count += 1
                    
                    # Process chunk when buffer is full
                    if frame_count >= frames_per_chunk:
                        # Convert to numpy array
                        audio_data = np.frombuffer(b''.join(audio_buffer), dtype=np.int16)
                        
                        # Add to processing queue
                        self.audio_queue.put(audio_data.copy())
                        
                        # Reset buffer
                        audio_buffer = []
                        frame_count = 0
                        
                except Exception as e:
                    if self.is_recording:  # Only log if we're still supposed to be recording
                        print(f"⚠️  Audio recording error: {e}")
                    break
            
        except Exception as e:
            print(f"❌ Failed to start audio recording: {e}")
            self.is_recording = False
    
    def _process_audio(self):
        """Process audio chunks for transcription"""
        print("🔄 Audio processing started")
        
        while self.is_recording or not self.audio_queue.empty():
            try:
                # Get audio chunk (with timeout to allow checking is_recording)
                try:
                    audio_data = self.audio_queue.get(timeout=1.0)
                except queue.Empty:
                    continue
                
                # Save audio chunk to temporary file
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
                    temp_path = temp_file.name
                    
                    # Write WAV file
                    with wave.open(temp_path, 'wb') as wav_file:
                        wav_file.setnchannels(self.CHANNELS)
                        wav_file.setsampwidth(self.audio.get_sample_size(self.FORMAT))
                        wav_file.setframerate(self.RATE)
                        wav_file.writeframes(audio_data.tobytes())
                
                # Transcribe with Whisper
                print("🎯 Transcribing audio chunk...")
                result = self.whisper_model.transcribe(
                    temp_path,
                    language='en',  # Auto-detect or specify
                    task='transcribe'
                )
                
                # Process transcription result
                if result['text'].strip():
                    transcript_entry = {
                        'timestamp': datetime.now().isoformat(),
                        'text': result['text'].strip(),
                        'confidence': getattr(result, 'confidence', 0.0),
                        'speaker': None  # Will be filled by diarization if available
                    }
                    
                    # Add speaker diarization if available
                    if DIARIZATION_AVAILABLE and self.diarization_pipeline:
                        try:
                            diarization = self.diarization_pipeline(temp_path)
                            # Process diarization results (simplified)
                            speakers = list(diarization.itertracks(yield_label=True))
                            if speakers:
                                transcript_entry['speaker'] = f"Speaker {speakers[0][2]}"
                        except Exception as e:
                            print(f"⚠️  Diarization error: {e}")
                    
                    # Add to transcript buffer
                    self.transcript_buffer.append(transcript_entry)
                    
                    # Emit real-time update
                    self.socketio.emit('new_transcript', transcript_entry)
                    
                    print(f"📝 Transcribed: {transcript_entry['text'][:50]}...")
                
                # Clean up temp file
                try:
                    os.unlink(temp_path)
                except:
                    pass
                
            except Exception as e:
                print(f"❌ Transcription error: {e}")
                continue
        
        print("✅ Audio processing completed")
    
    def format_transcript(self):
        """Format transcript for export"""
        if not self.transcript_buffer:
            return "No transcript data available."
        
        lines = [
            "Advanced Audio Transcript",
            "=" * 50,
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"Session ID: {self.session_id}",
            f"Total Entries: {len(self.transcript_buffer)}",
            "",
            "--- TRANSCRIPT ---",
            ""
        ]
        
        for entry in self.transcript_buffer:
            timestamp = datetime.fromisoformat(entry['timestamp']).strftime('%H:%M:%S')
            speaker = entry.get('speaker', 'Speaker')
            text = entry['text']
            
            lines.append(f"[{timestamp}] {speaker}: {text}")
        
        return '\n'.join(lines)
    
    def get_status(self):
        """Get current app status"""
        return {
            'is_recording': self.is_recording,
            'whisper_loaded': self.whisper_model is not None,
            'diarization_available': DIARIZATION_AVAILABLE,
            'session_id': self.session_id,
            'transcript_count': len(self.transcript_buffer)
        }
    
    def run(self, host='localhost', port=5000, debug=False):
        """Run the Flask app"""
        print(f"🚀 Starting Transcription App on http://{host}:{port}")
        print("📋 Available audio devices:")
        for device in self.get_audio_devices():
            print(f"   {device['index']}: {device['name']}")
        
        self.socketio.run(self.app, host=host, port=port, debug=debug)
    
    def cleanup(self):
        """Cleanup resources"""
        self.stop_transcription()
        if self.audio:
            self.audio.terminate()

if __name__ == '__main__':
    app = TranscriptionApp()
    
    try:
        app.run(debug=True)
    except KeyboardInterrupt:
        print("\n🛑 Shutting down...")
    finally:
        app.cleanup()

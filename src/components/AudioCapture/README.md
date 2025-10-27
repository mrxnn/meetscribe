# System Audio Capture Component

This component captures system audio on Windows 11 and generates transcripts using a local Whisper model.

## Features

- **System Audio Capture**: Records all audio playing through your system (loopback recording)
- **Local Transcription**: Uses Whisper AI model running locally on your machine
- **Batch Processing**: Records first, then transcribes the complete recording
- **No Internet Required**: All processing happens locally

## How It Works

1. **Click "Start Recording"**: The app will capture all audio playing on your system
2. **Click "Stop Recording"**: The recording stops and processing begins
3. **Automatic Transcription**: The audio is automatically transcribed using Whisper
4. **View Results**: The transcript is displayed in the UI

## Technical Details

### Audio Capture Method

- Uses Electron's `desktopCapturer` API to get available audio sources
- Captures audio using `MediaRecorder` with `chromeMediaSource: 'desktop'` constraint
- Records in WebM format

### Transcription

- Uses `whisper-node` package (Node.js bindings for whisper.cpp)
- Model: `base.en` (English-optimized, ~75MB download on first use)
- Runs entirely on CPU - no GPU required
- Model is downloaded automatically on first use and cached locally

### File Handling

- Recorded audio is temporarily saved to the OS temp directory
- Files are automatically cleaned up after transcription
- No data leaves your machine

## Windows-Specific Requirements

On Windows 11, system audio capture should work out of the box. The app uses Chrome's desktop audio capture which leverages Windows' audio loopback capabilities.

### Troubleshooting

If you encounter issues:

1. **No audio sources found**: Make sure audio is actually playing on your system
2. **Permission denied**: Check that the app has permission to access media devices
3. **Model download fails**: Check your internet connection (only needed for first-time model download)
4. **Transcription errors**: Check the console logs for detailed error messages

## Model Information

The component uses the `base.en` Whisper model by default:

- Size: ~75MB
- Language: English only
- Quality: Good balance of speed and accuracy
- Download: Automatic on first use

You can change the model by modifying the `modelName` parameter in `electron/main/index.ts`:

- `tiny.en` - Fastest, lowest quality (~75MB)
- `base.en` - Good balance (~75MB) ⭐ **Default**
- `small.en` - Better quality (~244MB)
- `medium.en` - High quality (~769MB)
- `large` - Best quality, all languages (~1.5GB)

## Performance

- Recording: Minimal CPU usage
- Transcription: CPU-intensive, time varies based on:
  - Audio duration
  - CPU speed
  - Model size selected

Approximate transcription speeds (on modern CPU):

- 1 minute of audio ≈ 10-30 seconds processing time (base.en model)

## Privacy & Security

- All audio processing happens locally on your machine
- No data is sent to external servers
- Audio files are stored temporarily and deleted after transcription
- Full offline functionality after initial model download

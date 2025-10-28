# Faster-Whisper-XXL Audio Transcription - Implementation Guide

This guide shows how to integrate Faster-Whisper-XXL for local, offline speech-to-text transcription in an Electron application.

## Overview

This implementation uses:

- **Faster-Whisper-XXL** - Standalone Windows executable for fast, accurate transcription
- **Node.js `child_process.spawn`** - To run the Whisper executable from Electron
- **IPC Communication** - To handle transcription requests and progress updates
- **Local processing** - No internet required after initial model download

## Prerequisites

- Electron application
- Faster-Whisper-XXL executable (Windows only in this guide)
- Audio files in WAV format (or any format supported by Whisper)
- Basic IPC communication setup between main and renderer processes

---

## Step 1: Download and Setup Faster-Whisper-XXL

### Download the Executable

1. Visit the [Faster-Whisper Standalone Windows repository](https://github.com/Purfview/whisper-standalone-win)
2. Download the latest release: `Faster-Whisper-XXL_rXXX.X.X_windows.7z`
3. Extract the archive

### Project Structure Setup

Create a `resources` folder in your project root and place the extracted files there:

```
electron-vite-react/
├── resources/
│   └── Faster-Whisper-XXL/
│       ├── faster-whisper-xxl.exe        ← Main executable
│       ├── _xxl_data/                     ← Python libraries and dependencies
│       ├── ffmpeg.exe                     ← Audio processing
│       └── _models/                       ← Created automatically on first run
│           └── faster-whisper-base/       ← Downloaded model files
├── recordings/                            ← Your audio files
├── src/
└── electron/
```

### Add to .gitignore

Since the executable and dependencies are large (~500MB):

```gitignore
# Whisper executable and models
resources/
```

---

## Step 2: Setup IPC Communication

### Main Process (electron/main/index.ts)

Import required modules:

```typescript
import { app, BrowserWindow, ipcMain } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
```

Add the IPC handler for transcription:

```typescript
ipcMain.handle("transcribe-audio", async (event, filePath: string) => {
  try {
    // Path to the faster-whisper-xxl executable
    const whisperExePath = path.join(
      process.env.APP_ROOT || "",
      "resources",
      "Faster-Whisper-XXL",
      "faster-whisper-xxl.exe"
    );

    // Check if the executable exists
    if (!fs.existsSync(whisperExePath)) {
      throw new Error(
        `Faster-Whisper-XXL executable not found at: ${whisperExePath}\n` +
          "Please extract Faster-Whisper-XXL to the resources/Faster-Whisper-XXL folder."
      );
    }

    // Send initial progress update
    event.sender.send("transcription-progress", {
      status: "downloading",
      message: "Initializing Whisper model (first time will download model)...",
    });

    // Prepare Whisper command
    // Options: --language English, --model base (small, fast model)
    const args = [
      filePath,
      "--language",
      "English",
      "--model",
      "base",
      "--output_format",
      "txt",
      "--output_dir",
      path.dirname(filePath),
    ];

    console.log("Running Faster-Whisper-XXL:", whisperExePath);
    console.log("Arguments:", args.join(" "));

    // Spawn the Faster-Whisper process
    const whisperProcess = spawn(whisperExePath, args, {
      cwd: path.dirname(whisperExePath), // Run from the executable's directory
    });

    let outputText = "";
    let errorText = "";

    // Capture stdout
    whisperProcess.stdout.on("data", (data: Buffer) => {
      const output = data.toString();
      console.log("Whisper output:", output);

      // Send progress updates if they contain progress info
      if (output.includes("%") || output.includes("Processing")) {
        event.sender.send("transcription-progress", {
          status: "transcribing",
          message: output.trim(),
        });
      }

      outputText += output;
    });

    // Capture stderr (Whisper often outputs progress here)
    whisperProcess.stderr.on("data", (data: Buffer) => {
      const error = data.toString();
      console.log("Whisper stderr:", error);

      // Send progress updates (don't treat all stderr as errors)
      event.sender.send("transcription-progress", {
        status: "transcribing",
        message: error.trim(),
      });

      errorText += error;
    });

    // Wait for the process to complete
    const exitCode = await new Promise<number>((resolve) => {
      whisperProcess.on("close", (code) => {
        resolve(code || 0);
      });
    });

    if (exitCode !== 0) {
      throw new Error(
        `Whisper process exited with code ${exitCode}\n${errorText}`
      );
    }

    // Read the generated transcript file
    const baseName = path.basename(filePath, path.extname(filePath));
    const transcriptPath = path.join(path.dirname(filePath), `${baseName}.txt`);

    let transcriptText = "";
    if (fs.existsSync(transcriptPath)) {
      transcriptText = fs.readFileSync(transcriptPath, "utf-8");

      // Clean up the transcript file
      try {
        fs.unlinkSync(transcriptPath);
      } catch (cleanupError) {
        console.error("Error cleaning up transcript file:", cleanupError);
      }
    } else {
      // Fallback to stdout if no file was created
      transcriptText = outputText;
    }

    // Send completion progress
    event.sender.send("transcription-progress", {
      status: "complete",
      message: "Transcription complete!",
    });

    // Clean up audio file (optional)
    try {
      fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.error("Error cleaning up audio file:", cleanupError);
    }

    return {
      text: transcriptText.trim(),
    };
  } catch (error) {
    console.error("Error transcribing audio:", error);
    event.sender.send("transcription-progress", {
      status: "error",
      message: error instanceof Error ? error.message : "Transcription failed",
    });

    return {
      text: "",
      error: error instanceof Error ? error.message : "Transcription failed",
    };
  }
});
```

### Preload Script (electron/preload/index.ts)

Expose the transcription API to the renderer process:

```typescript
import { ipcRenderer, contextBridge } from "electron";

contextBridge.exposeInMainWorld("audioCapture", {
  // ... your existing APIs ...

  // Transcription APIs
  transcribeAudio: (filePath: string) =>
    ipcRenderer.invoke("transcribe-audio", filePath),
  onTranscriptionProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on("transcription-progress", (_event, progress) =>
      callback(progress)
    );
  },
  removeTranscriptionProgressListener: () => {
    ipcRenderer.removeAllListeners("transcription-progress");
  },
});
```

### TypeScript Definitions (src/type/audio.d.ts)

```typescript
export interface TranscriptionResult {
  text: string;
  error?: string;
}

export interface TranscriptionProgress {
  status: "downloading" | "transcribing" | "complete" | "error";
  progress?: number;
  message?: string;
}

export interface AudioCaptureAPI {
  transcribeAudio: (filePath: string) => Promise<TranscriptionResult>;
  onTranscriptionProgress: (
    callback: (progress: TranscriptionProgress) => void
  ) => void;
  removeTranscriptionProgressListener: () => void;
}

declare global {
  interface Window {
    audioCapture: AudioCaptureAPI;
  }
}
```

---

## Step 3: Frontend Implementation

### Component Setup (React Example)

```typescript
import { useState, useEffect } from "react";
import type { TranscriptionProgress } from "@/type/audio";

function AudioTranscription() {
  const [transcript, setTranscript] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    // Set up transcription progress listener
    window.audioCapture.onTranscriptionProgress(
      (progressData: TranscriptionProgress) => {
        setProgress(progressData);
      }
    );

    return () => {
      // Cleanup
      window.audioCapture.removeTranscriptionProgressListener();
    };
  }, []);

  const transcribeAudio = async (audioFilePath: string) => {
    try {
      setIsTranscribing(true);
      setError("");
      setTranscript("");
      setProgress(null);

      console.log("Starting transcription...");
      const result = await window.audioCapture.transcribeAudio(audioFilePath);

      if (result.error) {
        setError(result.error);
        setTranscript(`❌ Transcription failed: ${result.error}`);
      } else {
        setTranscript(result.text);
      }

      setIsTranscribing(false);
    } catch (err) {
      console.error("Error during transcription:", err);
      setError(
        err instanceof Error ? err.message : "Failed to transcribe audio"
      );
      setIsTranscribing(false);
    }
  };

  return (
    <div>
      {/* Transcription Progress */}
      {isTranscribing && (
        <div className="transcribing-status">
          <div className="spinner"></div>
          <p>{progress?.message || "Processing and transcribing audio..."}</p>
          {progress?.status && (
            <p className="progress-status">Status: {progress.status}</p>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Transcript Display */}
      {transcript && (
        <div className="transcript-container">
          <h3>📝 Transcript:</h3>
          <div className="transcript-text">{transcript}</div>
        </div>
      )}
    </div>
  );
}

export default AudioTranscription;
```

### Automatic Transcription After Recording

To automatically transcribe after recording stops:

```typescript
const processRecording = async () => {
  try {
    setIsTranscribing(true);
    setError("");
    setTranscript("");
    setProgress(null);

    // 1. Combine audio chunks
    const audioBlob = new Blob(audioChunksRef.current, {
      type: "audio/webm",
    });

    if (audioBlob.size === 0) {
      throw new Error("No audio data recorded. Please try again.");
    }

    // 2. Convert WebM to WAV
    const wavBuffer = await convertToWav(audioBlob);

    // 3. Save audio file
    const filePath = await window.audioCapture.saveAudioFile(wavBuffer);
    console.log("Audio saved to:", filePath);

    // 4. Transcribe the audio automatically
    console.log("Starting transcription...");
    const result = await window.audioCapture.transcribeAudio(filePath);

    if (result.error) {
      setError(result.error);
      setTranscript(`❌ Transcription failed: ${result.error}`);
    } else {
      setTranscript(result.text);
    }

    setIsTranscribing(false);
  } catch (err) {
    console.error("Error processing recording:", err);
    setError(
      err instanceof Error ? err.message : "Failed to process recording"
    );
    setIsTranscribing(false);
  }
};
```

---

## Step 4: Styling (Optional)

### CSS for Progress and Transcript Display

```css
.transcribing-status {
  text-align: center;
  padding: 1.5rem;
  background: rgba(102, 126, 234, 0.1);
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.transcribing-status p {
  margin: 0.5rem 0 0 0;
  color: #667eea;
  font-weight: 600;
}

.progress-status {
  font-size: 0.85rem;
  opacity: 0.8;
  margin-top: 0.25rem !important;
}

.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto;
  border: 4px solid rgba(102, 126, 234, 0.2);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.transcript-container {
  margin-top: 1.5rem;
}

.transcript-container h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #667eea;
  font-size: 1.25rem;
}

.transcript-text {
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #fff;
  line-height: 1.6;
  min-height: 100px;
  max-height: 400px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.error-message {
  padding: 1rem;
  background: rgba(255, 0, 0, 0.1);
  border: 1px solid rgba(255, 0, 0, 0.3);
  border-radius: 8px;
  color: #ff6b6b;
  margin-bottom: 1.5rem;
}
```

---

## Configuration Options

### Model Selection

Faster-Whisper-XXL supports multiple model sizes. Choose based on your needs:

| Model    | Size   | Speed     | Accuracy  | RAM Usage | Use Case                  |
| -------- | ------ | --------- | --------- | --------- | ------------------------- |
| `tiny`   | ~75MB  | Fastest   | Low       | ~1GB      | Quick drafts, testing     |
| `base`   | ~150MB | Very Fast | Good      | ~1GB      | **Default, balanced**     |
| `small`  | ~500MB | Fast      | Better    | ~2GB      | General purpose           |
| `medium` | ~1.5GB | Moderate  | Great     | ~5GB      | High accuracy needed      |
| `large`  | ~3GB   | Slow      | Best      | ~10GB     | Maximum accuracy          |
| `turbo`  | ~800MB | Fast      | Excellent | ~6GB      | New distilled model, fast |

### Change Model in Code

Edit the `args` array in `electron/main/index.ts`:

```typescript
const args = [
  filePath,
  "--language",
  "English",
  "--model",
  "base", // ← Change this: tiny, base, small, medium, large, turbo
  "--output_format",
  "txt",
  "--output_dir",
  path.dirname(filePath),
];
```

### Language Options

Faster-Whisper supports 99+ languages:

```typescript
"--language", "English"; // English
"--language", "Spanish"; // Spanish
"--language", "French"; // French
"--language", "German"; // German
"--language", "Chinese"; // Chinese
"--language", "Japanese"; // Japanese
// ... and many more
```

Or use auto-detection:

```typescript
// Remove the --language argument entirely for auto-detection
const args = [
  filePath,
  "--model",
  "base",
  "--output_format",
  "txt",
  "--output_dir",
  path.dirname(filePath),
];
```

### Advanced Options

```typescript
const args = [
  filePath,
  "--language",
  "English",
  "--model",
  "base",

  // Output format
  "--output_format",
  "txt", // Options: txt, srt, vtt, json

  // Output directory
  "--output_dir",
  path.dirname(filePath),

  // Advanced options
  "--task",
  "transcribe", // or "translate" (to English)
  "--temperature",
  "0.0", // Temperature for sampling (0.0 = deterministic)
  "--beam_size",
  "5", // Beam size for decoding (higher = more accurate, slower)
  "--vad_filter",
  "true", // Use Voice Activity Detection
  "--word_timestamps",
  "true", // Include word-level timestamps
];
```

---

## Process Flow Diagram

```
Audio Recording (WAV file)
        ↓
Save to recordings/
        ↓
Call window.audioCapture.transcribeAudio(filePath)
        ↓
IPC → Main Process
        ↓
Spawn faster-whisper-xxl.exe
        ↓
[First Time Only] Download Model (~150MB for base)
        ↓
Load Model into Memory
        ↓
Process Audio (VAD, feature extraction)
        ↓
Run Inference (CTranslate2 optimized)
        ↓
Generate Transcript
        ↓
Save to .txt file
        ↓
Read transcript file
        ↓
Send back to Renderer
        ↓
Display in UI
        ↓
Clean up temp files
```

---

## First Run Behavior

### Model Download

On the **first run** with a specific model, Faster-Whisper-XXL will:

1. Create `resources/Faster-Whisper-XXL/_models/` directory
2. Download the model from HuggingFace (~150MB for base model)
3. Save to `_models/faster-whisper-base/`
4. Load the model and start transcription

**Subsequent runs** will be instant - no download needed!

### Expected Timeline

| Action                      | First Run | Subsequent Runs |
| --------------------------- | --------- | --------------- |
| Model Download              | 1-3 min   | 0s (cached)     |
| Model Load                  | 3-5 sec   | 3-5 sec         |
| Transcription (1 min audio) | 5-10 sec  | 5-10 sec        |

---

## Performance Comparison

### Faster-Whisper-XXL vs whisper-node

| Feature          | Faster-Whisper-XXL | whisper-node      |
| ---------------- | ------------------ | ----------------- |
| Speed            | **5-10x faster**   | Baseline          |
| Memory Usage     | **Lower**          | Higher            |
| Accuracy         | **Better**         | Good              |
| Dependencies     | None (standalone)  | Python + ffmpeg   |
| GPU Acceleration | ✅ Automatic       | ⚠️ Manual setup   |
| Model Loading    | Fast (CTranslate2) | Slow (PyTorch)    |
| Production Ready | ✅ Yes             | ⚠️ Requires setup |

### Example Benchmark

For a **60-second audio file** on a modern PC:

- **Faster-Whisper-XXL (base)**: ~5-7 seconds
- **whisper-node (base)**: ~30-40 seconds
- **OpenAI Whisper API**: ~10-15 seconds (requires internet + costs money)

---

## Production Build Configuration

### Include Resources in Build

Update `electron-builder.json` to package the executable:

```json
{
  "extraResources": [
    {
      "from": "resources",
      "to": "resources",
      "filter": ["**/*"]
    }
  ]
}
```

### Update Path Resolution for Production

In `electron/main/index.ts`, handle both development and production paths:

```typescript
const whisperExePath = app.isPackaged
  ? path.join(
      process.resourcesPath,
      "resources",
      "Faster-Whisper-XXL",
      "faster-whisper-xxl.exe"
    )
  : path.join(
      process.env.APP_ROOT || "",
      "resources",
      "Faster-Whisper-XXL",
      "faster-whisper-xxl.exe"
    );
```

### Build Size Considerations

Including Faster-Whisper-XXL will increase your installer size:

- Executable + dependencies: ~500MB
- Models (downloaded separately): ~150MB-3GB (depending on model)
- Total app size: ~500MB-4GB

**Recommendation**: Don't include models in the installer. Let them download on first use.

---

## Troubleshooting

### Executable Not Found

**Error**: `Faster-Whisper-XXL executable not found`

**Solution**:

1. Verify the executable exists at `resources/Faster-Whisper-XXL/faster-whisper-xxl.exe`
2. Check the path in your code matches the folder name (case-sensitive on some systems)
3. Ensure you extracted all files from the .7z archive

### Model Download Fails

**Error**: `Failed to download model` or network errors

**Solution**:

1. Check your internet connection
2. Try a smaller model first (e.g., `tiny` or `base`)
3. Manually download models from [HuggingFace](https://huggingface.co/Systran) and place in `_models/` folder

### Slow Transcription

**Issue**: Transcription takes a long time

**Solutions**:

1. Use a smaller model (`tiny` or `base` instead of `large`)
2. Check if GPU is being used (much faster):
   - Whisper will auto-detect CUDA if available
   - Check console logs for "Using GPU" message
3. Reduce audio length
4. Enable VAD (Voice Activity Detection) to skip silence:
   ```typescript
   "--vad_filter", "true";
   ```

### High Memory Usage

**Issue**: Application uses too much RAM

**Solutions**:

1. Use a smaller model:
   - `tiny`: ~1GB RAM
   - `base`: ~1GB RAM
   - `medium`: ~5GB RAM
   - `large`: ~10GB RAM
2. Close other applications
3. Transcribe shorter audio segments

### Incorrect Transcription

**Issue**: Transcription is inaccurate

**Solutions**:

1. Use a larger model (`medium` or `large`)
2. Ensure correct language is specified
3. Improve audio quality (reduce background noise)
4. Check if audio is too quiet (boost microphone gain)
5. Try increasing beam size:
   ```typescript
   "--beam_size", "10"; // Default is 5
   ```

### Process Hangs

**Issue**: Transcription never completes

**Solutions**:

1. Check if audio file is corrupted
2. Verify audio file format is supported (WAV recommended)
3. Add timeout mechanism:
   ```typescript
   const timeout = setTimeout(() => {
     whisperProcess.kill();
     reject(new Error("Transcription timeout"));
   }, 5 * 60 * 1000); // 5 minute timeout
   ```

---

## Advanced Features

### Word-Level Timestamps

Get timestamps for each word:

```typescript
const args = [
  filePath,
  "--language",
  "English",
  "--model",
  "base",
  "--output_format",
  "json", // JSON includes timestamps
  "--word_timestamps",
  "true",
  "--output_dir",
  path.dirname(filePath),
];
```

Then parse the JSON output:

```typescript
const transcriptJson = JSON.parse(transcriptText);
transcriptJson.segments.forEach((segment) => {
  console.log(`[${segment.start}s - ${segment.end}s]: ${segment.text}`);
});
```

### Translation to English

Translate any language to English:

```typescript
const args = [
  filePath,
  "--task",
  "translate", // Instead of "transcribe"
  "--model",
  "base",
  "--output_format",
  "txt",
  "--output_dir",
  path.dirname(filePath),
];
```

### Batch Processing

Process multiple files:

```typescript
const transcribeMultipleFiles = async (filePaths: string[]) => {
  const results = [];

  for (const filePath of filePaths) {
    const result = await window.audioCapture.transcribeAudio(filePath);
    results.push({ filePath, transcript: result.text });
  }

  return results;
};
```

### GPU Acceleration

Faster-Whisper-XXL automatically uses GPU if available:

**Requirements**:

- NVIDIA GPU with CUDA support
- CUDA 11.x or 12.x installed

**Check if GPU is being used**:
Look for this in console logs:

```
Using GPU: NVIDIA GeForce RTX 3060
```

**Performance boost**: 3-5x faster with GPU!

---

## Security Considerations

### File Path Validation

Always validate file paths to prevent command injection:

```typescript
ipcMain.handle("transcribe-audio", async (event, filePath: string) => {
  // Validate file exists
  if (!fs.existsSync(filePath)) {
    throw new Error("Audio file not found");
  }

  // Validate file extension
  const ext = path.extname(filePath).toLowerCase();
  if (![".wav", ".mp3", ".m4a", ".flac"].includes(ext)) {
    throw new Error("Unsupported audio format");
  }

  // Validate file is in expected directory
  const recordingsDir = path.join(process.env.APP_ROOT || "", "recordings");
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(recordingsDir)) {
    throw new Error("Invalid file path");
  }

  // ... proceed with transcription
});
```

### Resource Limits

Prevent abuse by limiting:

```typescript
// Limit file size (e.g., 100MB)
const stats = fs.statSync(filePath);
if (stats.size > 100 * 1024 * 1024) {
  throw new Error("Audio file too large");
}

// Limit concurrent transcriptions
let activeTranscriptions = 0;
const MAX_CONCURRENT = 2;

ipcMain.handle("transcribe-audio", async (event, filePath: string) => {
  if (activeTranscriptions >= MAX_CONCURRENT) {
    throw new Error("Too many transcriptions in progress");
  }

  activeTranscriptions++;
  try {
    // ... transcription logic
  } finally {
    activeTranscriptions--;
  }
});
```

---

## Testing

### Manual Testing

1. **Record or obtain a test audio file** (WAV format recommended)
2. **Place it in the recordings folder**
3. **Trigger transcription**:
   ```typescript
   const result = await window.audioCapture.transcribeAudio(
     "C:/path/to/recordings/test.wav"
   );
   console.log(result.text);
   ```
4. **Verify output**: Check if transcript is accurate
5. **Test progress updates**: Ensure UI shows progress messages
6. **Test error handling**: Try with invalid file path

### Test Cases

- ✅ Clear speech, no background noise
- ✅ Speech with background music
- ✅ Multiple speakers
- ✅ Different languages
- ✅ Long audio (>5 minutes)
- ✅ Very short audio (<5 seconds)
- ✅ Quiet audio
- ✅ Different audio formats (WAV, MP3, etc.)

---

## Platform Support

| Platform | Status          | Notes                              |
| -------- | --------------- | ---------------------------------- |
| Windows  | ✅ Full Support | Executable provided                |
| Linux    | ✅ Full Support | Use Linux executable from releases |
| macOS    | ✅ Full Support | Use macOS executable from releases |

To support multiple platforms, detect OS and use appropriate executable:

```typescript
const getWhisperExecutable = () => {
  const platform = process.platform;

  if (platform === "win32") {
    return "faster-whisper-xxl.exe";
  } else if (platform === "linux") {
    return "faster-whisper-xxl";
  } else if (platform === "darwin") {
    return "faster-whisper-xxl";
  }

  throw new Error(`Unsupported platform: ${platform}`);
};

const whisperExePath = path.join(
  process.env.APP_ROOT || "",
  "resources",
  "Faster-Whisper-XXL",
  getWhisperExecutable()
);
```

---

## Benefits of Local Transcription

### Privacy

- ✅ All processing happens locally
- ✅ No audio sent to cloud services
- ✅ Perfect for sensitive content (medical, legal, etc.)

### Cost

- ✅ No API fees
- ✅ Unlimited transcriptions
- ✅ No subscription required

### Speed

- ✅ No network latency
- ✅ GPU acceleration available
- ✅ 5-10x faster than online services

### Reliability

- ✅ Works offline
- ✅ No rate limits
- ✅ No downtime from external services

---

## License & Attribution

This implementation uses:

- **Faster-Whisper**: [GitHub](https://github.com/guillaumekln/faster-whisper)
- **OpenAI Whisper**: [GitHub](https://github.com/openai/whisper)
- **Faster-Whisper Standalone**: [GitHub](https://github.com/Purfview/whisper-standalone-win)

Whisper is licensed under MIT by OpenAI.

---

## Additional Resources

- [Faster-Whisper Documentation](https://github.com/guillaumekln/faster-whisper)
- [OpenAI Whisper Paper](https://arxiv.org/abs/2212.04356)
- [Whisper Model Card](https://github.com/openai/whisper/blob/main/model-card.md)
- [CTranslate2 Documentation](https://opennmt.net/CTranslate2/)

---

## Quick Reference

### Command Line Usage

```bash
# Basic transcription
faster-whisper-xxl.exe audio.wav --language English --model base

# With advanced options
faster-whisper-xxl.exe audio.wav \
  --language English \
  --model medium \
  --output_format json \
  --word_timestamps true \
  --vad_filter true
```

### Programmatic Usage

```typescript
// Transcribe audio file
const result = await window.audioCapture.transcribeAudio(filePath);
console.log(result.text);

// Handle errors
if (result.error) {
  console.error("Transcription failed:", result.error);
}
```

### Model Sizes Quick Reference

```
tiny   →  75MB  → ~1GB RAM  → Fast & Draft quality
base   → 150MB  → ~1GB RAM  → Fast & Good quality ⭐ Recommended
small  → 500MB  → ~2GB RAM  → Moderate & Better quality
medium → 1.5GB  → ~5GB RAM  → Slow & Great quality
large  → 3GB    → ~10GB RAM → Slowest & Best quality
```

---

**Happy Transcribing! 🎤→📝**

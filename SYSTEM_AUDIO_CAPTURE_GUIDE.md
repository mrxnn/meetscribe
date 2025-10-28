# System Audio Capture with Microphone Mix - Implementation Guide

This guide shows how to capture both system audio and microphone audio simultaneously in an Electron application, perfect for recording calls (MS Teams, Zoom, etc.).

## Overview

This implementation uses:

- **Electron's `desktopCapturer` API** to capture system audio from a window/screen
- **Web Audio API (`AudioContext`)** to mix system audio with microphone
- **MediaRecorder API** to record the mixed audio stream

## Prerequisites

- Electron application
- React (or any frontend framework)
- Basic IPC communication setup between main and renderer processes

---

## Step 1: Setup IPC Communication

### Main Process (electron/main/index.ts)

Add the IPC handler to get available audio sources:

```typescript
import { app, BrowserWindow, ipcMain, desktopCapturer } from "electron";

// IPC Handler: Get available audio/video sources
ipcMain.handle("get-audio-sources", async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
      fetchWindowIcons: true,
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
    }));
  } catch (error) {
    console.error("Error getting audio sources:", error);
    throw error;
  }
});
```

### Preload Script (electron/preload/index.ts)

Expose the API to the renderer process:

```typescript
import { ipcRenderer, contextBridge } from "electron";

contextBridge.exposeInMainWorld("audioCapture", {
  getAudioSources: () => ipcRenderer.invoke("get-audio-sources"),
});
```

### TypeScript Definitions (optional but recommended)

```typescript
// src/type/audio.d.ts
export interface AudioSource {
  id: string;
  name: string;
  thumbnail: string;
}

declare global {
  interface Window {
    audioCapture: {
      getAudioSources: () => Promise<AudioSource[]>;
    };
  }
}
```

---

## Step 2: Capture System Audio + Microphone

### The Core Implementation

```typescript
// Create refs to store resources
const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const audioChunksRef = useRef<Blob[]>([]);
const streamRef = useRef<MediaStream | null>(null);
const audioContextRef = useRef<AudioContext | null>(null);

/**
 * Captures both system audio and microphone, mixes them together
 */
const startRecording = async () => {
  try {
    // 1. Get available audio sources
    const sources = await window.audioCapture.getAudioSources();

    if (!sources || sources.length === 0) {
      throw new Error("No audio sources available");
    }

    // 2. Find screen source (or use first available)
    const screenSource = sources.find(
      (source) =>
        source.name.includes("Screen") || source.name.includes("screen")
    );
    const sourceId = screenSource ? screenSource.id : sources[0].id;

    // 3. Capture system audio stream (requires video constraint)
    const systemStream = await (navigator.mediaDevices as any).getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
        },
      },
    });

    // 4. Stop video tracks (we only need audio)
    systemStream
      .getVideoTracks()
      .forEach((track: MediaStreamTrack) => track.stop());

    // 5. Capture microphone stream
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // 6. Mix both streams using Web Audio API with volume control
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const systemSource = audioContext.createMediaStreamSource(systemStream);
    const micSource = audioContext.createMediaStreamSource(micStream);

    // Create gain nodes for volume control
    const systemGain = audioContext.createGain();
    const micGain = audioContext.createGain();

    // Adjust volumes (keep system audio at 100%, boost microphone to 200%)
    systemGain.gain.value = 1.0; // System audio at original volume
    micGain.gain.value = 2.0; // Boost microphone to 2x volume

    const destination = audioContext.createMediaStreamDestination();

    // Connect: source → gain → destination
    systemSource.connect(systemGain);
    systemGain.connect(destination);

    micSource.connect(micGain);
    micGain.connect(destination);

    console.log(
      "✅ Mixed stream created: System Audio + Microphone (Mic boosted 2x)"
    );

    // 7. Store the mixed stream
    streamRef.current = destination.stream;
    audioChunksRef.current = [];

    // 8. Create MediaRecorder from mixed stream
    const mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType: "audio/webm",
    });

    // 9. Handle data availability
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    // 10. Handle recording stop
    mediaRecorder.onstop = async () => {
      await processRecording();
    };

    // 11. Start recording
    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;

    console.log("🎤 Recording started");
  } catch (error) {
    console.error("Error starting recording:", error);
    throw error;
  }
};
```

---

## Step 3: Stop Recording & Cleanup

```typescript
const stopRecording = () => {
  if (mediaRecorderRef.current) {
    // Stop the recorder
    mediaRecorderRef.current.stop();

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    // Close and cleanup AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      console.log("🔊 AudioContext closed");
    }

    console.log("⏹️ Recording stopped");
  }
};
```

---

## Step 4: Process & Save Recording

```typescript
const convertToWav = async (audioBlob: Blob): Promise<ArrayBuffer> => {
  // Decode the audio blob
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Get audio data
  const numberOfChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length * numberOfChannels * 2;

  // Create WAV file buffer
  const wavBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(wavBuffer);

  // Write WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, length, true);

  // Write audio data
  const offset = 44;
  const channels = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  let index = 0;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      view.setInt16(
        offset + index,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      index += 2;
    }
  }

  await audioContext.close();
  return wavBuffer;
};

const processRecording = async () => {
  try {
    // Combine all recorded chunks
    const audioBlob = new Blob(audioChunksRef.current, {
      type: "audio/webm",
    });

    console.log("Audio blob size:", audioBlob.size, "bytes");

    // Convert WebM to WAV
    const wavBuffer = await convertToWav(audioBlob);

    // Save to file (via IPC if using Electron)
    const filePath = await saveAudioFile(wavBuffer);

    console.log("✅ Recording saved:", filePath);

    return filePath;
  } catch (error) {
    console.error("Error processing recording:", error);
    throw error;
  }
};
```

### Optional: Save File via Electron IPC

**Main Process:**

```typescript
import fs from "fs";
import os from "os";
import path from "path";

ipcMain.handle("save-audio-file", async (_event, audioBuffer: ArrayBuffer) => {
  try {
    // Create recordings directory in project root
    const recordingsDir = path.join(process.env.APP_ROOT || "", "recordings");

    // Create the directory if it doesn't exist
    if (!fs.existsSync(recordingsDir)) {
      fs.mkdirSync(recordingsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const date = new Date(timestamp);
    const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = date.toTimeString().slice(0, 8).replace(/:/g, "-"); // HH-MM-SS
    const fileName = `recording_${dateStr}_${timeStr}.wav`;
    const filePath = path.join(recordingsDir, fileName);

    const buffer = Buffer.from(audioBuffer);
    fs.writeFileSync(filePath, buffer);

    console.log("Audio file saved:", filePath);
    return filePath;
  } catch (error) {
    console.error("Error saving audio file:", error);
    throw error;
  }
});
```

**Preload:**

```typescript
contextBridge.exposeInMainWorld("audioCapture", {
  getAudioSources: () => ipcRenderer.invoke("get-audio-sources"),
  saveAudioFile: (audioBuffer: ArrayBuffer) =>
    ipcRenderer.invoke("save-audio-file", audioBuffer),
});
```

---

## Step 5: Component Cleanup (React Example)

```typescript
useEffect(() => {
  return () => {
    // Cleanup on unmount
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
  };
}, []);
```

---

## Complete Working Example

Here's a minimal React component:

```typescript
import { useRef, useEffect } from "react";

function AudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const startRecording = async () => {
    const sources = await window.audioCapture.getAudioSources();
    const sourceId = sources[0].id;

    const systemStream = await (navigator.mediaDevices as any).getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId,
        },
      },
    });

    systemStream
      .getVideoTracks()
      .forEach((track: MediaStreamTrack) => track.stop());

    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const systemSource = audioContext.createMediaStreamSource(systemStream);
    const micSource = audioContext.createMediaStreamSource(micStream);

    // Create gain nodes for volume control
    const systemGain = audioContext.createGain();
    const micGain = audioContext.createGain();
    systemGain.gain.value = 1.0; // System audio at original volume
    micGain.gain.value = 2.0; // Boost microphone to 2x volume

    const destination = audioContext.createMediaStreamDestination();

    systemSource.connect(systemGain);
    systemGain.connect(destination);
    micSource.connect(micGain);
    micGain.connect(destination);

    streamRef.current = destination.stream;
    audioChunksRef.current = [];

    const mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType: "audio/webm",
    });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const arrayBuffer = await blob.arrayBuffer();
      const filePath = await window.audioCapture.saveAudioFile(arrayBuffer);
      console.log("Saved:", filePath);
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    }
  };

  return (
    <div>
      <button onClick={startRecording}>Start Recording</button>
      <button onClick={stopRecording}>Stop Recording</button>
    </div>
  );
}

export default AudioRecorder;
```

---

## Key Technical Details

### Why Video Constraint is Required

Electron's `desktopCapturer` requires both audio and video constraints, even if you only want audio. This is a Chromium limitation. We immediately stop the video tracks after getting the stream.

### Why AudioContext is Used

The Web Audio API's `AudioContext` allows us to mix multiple audio sources into a single output stream. Without it, you can only record one source at a time.

### Audio Flow Diagram

```
System Audio Stream → createMediaStreamSource() → GainNode (1.0x)
                                                      ↓
Microphone Stream  → createMediaStreamSource() → GainNode (2.0x)
                                                      ↓
                                        createMediaStreamDestination()
                                                      ↓
                                                Mixed Stream
                                                      ↓
                                                MediaRecorder
                                                      ↓
                                               WebM Recording
                                                      ↓
                                            decodeAudioData()
                                                      ↓
                                         WAV Conversion (16-bit PCM)
                                                      ↓
                                               WAV Audio File
```

### Important Notes

1. **Permissions**: User must grant both screen capture and microphone permissions
2. **Source Selection**: User will see a system dialog to select which window/screen to capture
3. **Audio Format**: Output is WAV format (16-bit PCM, uncompressed, universally compatible)
4. **Volume Control**: Microphone is boosted to 2x volume to balance with system audio. Adjust `micGain.gain.value` if needed (1.0 = normal, 2.0 = 2x louder)
5. **Conversion**: WebM recording is converted to WAV in the browser using Web Audio API before saving
6. **Cleanup**: Always close AudioContext and stop tracks when done
7. **MS Teams**: Select the Teams window when the source picker appears

---

## Testing

1. Start a MS Teams/Zoom call or play a YouTube video
2. Click "Start Recording"
3. Select the window with audio playing
4. Speak into your microphone
5. Stop recording
6. Check the saved file - it should contain both system audio and your voice

---

## Troubleshooting

**No audio in recording:**

- Make sure audio is actually playing from the selected window
- Check that microphone is connected and working
- Verify both permissions were granted

**Only system audio or only microphone:**

- Check console logs to verify both streams were created
- Ensure AudioContext successfully mixed both sources

**App crashes:**

- Make sure to properly clean up AudioContext
- Stop all tracks before destroying components

---

## Browser Compatibility

This implementation works in:

- ✅ Electron (all versions with desktopCapturer)
- ✅ Chrome/Chromium with screen capture API
- ❌ Not supported in standard browsers for system audio (security restriction)

### Audio Format Compatibility

- **WAV (16-bit PCM)**: Universal compatibility - works with all media players, editing software, and transcription services
- **Conversion**: Done client-side using Web Audio API - no external dependencies required

---

## License & Attribution

This implementation is based on Web Audio API and Electron's desktopCapturer API. Feel free to use in your projects.

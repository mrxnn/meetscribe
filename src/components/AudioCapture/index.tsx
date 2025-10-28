import { useState, useEffect, useRef } from "react";
import "./audio-capture.css";
import type { RecordingState, TranscriptionProgress } from "@/type/audio";

type RecordingMode = "system" | "microphone";

function AudioCapture() {
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isTranscribing: false,
    recordingDuration: 0,
  });
  const [transcript, setTranscript] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("system");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Set up transcription progress listener
    window.audioCapture.onTranscriptionProgress(
      (progressData: TranscriptionProgress) => {
        setProgress(progressData);
      }
    );

    return () => {
      // Cleanup
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      window.audioCapture.removeTranscriptionProgressListener();
    };
  }, []);

  const startSystemAudioRecording = async () => {
    // Get audio sources (for system audio)
    const sources = await window.audioCapture.getAudioSources();

    if (!sources || sources.length === 0) {
      throw new Error("No audio sources available");
    }

    // Use the first screen source (usually "Entire Screen")
    const screenSource = sources.find(
      (source) =>
        source.name.includes("Screen") || source.name.includes("screen")
    );
    const sourceId = screenSource ? screenSource.id : sources[0].id;

    // Get system audio stream
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

    // Stop video tracks as we only want audio
    systemStream
      .getVideoTracks()
      .forEach((track: MediaStreamTrack) => track.stop());

    // Get microphone stream
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // Create Web Audio API context to mix both streams
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    // Create sources from both streams
    const systemSource = audioContext.createMediaStreamSource(systemStream);
    const micSource = audioContext.createMediaStreamSource(micStream);

    // Create gain nodes for volume control
    const systemGain = audioContext.createGain();
    const micGain = audioContext.createGain();

    // Adjust volumes (keep system audio at 100%, boost microphone to 200%)
    systemGain.gain.value = 1.0; // System audio at original volume
    micGain.gain.value = 6.0; // Boost microphone to 2x volume

    // Create a destination to mix both
    const destination = audioContext.createMediaStreamDestination();

    // Connect: source → gain → destination
    systemSource.connect(systemGain);
    systemGain.connect(destination);

    micSource.connect(micGain);
    micGain.connect(destination);

    console.log(
      "✅ Mixed stream created: System Audio + Microphone (Mic boosted 2x)"
    );
    console.log("System audio tracks:", systemStream.getAudioTracks().length);
    console.log("Microphone tracks:", micStream.getAudioTracks().length);
    console.log("Mixed tracks:", destination.stream.getAudioTracks().length);
    console.log(
      "Volume levels - System:",
      systemGain.gain.value,
      "Mic:",
      micGain.gain.value
    );

    // Return the mixed stream
    return destination.stream;
  };

  const startMicrophoneRecording = async () => {
    // Use standard microphone recording as fallback
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    return stream;
  };

  const startRecording = async () => {
    try {
      setError("");
      setTranscript("");
      setProgress(null);

      let stream: MediaStream;

      try {
        if (recordingMode === "system") {
          stream = await startSystemAudioRecording();
        } else {
          stream = await startMicrophoneRecording();
        }
      } catch (systemErr) {
        console.warn(
          "System audio recording failed, falling back to microphone:",
          systemErr
        );
        setError(
          "System audio capture failed. Using microphone instead. " +
            "Note: This will only capture audio through your microphone, not system audio."
        );
        stream = await startMicrophoneRecording();
        setRecordingMode("microphone");
      }

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        await processRecording();
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;

      // Start duration counter
      setRecordingState((prev) => ({
        ...prev,
        isRecording: true,
        recordingDuration: 0,
      }));
      durationIntervalRef.current = setInterval(() => {
        setRecordingState((prev) => ({
          ...prev,
          recordingDuration: prev.recordingDuration + 1,
        }));
      }, 1000);
    } catch (err) {
      console.error("Error starting recording:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to start recording. Please check your audio permissions."
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState.isRecording) {
      mediaRecorderRef.current.stop();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Clean up audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
        console.log("🔊 AudioContext closed");
      }

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      setRecordingState((prev) => ({ ...prev, isRecording: false }));
    }
  };

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
    view.setUint32(16, 16, true); // PCM format
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true); // 16-bit
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
    console.log("✅ Converted to WAV format");
    console.log("Sample rate:", sampleRate, "Hz");
    console.log("Channels:", numberOfChannels);
    console.log("WAV size:", wavBuffer.byteLength, "bytes");

    return wavBuffer;
  };

  const processRecording = async () => {
    try {
      setRecordingState((prev) => ({ ...prev, isTranscribing: true }));
      setError(""); // Clear any previous errors
      setTranscript(""); // Clear previous transcript
      setProgress(null); // Clear previous progress

      // Combine all audio chunks
      const audioBlob = new Blob(audioChunksRef.current, {
        type: "audio/webm",
      });

      console.log("Audio blob size:", audioBlob.size, "bytes");

      if (audioBlob.size === 0) {
        throw new Error("No audio data recorded. Please try again.");
      }

      console.log("Converting WebM to WAV...");

      // Convert WebM to WAV
      const wavBuffer = await convertToWav(audioBlob);

      // Save audio file
      const filePath = await window.audioCapture.saveAudioFile(wavBuffer);
      console.log("Audio saved to:", filePath);

      // Transcribe the audio
      console.log("Starting transcription...");
      const result = await window.audioCapture.transcribeAudio(filePath);

      if (result.error) {
        setError(result.error);
        setTranscript(`❌ Transcription failed: ${result.error}`);
      } else {
        setTranscript(result.text);
      }

      setRecordingState((prev) => ({ ...prev, isTranscribing: false }));
    } catch (err) {
      console.error("Error processing recording:", err);
      setError(
        err instanceof Error ? err.message : "Failed to process recording"
      );
      setRecordingState((prev) => ({ ...prev, isTranscribing: false }));
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div className="audio-capture">
      <h2>Audio Capture & Transcription</h2>

      <div className="info-banner">
        <p>
          <strong>System Audio Mode:</strong> Captures both system audio AND
          your microphone (perfect for MS Teams calls!). Recordings are saved to
          the <code>recordings</code> folder in your project directory.
        </p>
      </div>

      <div className="mode-selector">
        <label>
          <input
            type="radio"
            name="recordingMode"
            value="system"
            checked={recordingMode === "system"}
            onChange={(e) => setRecordingMode(e.target.value as RecordingMode)}
            disabled={
              recordingState.isRecording || recordingState.isTranscribing
            }
          />
          System Audio + Microphone (for calls)
        </label>
        <label>
          <input
            type="radio"
            name="recordingMode"
            value="microphone"
            checked={recordingMode === "microphone"}
            onChange={(e) => setRecordingMode(e.target.value as RecordingMode)}
            disabled={
              recordingState.isRecording || recordingState.isTranscribing
            }
          />
          Microphone Only
        </label>
      </div>

      <div className="controls">
        {!recordingState.isRecording ? (
          <button
            className="btn btn-start"
            onClick={startRecording}
            disabled={recordingState.isTranscribing}
          >
            🎤 Start Recording (
            {recordingMode === "system" ? "System Audio" : "Microphone"})
          </button>
        ) : (
          <button className="btn btn-stop" onClick={stopRecording}>
            ⏹️ Stop Recording
          </button>
        )}
      </div>

      {recordingState.isRecording && (
        <div className="recording-status">
          <div className="recording-indicator">
            <span className="recording-dot"></span>
            Recording: {formatDuration(recordingState.recordingDuration)}
          </div>
        </div>
      )}

      {recordingState.isTranscribing && (
        <div className="transcribing-status">
          <div className="spinner"></div>
          <p>{progress?.message || "Processing and transcribing audio..."}</p>
          {progress?.status && (
            <p className="progress-status">Status: {progress.status}</p>
          )}
        </div>
      )}

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {transcript && (
        <div className="transcript-container">
          <h3>📝 Transcript:</h3>
          <div className="transcript-text">{transcript}</div>
        </div>
      )}
    </div>
  );
}

export default AudioCapture;

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

    // Get user media with audio AND video constraint (required for desktop capture)
    // We'll only use the audio track
    const stream = await (navigator.mediaDevices as any).getUserMedia({
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
    stream.getVideoTracks().forEach((track: MediaStreamTrack) => track.stop());

    // Create audio-only stream
    const audioStream = new MediaStream(stream.getAudioTracks());

    return audioStream;
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

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      setRecordingState((prev) => ({ ...prev, isRecording: false }));
    }
  };

  const processRecording = async () => {
    try {
      setRecordingState((prev) => ({ ...prev, isTranscribing: true }));
      setError(""); // Clear any previous errors

      // Combine all audio chunks
      const audioBlob = new Blob(audioChunksRef.current, {
        type: "audio/webm",
      });

      console.log("Audio blob size:", audioBlob.size, "bytes");

      if (audioBlob.size === 0) {
        throw new Error("No audio data recorded. Please try again.");
      }

      // Convert to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      console.log("Array buffer size:", arrayBuffer.byteLength, "bytes");

      // Save audio file
      const filePath = await window.audioCapture.saveAudioFile(arrayBuffer);
      console.log("Audio saved to:", filePath);

      // Show success message with file path
      setTranscript(
        `✅ Recording saved successfully!\n\nFile location: ${filePath}\n\nFile size: ${(
          audioBlob.size / 1024
        ).toFixed(
          2
        )} KB\n\n[Transcription temporarily disabled - focusing on recording first]`
      );

      // TODO: Add transcription back later
      // const result = await window.audioCapture.transcribeAudio(filePath);

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
          <strong>Testing Mode:</strong> Transcription temporarily disabled.
          Recordings are saved to your temp folder. Check console (F12) for file
          paths and detailed logs.
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
          System Audio (Experimental)
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
          Microphone
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
          <p>Saving recording...</p>
        </div>
      )}

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {transcript && (
        <div className="transcript-container">
          <h3>Transcript:</h3>
          <div className="transcript-text">{transcript}</div>
        </div>
      )}
    </div>
  );
}

export default AudioCapture;

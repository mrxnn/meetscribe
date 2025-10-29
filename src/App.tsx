import { useState } from "react";
import AudioCapture from "@/components/AudioCapture";
import Chat from "@/components/Chat";
import "./App.css";

function App() {
  const [transcript, setTranscript] = useState<string>("");

  const handleTranscriptUpdate = (newTranscript: string) => {
    setTranscript(newTranscript);
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 space-y-4 min-h-screen">
      <AudioCapture onTranscriptUpdate={handleTranscriptUpdate} />
      <Chat transcript={transcript} disabled={!transcript} />
    </div>
  );
}

export default App;

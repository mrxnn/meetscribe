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
    <div className="App">
      <AudioCapture onTranscriptUpdate={handleTranscriptUpdate} />
      <Chat transcript={transcript} disabled={!transcript} />
    </div>
  );
}

export default App;

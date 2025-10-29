import { useState, useEffect } from "react";
import AudioCapture from "@/components/AudioCapture";
import Chat from "@/components/Chat";
import Sidebar, { Meeting } from "@/components/Sidebar";
import type { Recording } from "@/type/audio";
import "./App.css";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface MeetingData extends Meeting {
  messages: Message[];
}

function App() {
  const [meetings, setMeetings] = useState<MeetingData[]>([]);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoadingRecordings, setIsLoadingRecordings] = useState(true);

  // Load recordings from file system on mount
  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      setIsLoadingRecordings(true);
      const recordings: Recording[] = await window.recordings.getRecordings();

      // Load chat messages from localStorage for each recording
      const storedChats = localStorage.getItem("recording-chats");
      const chatHistory: Record<string, Message[]> = storedChats
        ? JSON.parse(storedChats)
        : {};

      const meetingsData: MeetingData[] = recordings.map((recording) => ({
        id: recording.id,
        title: recording.title,
        date: new Date(recording.date),
        transcript: "", // Will be loaded on demand
        messages: chatHistory[recording.id] || [],
        messageCount: (chatHistory[recording.id] || []).length,
      }));

      setMeetings(meetingsData);

      // Set the most recent recording as current
      if (meetingsData.length > 0) {
        setCurrentMeetingId(meetingsData[0].id);
        // Load the transcript for the first recording
        loadTranscript(meetingsData[0].id);
      }
    } catch (error) {
      console.error("Failed to load recordings:", error);
    } finally {
      setIsLoadingRecordings(false);
    }
  };

  const loadTranscript = async (recordingId: string) => {
    try {
      const transcript = await window.recordings.getRecordingTranscript(
        recordingId
      );
      setMeetings((prev) =>
        prev.map((m) => (m.id === recordingId ? { ...m, transcript } : m))
      );
    } catch (error) {
      console.error("Failed to load transcript:", error);
    }
  };

  // Save chat messages to localStorage whenever they change
  useEffect(() => {
    const chatHistory: Record<string, Message[]> = {};
    meetings.forEach((meeting) => {
      if (meeting.messages.length > 0) {
        chatHistory[meeting.id] = meeting.messages;
      }
    });
    localStorage.setItem("recording-chats", JSON.stringify(chatHistory));
  }, [meetings]);

  const currentMeeting = meetings.find((m) => m.id === currentMeetingId);

  const handleTranscriptUpdate = (newTranscript: string) => {
    // Reload recordings list to pick up the new recording
    loadRecordings();
  };

  const handleMessagesUpdate = (messages: Message[]) => {
    if (currentMeetingId) {
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === currentMeetingId
            ? { ...m, messages, messageCount: messages.length }
            : m
        )
      );
    }
  };

  const handleSelectMeeting = (meetingId: string) => {
    setCurrentMeetingId(meetingId);
    setSidebarOpen(false);

    // Load transcript if not already loaded
    const meeting = meetings.find((m) => m.id === meetingId);
    if (meeting && !meeting.transcript) {
      loadTranscript(meetingId);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        meetings={meetings}
        currentMeetingId={currentMeetingId}
        onSelectMeeting={handleSelectMeeting}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden lg:ml-[288px]">
        {/* Top Bar with Recording Controls */}
        <div className="border-b border-border bg-card p-4">
          <div className="flex items-center justify-end">
            <AudioCapture onTranscriptUpdate={handleTranscriptUpdate} inline />
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-hidden">
          <Chat
            transcript={currentMeeting?.transcript || ""}
            disabled={!currentMeeting?.transcript}
            messages={currentMeeting?.messages || []}
            onMessagesUpdate={handleMessagesUpdate}
            fullHeight
          />
        </div>
      </main>
    </div>
  );
}

export default App;

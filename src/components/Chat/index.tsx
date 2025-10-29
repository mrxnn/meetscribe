import { useState, useRef, useEffect } from "react";
import "./chat.css";

interface ChatProps {
  transcript: string;
  disabled?: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are an AI meeting assistant helping users review and analyze their meeting transcripts from platforms like Microsoft Teams, Zoom, and Google Meet. 

The transcript you receive may contain errors from speech-to-text conversion, including:
- Misspelled words or names
- Missing punctuation
- Incorrect word recognition
- Missing or garbled segments

Your role is to:
1. Help users understand the key points, decisions, and action items from the meeting
2. Answer questions about what was discussed
3. Identify participants and their contributions when possible
4. Summarize important information in a clear, organized manner
5. Ask for clarification when the transcript is ambiguous or unclear

Be understanding of transcription imperfections and make reasonable inferences based on context. If something is unclear, mention it and provide your best interpretation.`;

function Chat({ transcript, disabled = false }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Clear messages when transcript changes
  useEffect(() => {
    setMessages([]);
    setError("");
  }, [transcript]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading || disabled) return;

    const userMessage: Message = {
      role: "user",
      content: inputValue.trim(),
    };

    // Add user message to chat
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setError("");

    try {
      // Build messages array for API
      const apiMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "system",
          content: `Meeting Transcript:\n\n${transcript}`,
        },
        ...messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: "user", content: userMessage.content },
      ];

      const response = await fetch(
        "https://agent.ai.prontocloud.io/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer key`,
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages: apiMessages,
            temperature: 0.7,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Extract assistant message from response
      const assistantMessage: Message = {
        role: "assistant",
        content: data.choices?.[0]?.message?.content || "No response received.",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("Error sending message:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to get response from AI assistant"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-container">
      <h3>💬 Chat About This Meeting</h3>

      {disabled && (
        <div className="chat-disabled-message">
          Record and transcribe audio to start chatting about the meeting.
        </div>
      )}

      {!disabled && (
        <>
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty-state">
                <p>Ask me anything about the meeting! For example:</p>
                <ul>
                  <li>"What were the main action items?"</li>
                  <li>"Summarize the key decisions made"</li>
                  <li>"Who participated in this meeting?"</li>
                  <li>"What topics were discussed?"</li>
                </ul>
              </div>
            )}

            {messages.map((message, index) => (
              <div key={index} className={`message message-${message.role}`}>
                <div className="message-role">
                  {message.role === "user" ? "You" : "AI Assistant"}
                </div>
                <div className="message-content">{message.content}</div>
              </div>
            ))}

            {isLoading && (
              <div className="message message-assistant">
                <div className="message-role">AI Assistant</div>
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="chat-error">
                <strong>Error:</strong> {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-container">
            <input
              type="text"
              className="chat-input"
              placeholder="Ask a question about the meeting..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
            <button
              className="chat-send-button"
              onClick={sendMessage}
              disabled={!inputValue.trim() || isLoading}
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default Chat;

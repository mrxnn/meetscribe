import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatProps {
  transcript: string;
  disabled?: boolean;
  messages?: Message[];
  onMessagesUpdate?: (messages: Message[]) => void;
  fullHeight?: boolean;
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

function Chat({
  transcript,
  disabled = false,
  messages: externalMessages = [],
  onMessagesUpdate,
  fullHeight = false,
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>(externalMessages);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync with external messages
  useEffect(() => {
    setMessages(externalMessages);
  }, [externalMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading || disabled) return;

    const userMessage: Message = {
      role: "user",
      content: inputValue.trim(),
    };

    // Add user message to chat
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    if (onMessagesUpdate) {
      onMessagesUpdate(updatedMessages);
    }
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
            Authorization: `Bearer ${import.meta.env.VITE_LLM_API_KEY}`,
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

      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      if (onMessagesUpdate) {
        onMessagesUpdate(finalMessages);
      }
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

  // Full height mode: fill available space without card wrapper
  if (fullHeight) {
    return (
      <div className="h-full flex flex-col bg-background p-6">
        {disabled && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8 bg-card border border-border rounded-lg text-muted-foreground">
              Start chatting chat box
            </div>
          </div>
        )}

        {!disabled && (
          <>
            {/* Messages Container - Takes all available space */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-3 scrollbar-thin">
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center p-8 bg-card border border-border rounded-lg text-muted-foreground max-w-md">
                    <p className="mb-4 text-foreground">
                      Ask me anything about the meeting!
                    </p>
                    <p className="text-sm">
                      Try "Summarize the key points" or "What were the action
                      items?"
                    </p>
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] p-4 rounded-lg border ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <div className="text-xs font-semibold mb-2 uppercase tracking-wide opacity-70">
                      {message.role === "user" ? "You" : "AI Assistant"}
                    </div>
                    <div className="whitespace-pre-wrap break-words leading-relaxed">
                      {message.content}
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[70%] p-4 rounded-lg bg-muted border border-border">
                    <div className="text-xs font-semibold mb-2 uppercase tracking-wide opacity-70 text-muted-foreground">
                      AI Assistant
                    </div>
                    <div className="flex gap-1 items-center py-2">
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0ms]"></span>
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:150ms]"></span>
                      <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:300ms]"></span>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
                  <strong>Error:</strong> {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Container - Fixed at bottom */}
            <div className="flex gap-3 items-center">
              <Input
                type="text"
                placeholder="Ask a question about the meeting..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={sendMessage}
                disabled={!inputValue.trim() || isLoading}
              >
                Send
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Card mode: original layout
  return (
    <Card className="w-full mt-6">
      <CardHeader>
        <CardTitle>💬 Chat About This Meeting</CardTitle>
      </CardHeader>
      <CardContent>
        {disabled && (
          <div className="p-8 text-center text-muted-foreground bg-muted rounded-lg">
            Record and transcribe audio to start chatting about the meeting.
          </div>
        )}

        {!disabled && (
          <div className="space-y-4">
            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto p-4 bg-muted rounded-lg flex flex-col gap-4">
              {messages.length === 0 && (
                <div className="text-muted-foreground text-center py-8 px-4">
                  <p className="mb-4 text-base text-foreground">
                    Ask me anything about the meeting! For example:
                  </p>
                  <ul className="list-none p-0 text-left max-w-lg mx-auto space-y-2">
                    <li className="p-2 bg-background rounded border-l-4 border-blue-500 italic">
                      "What were the main action items?"
                    </li>
                    <li className="p-2 bg-background rounded border-l-4 border-blue-500 italic">
                      "Summarize the key decisions made"
                    </li>
                    <li className="p-2 bg-background rounded border-l-4 border-blue-500 italic">
                      "Who participated in this meeting?"
                    </li>
                    <li className="p-2 bg-background rounded border-l-4 border-blue-500 italic">
                      "What topics were discussed?"
                    </li>
                  </ul>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex flex-col p-4 rounded-lg max-w-[85%] animate-in slide-in-from-bottom-2 ${
                    message.role === "user"
                      ? "self-end bg-blue-500 text-white"
                      : "self-start bg-background border border-border"
                  }`}
                >
                  <div
                    className={`text-xs font-semibold mb-2 uppercase tracking-wide opacity-80 ${
                      message.role === "user"
                        ? "text-white/90"
                        : "text-muted-foreground"
                    }`}
                  >
                    {message.role === "user" ? "You" : "AI Assistant"}
                  </div>
                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                    {message.content}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex flex-col self-start p-4 rounded-lg max-w-[85%] bg-background border border-border">
                  <div className="text-xs font-semibold mb-2 uppercase tracking-wide opacity-80 text-muted-foreground">
                    AI Assistant
                  </div>
                  <div className="flex gap-1 items-center py-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0ms]"></span>
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:150ms]"></span>
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:300ms]"></span>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <strong>Error:</strong> {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Container */}
            <div className="flex gap-3 items-center">
              <Input
                type="text"
                placeholder="Ask a question about the meeting..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isLoading}
                className="flex-1"
              />
              <Button
                onClick={sendMessage}
                disabled={!inputValue.trim() || isLoading}
              >
                Send
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default Chat;

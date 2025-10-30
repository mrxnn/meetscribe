import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Meeting {
  id: string;
  title: string;
  date: Date;
  transcript: string;
  messageCount?: number;
}

interface SidebarProps {
  meetings: Meeting[];
  currentMeetingId: string | null;
  onSelectMeeting: (meetingId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

function Sidebar({
  meetings,
  currentMeetingId,
  onSelectMeeting,
  isOpen,
  onToggle,
}: SidebarProps) {
  return (
    <>
      {/* Mobile Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className="fixed top-4 left-4 z-50 lg:hidden"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-screen bg-neutral-900 border-r border-border z-40 transition-transform duration-300 ease-in-out",
          "w-72 flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Sidebar Header */}
        <div className="px-4 border-b border-border">
          <h2 className="text-2xl font-black text-blue-500">MeetScribe.</h2>
        </div>

        {/* Recordings List */}
        <div className="flex-1 overflow-y-scroll no-scrollbar px-4 space-y-2">
          {meetings.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              No recordings yet. Start recording to create your first
              transcript.
            </div>
          ) : (
            meetings.map((recording) => (
              <div
                key={recording.id}
                className={cn(
                  "bg-neutral-800 text-neutral-300 px-4 py-4 rounded cursor-pointer flex items-center gap-2",
                  currentMeetingId === recording.id &&
                    "bg-blue-500 text-neutral-200"
                )}
                onClick={() => onSelectMeeting(recording.id)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  className="size-5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M3.75 9h16.5m-16.5 6.75h16.5"
                  />
                </svg>

                <span className="text-sm">{recording.title}</span>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;

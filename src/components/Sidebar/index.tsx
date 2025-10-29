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
          "fixed top-0 left-0 h-screen bg-[#0a0a0a] border-r border-border z-40 transition-transform duration-300 ease-in-out",
          "w-72 flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Recordings
          </h2>
        </div>

        {/* Recordings List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
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
                  "p-3 rounded-md border border-border bg-card cursor-pointer transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  currentMeetingId === recording.id &&
                    "bg-accent text-accent-foreground"
                )}
                onClick={() => onSelectMeeting(recording.id)}
              >
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

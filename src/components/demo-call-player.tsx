"use client";

import { useEffect, useRef, useState } from "react";

// Transcript lines with timestamps (seconds into the call).
// Paste your Retell transcript here — set time: to the second each line starts.
const CALL_TRANSCRIPT = [
  { time: 0, speaker: "ai" as const, text: "Hi, you've reached Happy Paws! How can I help you today?" },
  { time: 5, speaker: "caller" as const, text: "Hey. I'm calling to make an appointment for my dog." },
  { time: 10, speaker: "ai" as const, text: "Of course! What's your dog's name?" },
  { time: 14, speaker: "caller" as const, text: "Luna." },
  { time: 17, speaker: "ai" as const, text: "Luna — what a lovely name. What breed is Luna?" },
  { time: 21, speaker: "caller" as const, text: "She's a golden retriever." },
  { time: 24, speaker: "ai" as const, text: "Golden retrievers are such sweethearts. For a golden retriever, a bath and brush is usually perfect — their coats really shine after a good wash and brush-out. What size is Luna — would you say she's small, medium, large, or extra large?" },
  { time: 38, speaker: "caller" as const, text: "She's about eighty pounds." },
  { time: 41, speaker: "ai" as const, text: "Thanks for letting me know — that would make Luna a large. What were you thinking for her today? We offer a full groom, bath & brush, and nail trim." },
  { time: 51, speaker: "caller" as const, text: "Can I get a full groom for Monday at three PM?" },
  { time: 55, speaker: "ai" as const, text: "Let me check what's open for Luna on Monday at three...Luna can get a full groom on Monday at 3:00 pm. Should I go ahead and book that slot for you?" },
  { time: 63, speaker: "caller" as const, text: "Yes, please." },
  { time: 66, speaker: "ai" as const, text: "Perfect, I'll get that booked right now...I just need your name to finish booking Luna's appointment. What should I put down for you?" },
  { time: 74, speaker: "caller" as const, text: "It's Nitant, N-I-T-A-N-T." },
  { time: 78, speaker: "ai" as const, text: "Thanks for spelling that out, Nitant. Is this Luna's first visit with us?" },
  { time: 83, speaker: "caller" as const, text: "Yes." },
  { time: 87, speaker: "ai" as const, text: "Give me just a second to confirm that slot for you...Perfect — Luna is all set for a full groom on Monday, March 16 at 3:00 pm. Since it's her first visit, plan to arrive a few minutes early so we can get Luna's info on file. We're really looking forward to meeting her. You're all set! You'll get a confirmation text shortly. Is there anything else I can help you with?" },
  { time: 109, speaker: "caller" as const, text: "No. That'll be all. Thank you so much." },
  { time: 114, speaker: "ai" as const, text: "Thanks so much for calling, Nitant. Have a great day — we can't wait to meet Luna!" },
];

const TOTAL_CALL_DURATION = 119; // seconds

function formatTime(s: number) {
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function DemoCallPlayer({ audioSrc }: { audioSrc?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Stable random waveform heights, generated once on mount
  const [waveformBars] = useState(() =>
    Array.from({ length: 52 }, () => 0.18 + Math.random() * 0.82)
  );

  // Real audio: sync elapsed from audio.currentTime
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;

    const onTimeUpdate = () => setElapsed(audio.currentTime);
    const onEnded = () => { setIsPlaying(false); setElapsed(TOTAL_CALL_DURATION); };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioSrc]);

  // Simulated mode: advance elapsed with an interval when no audioSrc
  useEffect(() => {
    if (audioSrc) return; // real audio handles its own timing
    if (!isPlaying) return;

    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        if (prev >= TOTAL_CALL_DURATION) {
          setIsPlaying(false);
          return TOTAL_CALL_DURATION;
        }
        return prev + 0.25;
      });
    }, 250);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, audioSrc]);

  const progress = (elapsed / TOTAL_CALL_DURATION) * 100;
  const isFinished = elapsed >= TOTAL_CALL_DURATION;
  const currentLine = [...CALL_TRANSCRIPT].reverse().find((l) => elapsed >= l.time);

  async function handlePlayPause() {
    const audio = audioRef.current;
    if (audioSrc && audio) {
      if (isFinished) {
        audio.currentTime = 0;
        setElapsed(0);
        await audio.play();
        setIsPlaying(true);
      } else if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } else {
      // Simulated mode
      if (isFinished) {
        setElapsed(0);
        setIsPlaying(true);
      } else {
        setIsPlaying((p) => !p);
      }
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pct * TOTAL_CALL_DURATION;
    if (audioSrc && audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    setElapsed(newTime);
  }

  return (
    <div className="relative w-full">
      {audioSrc && <audio ref={audioRef} src={audioSrc} preload="metadata" />}

      <div className="overflow-hidden border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Recording</p>
            <p className="mt-1 text-[13px] text-ink">Happy Paws · inbound</p>
          </div>
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {formatTime(elapsed)} / {formatTime(TOTAL_CALL_DURATION)}
          </span>
        </div>

        {/* Waveform + play button */}
        <div className="px-5 pt-5 pb-3 flex items-center gap-4">
          {/* Play / Pause / Replay */}
          <button
            onClick={handlePlayPause}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center bg-accent text-accent-foreground hover:bg-accent-hover"
            aria-label={isPlaying ? "Pause" : isFinished ? "Replay" : "Play"}
          >
            {/* Pulse ring while playing */}
            {isPlaying && (
              <span className="absolute inset-0 rounded-full border-2 border-accent/40 animate-ping" />
            )}
            {isFinished ? (
              /* Replay icon */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            ) : isPlaying ? (
              /* Pause icon */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              /* Play icon — nudge right to optically centre */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
          </button>

          {/* Waveform bars */}
          <div
            className="relative flex-1 h-14 flex items-center gap-[2.5px] cursor-pointer group select-none"
            onClick={handleSeek}
          >
            {waveformBars.map((height, i) => {
              const barPct = (i / waveformBars.length) * 100;
              const played = barPct <= progress;
              const hot = played && barPct > progress - 6 && isPlaying;
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-full transition-colors duration-100 ${
                    hot
                      ? "bg-accent"
                      : played
                        ? "bg-ink"
                        : "bg-ink/15 group-hover:bg-ink/22"
                  }`}
                  style={{
                    height: `${height * 100}%`,
                    transform: hot
                      ? `scaleY(${0.75 + Math.sin(Date.now() / 120 + i) * 0.25})`
                      : undefined,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Status line */}
        <div className="px-5 pb-3 text-[13px] text-muted font-medium leading-none">
          {elapsed === 0 && !isPlaying
            ? "Press play to hear a real booking call"
            : isFinished
              ? "Call ended — appointment booked \u2713"
              : "\u00A0"}
        </div>

        {/* Live transcript */}
        <div className="px-5 pb-5">
          <div className="bg-surface rounded-xl p-4 min-h-[86px] flex flex-col justify-center">
            {elapsed === 0 && !isPlaying ? (
              <div className="text-center">
                <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1">Live Transcript</p>
                <p className="text-[13px] text-muted">Captions appear as the call plays</p>
              </div>
            ) : currentLine ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      currentLine.speaker === "ai"
                        ? "bg-accent/10 text-accent"
                        : "bg-ink/5 text-muted"
                    }`}
                  >
                    {currentLine.speaker === "ai" ? "Call Slot" : "Caller"}
                  </span>
                  <span className="text-[10px] text-muted font-mono">{formatTime(currentLine.time)}</span>
                </div>
                <p className="text-ink text-[13.5px] leading-relaxed font-medium">
                  &ldquo;{currentLine.text}&rdquo;
                </p>
              </div>
            ) : null}
          </div>

          {isFinished && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2.5">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <div>
                <p className="text-[12px] font-bold text-green-800">Appointment booked successfully</p>
                <p className="text-[11px] text-green-700">Luna &middot; Full Groom &middot; Monday 3:00 PM &middot; Confirmation text sent</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Call Slot — Your voicemail can book.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#F3EEE4",
          color: "#1C1916",
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#6F675E",
            display: "flex",
          }}
        >
          Call Slot
        </div>
        <div
          style={{
            marginTop: 24,
            fontSize: 72,
            lineHeight: 1.05,
            display: "flex",
            maxWidth: 900,
          }}
        >
          Your voicemail can book.
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 24,
            color: "#6F675E",
            display: "flex",
            maxWidth: 720,
          }}
        >
          Missed calls pick a time on the keypad. Bookings write to your calendar.
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 80,
            width: 80,
            height: 4,
            background: "#6E2C2C",
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size }
  );
}

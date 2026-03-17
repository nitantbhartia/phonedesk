import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "RingPaw - AI Receptionist for Pet Groomers";
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
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #FAF9F6 0%, #E3F2F9 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Decorative paw prints */}
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 80,
            fontSize: 64,
            opacity: 0.1,
            display: "flex",
          }}
        >
          🐾
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 50,
            left: 90,
            fontSize: 48,
            opacity: 0.1,
            display: "flex",
          }}
        >
          🐾
        </div>

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          {/* Logo mark */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 80,
              height: 80,
              borderRadius: 20,
              background: "#3E2919",
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 44, display: "flex" }}>🐕</span>
          </div>

          {/* Brand name */}
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: "#3E2919",
              letterSpacing: -2,
              display: "flex",
            }}
          >
            RingPaw
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: "#F4A261",
              display: "flex",
              marginTop: -4,
            }}
          >
            AI Receptionist for Pet Groomers
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 22,
              color: "#3E2919",
              opacity: 0.6,
              marginTop: 12,
              display: "flex",
              textAlign: "center",
              maxWidth: 700,
            }}
          >
            Answers calls. Books appointments. Sends confirmations. 24/7.
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "linear-gradient(90deg, #F4A261, #FDD783, #F4A261)",
            display: "flex",
          }}
        />
      </div>
    ),
    { ...size }
  );
}

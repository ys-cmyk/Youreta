import { ImageResponse } from "next/og";

// iOS home-screen icon (180×180 PNG) generated at build/request time. Renders
// the ◎ brand mark in white on the accent gradient.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)",
        }}
      >
        {/* ◎ brand mark drawn with divs so it needs no font download. */}
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: "50%",
            border: "11px solid #ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "#ffffff",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  );
}

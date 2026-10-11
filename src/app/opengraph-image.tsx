import { ImageResponse } from "next/og";

export const alt = "Developer Community Pulse";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0B0F14", color: "#E7ECF2" }}>
        <div style={{ fontSize: 28, color: "#7AA2FF", marginBottom: 24 }}>Weekly developer-community intelligence</div>
        <div style={{ fontSize: 84, fontWeight: 600, lineHeight: 1.05 }}>Developer Community Pulse</div>
        <div style={{ fontSize: 32, color: "#93A1B3", marginTop: 28 }}>What developers are struggling with in code review, CI/CD and workflow. Live from Hacker News, Dev.to and Stack Overflow.</div>
      </div>
    ),
    size,
  );
}

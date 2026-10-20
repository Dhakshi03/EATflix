import { ImageResponse } from "next/og";

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
          background: "linear-gradient(135deg, #16161a 0%, #070709 100%)",
          borderRadius: 40,
          position: "relative",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 120 120" fill="none">
          <path
            d="M26 18C26 15.8 27.8 14 30 14H46V106C40 104 32 104 26 106V18Z"
            fill="#99050d"
          />
          <path
            d="M26 14H92C94.2 14 96 15.8 96 18V31C96 33.2 94.2 35 92 35H26V14Z"
            fill="#E50914"
          />
          <path
            d="M26 50H80C82.2 50 84 51.8 84 54V66C84 68.2 82.2 70 80 70H26V50Z"
            fill="#E50914"
          />
          <rect x="67" y="53.5" width="12" height="2.6" rx="1.3" fill="#09090c" />
          <rect x="67" y="58.7" width="12" height="2.6" rx="1.3" fill="#09090c" />
          <rect x="67" y="63.9" width="12" height="2.6" rx="1.3" fill="#09090c" />
          <path
            d="M26 85H92C94.2 85 96 86.8 96 89V102C96 104.2 93.8 105.8 91.6 105.3C70 101 48 101 26 106V85Z"
            fill="#E50914"
          />
          <path
            d="M88 59C88 51.5 95 46.5 101 46.5C101 54 96 61 88 59Z"
            fill="#46d369"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}

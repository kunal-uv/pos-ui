import React from "react";
import { uiFont, type PosTheme } from "./theme";

/**
 * The loading state of the till, drawn like the admin dashboard's loader: a
 * soft pulsing halo, a track ring with a spinning arc, a dot at the centre,
 * and a title with a line of explanation under it.
 *
 * Inline styles and a scoped keyframes block, not Tailwind, for the reason in
 * theme.ts: this package is dropped into admin panels that do not share a
 * Tailwind config, and a class name that is never generated renders nothing.
 */
export const TillLoader = ({
  theme,
  height,
  title = "Opening the till",
  subtitle = "Loading products, customers and store settings…",
}: {
  theme: PosTheme;
  /** CSS height of the area to centre in; the till passes its frame height. */
  height: string;
  title?: string;
  subtitle?: string;
}) => (
  <div
    role="status"
    aria-live="polite"
    style={{
      height,
      minHeight: 280,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 20,
      padding: "48px 24px",
      textAlign: "center",
      background: theme.bg,
      fontFamily: uiFont,
    }}
  >
    <style>{`
      @keyframes pos-loader-spin { to { transform: rotate(360deg); } }
      @keyframes pos-loader-ping {
        0% { transform: scale(1); opacity: .75; }
        75%, 100% { transform: scale(1.7); opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .pos-loader-motion { animation: none !important; }
      }
    `}</style>
    <div style={{ position: "relative", width: 64, height: 64, display: "grid", placeItems: "center" }}>
      <span
        className="pos-loader-motion"
        style={{
          position: "absolute", inset: 0, borderRadius: "50%", background: theme.accentSoft,
          animation: "pos-loader-ping 1.6s cubic-bezier(0, 0, .2, 1) infinite",
        }}
      />
      <span
        style={{
          position: "absolute", inset: 0, borderRadius: "50%", boxSizing: "border-box",
          border: `3px solid ${theme.accentTint}`,
        }}
      />
      <span
        className="pos-loader-motion"
        style={{
          position: "absolute", inset: 0, borderRadius: "50%", boxSizing: "border-box",
          border: "3px solid transparent", borderTopColor: theme.accent, borderRightColor: theme.accent,
          animation: "pos-loader-spin 1s linear infinite",
        }}
      />
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: theme.accent }} />
    </div>
    <div style={{ display: "grid", gap: 6 }}>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: theme.ink }}>{title}</p>
      <p style={{ margin: 0, maxWidth: 320, fontSize: 13.5, color: theme.mutedLight }}>{subtitle}</p>
    </div>
  </div>
);

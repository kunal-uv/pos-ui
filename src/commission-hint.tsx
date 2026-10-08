"use client";

import React, { useEffect, useRef, useState } from "react";

import type {
  CommissionPreview,
  CommissionPreviewInput,
} from "./types";
import type { PosTheme } from "./theme";

/**
 * "What you'll earn" — the live commission figure while a line is being priced.
 *
 * ! Asked of the host, which asks its own server. The server answers with the
 * ! same code that writes the ledger at checkout, so the figure on the till is
 * ! the figure on the statement. A second copy of the rules in the browser
 * ! would be right until the first rate change, and then it would quietly lie
 * ! to the person whose pay it describes.
 *
 * ! Always the signed-in person's own earnings. The host's endpoint takes no
 * ! user id, so there is no way to ask what somebody else would make.
 *
 * ! Silent when it cannot answer. A hint that fails is left out — never shown
 * ! as a zero, which reads as "this sale earns you nothing", and never allowed
 * ! to interrupt a sale in progress.
 */

interface Props {
  theme: PosTheme;
  money: (value: number) => string;
  input: CommissionPreviewInput | null;
  preview: (input: CommissionPreviewInput) => Promise<CommissionPreview | null>;
  /** How long the inputs must sit still before asking, in ms. */
  debounceMs?: number;
}

export const CommissionHint = ({
  theme,
  money,
  input,
  preview,
  debounceMs = 400,
}: Props) => {
  const [result, setResult] = useState<CommissionPreview | null>(null);
  const [open, setOpen] = useState(false);

  /**
   * ! Guards against a slow answer landing after a faster one for a later
   * ! price. Without it, typing 12 months and then 3 can leave the figure for
   * ! 12 on screen beside a 3-month agreement.
   */
  const latest = useRef(0);

  const key = input
    ? `${input.productId}|${input.unitId ?? ""}|${input.unitPrice}|${input.tenure}`
    : "";

  useEffect(() => {
    if (!input || !(input.unitPrice > 0) || !(input.tenure > 0)) {
      setResult(null);
      return;
    }

    let live = true;
    const ticket = ++latest.current;

    // ! Debounced: an operator sets months a digit at a time, and every digit
    // ! is not a question worth a round trip.
    const timer = setTimeout(() => {
      preview(input)
        .then((answer) => {
          if (live && ticket === latest.current) setResult(answer);
        })
        .catch(() => {
          // Deliberately silent — see the note above.
          if (live && ticket === latest.current) setResult(null);
        });
    }, debounceMs);

    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `key` collapses the input object to the values that actually change the
    // answer, so a new object with the same numbers does not re-ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, debounceMs, preview]);

  // Nothing to say, or nothing earned: no panel. A visible zero would read as
  // a statement about the operator's pay that the platform never made.
  if (!result || result.total <= 0) return null;

  const detail = result.components.filter((part) => part.amount !== 0);

  return (
    <div
      style={{
        border: `1px solid ${theme.accent}33`,
        background: `${theme.accent}0f`,
        borderRadius: 10,
        padding: "9px 11px",
        display: "grid",
        gap: 6,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          background: "none",
          border: 0,
          padding: 0,
          cursor: detail.length > 0 ? "pointer" : "default",
          font: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 12, color: theme.muted }}>
          You&apos;ll earn
        </span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: theme.accent,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {money(result.total)}
          {detail.length > 0 && (
            <span style={{ fontSize: 10, color: theme.mutedLight }}>
              {open ? "▲" : "▼"}
            </span>
          )}
        </span>
      </button>

      {open &&
        detail.map((part, index) => (
          <div
            key={`${part.kind}-${index}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              fontSize: 11.5,
              color: theme.muted,
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {part.note}
            </span>
            <span style={{ flex: "none", fontWeight: 600, color: theme.inkSoft }}>
              {money(part.amount)}
            </span>
          </div>
        ))}
    </div>
  );
};

export default CommissionHint;

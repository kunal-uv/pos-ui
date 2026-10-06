import React, { useEffect, useMemo, useRef, useState } from "react";
import { GoogleAddressInput } from "./address-autocomplete";
import type { PosClient } from "./client";
import { uiFont, type PosTheme } from "./theme";
import type { Customer, PosAddress } from "./types";

/**
 * The New Customer form, laid out and validated like the Appliance Outlet
 * till's: first and last name, any number of labelled phone numbers with one
 * marked main, an email proven with an emailed code, and a billing address of
 * which only the postal code is required - and only once any of it is filled
 * in. A customer collecting in store needs no address at all.
 *
 * Every platform shares this form, so the pieces a platform may not support
 * are switched by capability: `emailVerification` shows the Send code step.
 * Errors the platform refuses with (a phone already on file) are shown under
 * the field they are about, on the form, not in a banner behind it.
 */

const MAX_PHONES = 5;

/** Letters of any script, spaces, apostrophes, hyphens and dots. */
const NAME_PATTERN = /^\p{L}[\p{L}\p{M}' .-]*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Canadian "V3W 0A8" or US "98225" / "98225-1234". */
const POSTAL_PATTERN = /^([A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d|\d{5}(-\d{4})?)$/;

/** "(604) 555-0123" -> "6045550123"; a leading + is kept. */
const normalisePhone = (value: string): string => value.trim().replace(/[\s().-]/g, "");

const isValidPhone = (value: string): boolean => /^\+?\d{10,15}$/.test(normalisePhone(value));

/** Ten plain digits read as "(604) 555-0123"; anything else is left as typed. */
const formatPhone = (value: string): string => {
  const digits = normalisePhone(value);
  return /^\d{10}$/.test(digits)
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : value;
};

interface PhoneRow {
  key: number;
  phone: string;
  label: string;
  isPrimary: boolean;
}

let rowSequence = 0;
const newRow = (isPrimary: boolean): PhoneRow => {
  rowSequence += 1;
  return { key: rowSequence, phone: "", label: "", isPrimary };
};

const blankAddress = (): PosAddress => ({
  line1: "", line2: "", city: "", state: "", postalCode: "", country: "", countryCode: "",
});

type EmailProof = "none" | "sent" | "verified";

export interface NewCustomerFormProps {
  client: PosClient;
  theme: PosTheme;
  /** Show the Send code / Verify step for the email. */
  emailVerification: boolean;
  googleMapsApiKey?: string;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}

export const NewCustomerForm = ({
  client, theme, emailVerification, googleMapsApiKey, onClose, onCreated,
}: NewCustomerFormProps) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phones, setPhones] = useState<PhoneRow[]>(() => [newRow(true)]);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<PosAddress>(blankAddress);

  const [proof, setProof] = useState<EmailProof>("none");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [proofError, setProofError] = useState<string | null>(null);

  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  /** What the platform refused with, kept against the field it is about. */
  const [serverError, setServerError] = useState<{ field: string | null; message: string } | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => firstField.current?.focus(), []);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = window.setInterval(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  const styles = useMemo(() => {
    const field: React.CSSProperties = {
      boxSizing: "border-box", width: "100%", height: 42, border: `1px solid ${theme.border}`,
      borderRadius: 10, padding: "0 12px", fontSize: 14, background: theme.surface,
      color: theme.ink, fontFamily: uiFont, outline: "none",
    };
    return {
      field,
      invalid: { ...field, borderColor: theme.danger } as React.CSSProperties,
      label: { display: "block", marginBottom: 5, fontSize: 11.5, fontWeight: 800,
        letterSpacing: ".05em", textTransform: "uppercase", color: theme.muted } as React.CSSProperties,
      card: { display: "grid", gap: 12, padding: 14, borderRadius: 14,
        background: theme.surfaceMuted, border: `1px solid ${theme.borderSoft}` } as React.CSSProperties,
      section: { fontSize: 11.5, fontWeight: 800, letterSpacing: ".06em",
        color: theme.mutedLight, textTransform: "uppercase" } as React.CSSProperties,
      error: { marginTop: 4, fontSize: 12, color: theme.danger } as React.CSSProperties,
      ghost: { height: 40, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface,
        color: theme.inkSoft, fontSize: 13, fontWeight: 700, padding: "0 14px", cursor: "pointer",
        fontFamily: uiFont } as React.CSSProperties,
      link: { background: "none", border: 0, padding: 0, color: theme.accentDeep, fontWeight: 700,
        fontSize: 13, cursor: "pointer", fontFamily: uiFont } as React.CSSProperties,
    };
  }, [theme]);

  /* ------------------------------------------------------------ validation */

  const first = firstName.trim().replace(/\s+/g, " ");
  const last = lastName.trim().replace(/\s+/g, " ");
  const mail = email.trim().toLowerCase();

  const nameError = (value: string, label: string): string | null => {
    if (!value) return `${label} is required`;
    if (value.length > 50) return `${label} can be at most 50 characters`;
    if (!NAME_PATTERN.test(value)) return `${label} can only contain letters, spaces, apostrophes, hyphens and dots`;
    return null;
  };

  const phoneErrors: Array<string | null> = phones.map((row, index) => {
    if (!row.phone.trim()) return "Phone number is required";
    if (!isValidPhone(row.phone)) return "Enter a valid phone number: 10 to 15 digits";
    const repeated = phones.some(
      (other, otherIndex) => otherIndex < index && normalisePhone(other.phone) === normalisePhone(row.phone),
    );
    return repeated ? "This number is already listed" : null;
  });

  const started = Object.values(address).some((value) => String(value ?? "").trim() !== "");
  const postalError: string | null = !started ? null
    : !address.postalCode.trim() ? "Postal / ZIP code is required with an address"
      : !POSTAL_PATTERN.test(address.postalCode.trim()) ? "Enter a valid postal / ZIP code, like V3W 0A8 or 98225"
        : null;

  const emailError: string | null = !mail ? "Email is required"
    : mail.length > 254 || !EMAIL_PATTERN.test(mail) ? "Please enter a valid email address"
      : emailVerification && proof !== "verified" ? "Verify this email with the code we send"
        : null;

  const errors = {
    first: nameError(first, "First name"),
    last: nameError(last, "Last name"),
    email: emailError,
    postal: postalError,
  };
  const valid = !errors.first && !errors.last && !errors.email && !errors.postal
    && phoneErrors.every((message) => message === null);

  const shown = (message: string | null): string | null => (showErrors ? message : null);
  const serverFor = (field: string): string | null =>
    serverError?.field === field ? serverError.message : null;

  /* --------------------------------------------------------------- phones */

  const editPhone = (key: number, changes: Partial<PhoneRow>) => {
    setPhones((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));
    if (serverError?.field === "phone") setServerError(null);
  };
  const makeMain = (key: number) =>
    setPhones((rows) => rows.map((row) => ({ ...row, isPrimary: row.key === key })));
  const addPhone = () => setPhones((rows) => (rows.length >= MAX_PHONES ? rows : [...rows, newRow(false)]));
  const removePhone = (key: number) =>
    setPhones((rows) => {
      if (rows.length <= 1) return rows;
      const kept = rows.filter((row) => row.key !== key);
      // Exactly one main number, whichever row was removed.
      return kept.some((row) => row.isPrimary) ? kept : kept.map((row, index) => ({ ...row, isPrimary: index === 0 }));
    });

  /* ---------------------------------------------------------------- email */

  const changeEmail = (value: string) => {
    setEmail(value);
    // A code proves one exact address; editing it starts the proof over.
    setProof("none");
    setCode("");
    setProofError(null);
    setResendIn(0);
    if (serverError?.field === "email") setServerError(null);
  };

  const sendCode = async () => {
    if (!EMAIL_PATTERN.test(mail)) {
      setShowErrors(true);
      return;
    }
    setSending(true);
    setProofError(null);
    try {
      await client.request("/customers/email-code", { method: "POST", body: JSON.stringify({ email: mail }) });
      setProof("sent");
      setResendIn(60);
    } catch (reason) {
      setProofError(reason instanceof Error ? reason.message : "Could not send a code");
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    setVerifying(true);
    setProofError(null);
    try {
      await client.request("/customers/email-verify", {
        method: "POST", body: JSON.stringify({ email: mail, code: code.trim() }),
      });
      setProof("verified");
    } catch (reason) {
      setProofError(reason instanceof Error ? reason.message : "That code is not right");
    } finally {
      setVerifying(false);
    }
  };

  /* ----------------------------------------------------------------- save */

  const fieldOf = (message: string): string | null => {
    const text = message.toLowerCase();
    if (text.includes("phone")) return "phone";
    if (text.includes("email")) return "email";
    if (text.includes("postal") || text.includes("zip")) return "postal";
    if (text.includes("first name")) return "first";
    if (text.includes("last name")) return "last";
    return null;
  };

  const save = async () => {
    setShowErrors(true);
    if (!valid) return;
    setSaving(true);
    setServerError(null);
    try {
      const main = phones.find((row) => row.isPrimary) ?? phones[0]!;
      const created = await client.request<Customer>("/customers", {
        method: "POST",
        body: JSON.stringify({
          name_f: first,
          name_l: last,
          email: mail,
          phone: normalisePhone(main.phone),
          phones: phones.map((row) => ({
            phone: normalisePhone(row.phone),
            label: row.label.trim() || undefined,
            is_primary: row.key === main.key,
          })),
          ...(started ? {
            address: {
              line1: address.line1.trim() || undefined,
              line2: address.line2.trim() || undefined,
              city: address.city.trim() || undefined,
              state: address.state.trim() || undefined,
              postalCode: address.postalCode.trim(),
              country: address.country.trim() || undefined,
              countryCode: address.countryCode.trim() || undefined,
            },
          } : {}),
          emailCodeVerified: emailVerification && proof === "verified" ? true : undefined,
        }),
      });
      onCreated(created);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unable to create customer";
      setServerError({ field: fieldOf(message), message });
    } finally {
      setSaving(false);
    }
  };

  const ready = !saving;

  /* --------------------------------------------------------------- render */

  const input = (invalid: boolean) => (invalid ? styles.invalid : styles.field);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,25,20,.44)", display: "grid",
        placeItems: "center", zIndex: 1100, padding: 16 }}
      role="dialog" aria-modal="true" aria-label="New customer"
    >
      <div style={{ background: theme.surface, borderRadius: 18, border: `1px solid ${theme.borderSoft}`,
        boxShadow: "0 24px 60px rgba(16,22,20,.22)", width: "min(660px, 100%)", maxHeight: "calc(100vh - 32px)",
        display: "flex", flexDirection: "column", fontFamily: uiFont }}>
        <div style={{ padding: "20px 24px 6px" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: theme.ink }}>New Customer</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: theme.muted }}>
            Only first name, last name, phone and postal code are needed.
          </p>
        </div>

        <div style={{ padding: "14px 24px", overflowY: "auto", display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <div>
              <label style={styles.label} htmlFor="nc-first">First Name <span style={{ color: theme.danger }}>*</span></label>
              <input id="nc-first" ref={firstField} style={input(Boolean(shown(errors.first) || serverFor("first")))}
                value={firstName} placeholder="First name" maxLength={50}
                onChange={(event) => setFirstName(event.target.value)} />
              {(shown(errors.first) || serverFor("first")) && (
                <div role="alert" style={styles.error}>{serverFor("first") ?? errors.first}</div>
              )}
            </div>
            <div>
              <label style={styles.label} htmlFor="nc-last">Last Name <span style={{ color: theme.danger }}>*</span></label>
              <input id="nc-last" style={input(Boolean(shown(errors.last) || serverFor("last")))}
                value={lastName} placeholder="Last name" maxLength={50}
                onChange={(event) => setLastName(event.target.value)} />
              {(shown(errors.last) || serverFor("last")) && (
                <div role="alert" style={styles.error}>{serverFor("last") ?? errors.last}</div>
              )}
            </div>
          </div>

          <div style={styles.card}>
            <span style={styles.section}>Phone Numbers</span>
            {phones.map((row, index) => {
              const message = shown(phoneErrors[index] ?? null) ?? (row.isPrimary ? serverFor("phone") : null);
              return (
                <div key={row.key} style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                    <div>
                      <label style={styles.label} htmlFor={`nc-phone-${row.key}`}>
                        Phone {index + 1} <span style={{ color: theme.danger }}>*</span>
                      </label>
                      <input id={`nc-phone-${row.key}`} style={input(Boolean(message))} type="tel" inputMode="tel"
                        autoComplete="tel" maxLength={18} value={row.phone} placeholder="(555) 010-1234"
                        onChange={(event) => editPhone(row.key, { phone: event.target.value })}
                        onBlur={() => editPhone(row.key, { phone: formatPhone(row.phone) })} />
                    </div>
                    <div>
                      <label style={styles.label} htmlFor={`nc-label-${row.key}`}>Label — optional</label>
                      <input id={`nc-label-${row.key}`} style={styles.field} maxLength={30} value={row.label}
                        placeholder="Mobile, Home, Work"
                        onChange={(event) => editPhone(row.key, { label: event.target.value })} />
                    </div>
                  </div>
                  {message && <div role="alert" style={{ ...styles.error, marginTop: 0 }}>{message}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700,
                      color: theme.inkSoft, cursor: "pointer" }}>
                      <input type="radio" name="nc-main-phone" checked={row.isPrimary} onChange={() => makeMain(row.key)} />
                      Main
                    </label>
                    <button type="button" style={{ ...styles.link, color: phones.length > 1 ? theme.danger : theme.mutedLight,
                      cursor: phones.length > 1 ? "pointer" : "not-allowed" }}
                      disabled={phones.length <= 1} onClick={() => removePhone(row.key)}>
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
            {phones.length < MAX_PHONES && (
              <div><button type="button" style={styles.link} onClick={addPhone}>+ Add another number</button></div>
            )}
          </div>

          <div style={styles.card}>
            <div>
              <label style={styles.label} htmlFor="nc-email">Email <span style={{ color: theme.danger }}>*</span></label>
              <input id="nc-email" type="email" style={input(Boolean(shown(errors.email) || serverFor("email")))}
                value={email} placeholder="abc@example.com" maxLength={254}
                onChange={(event) => changeEmail(event.target.value)} />
              {(serverFor("email") || shown(errors.email)) && (
                <div role="alert" style={styles.error}>{serverFor("email") ?? errors.email}</div>
              )}
            </div>

            {emailVerification && proof !== "verified" && (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" style={{ ...styles.ghost, opacity: (!EMAIL_PATTERN.test(mail) || sending || resendIn > 0) ? 0.55 : 1 }}
                    disabled={!EMAIL_PATTERN.test(mail) || sending || resendIn > 0} onClick={sendCode}>
                    {sending ? "Sending…" : proof === "sent" ? (resendIn > 0 ? `Resend code (${resendIn}s)` : "Resend code") : "Send code"}
                  </button>
                  {proof === "sent" && <span style={{ fontSize: 12, color: theme.muted }}>Code sent to {mail}</span>}
                </div>
                {proof === "sent" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
                    <div>
                      <label style={styles.label} htmlFor="nc-code">Verification code</label>
                      <input id="nc-code" style={styles.field} inputMode="numeric" maxLength={6} value={code}
                        placeholder="6-digit code"
                        onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
                    </div>
                    <button type="button" style={{ ...styles.ghost, background: theme.accent, borderColor: theme.accent, color: "#fff",
                      opacity: (code.length !== 6 || verifying) ? 0.55 : 1 }}
                      disabled={code.length !== 6 || verifying} onClick={verifyCode}>
                      {verifying ? "Verifying…" : "Verify"}
                    </button>
                  </div>
                )}
                {proofError && <div role="alert" style={{ ...styles.error, marginTop: 0 }}>{proofError}</div>}
              </div>
            )}
            {emailVerification && proof === "verified" && (
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#15803d" }}>✓ {mail} verified</div>
            )}
          </div>

          <div style={styles.card}>
            <span style={styles.section}>Billing Address</span>
            <div>
              <label style={styles.label} htmlFor="nc-line1">Address Line 1</label>
              <GoogleAddressInput apiKey={googleMapsApiKey} address={address} onAddressChange={setAddress}
                inputStyle={styles.field} disabled={saving} />
              <div style={{ marginTop: 4, fontSize: 12, color: theme.muted }}>
                A customer collecting in store does not need one.
              </div>
            </div>
            <div>
              <label style={styles.label} htmlFor="nc-line2">Address Line 2</label>
              <input id="nc-line2" style={styles.field} value={address.line2} maxLength={120}
                placeholder="Apartment, suite, unit (optional)"
                onChange={(event) => setAddress({ ...address, line2: event.target.value })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div>
                <label style={styles.label} htmlFor="nc-city">City</label>
                <input id="nc-city" style={styles.field} value={address.city} maxLength={80} placeholder="Optional"
                  onChange={(event) => setAddress({ ...address, city: event.target.value })} />
              </div>
              <div>
                <label style={styles.label} htmlFor="nc-state">State</label>
                <input id="nc-state" style={styles.field} value={address.state} maxLength={80} placeholder="Optional"
                  onChange={(event) => setAddress({ ...address, state: event.target.value })} />
              </div>
              <div>
                <label style={styles.label} htmlFor="nc-postal">
                  Postal / ZIP Code {started && <span style={{ color: theme.danger }}>*</span>}
                </label>
                <input id="nc-postal" style={input(Boolean(shown(errors.postal) || serverFor("postal")))}
                  value={address.postalCode} maxLength={12} placeholder="V3W 0A8 or 98225"
                  onChange={(event) => setAddress({ ...address, postalCode: event.target.value })} />
                {(shown(errors.postal) || serverFor("postal")) && (
                  <div role="alert" style={styles.error}>{serverFor("postal") ?? errors.postal}</div>
                )}
              </div>
            </div>
          </div>

          {serverError && serverError.field === null && (
            <div role="alert" style={{ padding: "9px 12px", borderRadius: 10, fontSize: 13, color: theme.danger,
              background: theme.dangerBg, border: `1px solid ${theme.dangerBorder}` }}>
              {serverError.message}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "12px 24px 20px",
          borderTop: `1px solid ${theme.borderSoft}` }}>
          <button type="button" style={styles.ghost} onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" disabled={!ready} onClick={save}
            style={{ height: 40, minWidth: 150, borderRadius: 10, border: 0, fontFamily: uiFont, fontSize: 13.5,
              fontWeight: 800, color: "#fff", cursor: ready ? "pointer" : "not-allowed",
              background: ready ? theme.accent : "#C9D3CE" }}>
            {saving ? "Saving…" : "Save Customer"}
          </button>
        </div>
      </div>
    </div>
  );
};

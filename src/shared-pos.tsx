"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GoogleAddressInput } from "./address-autocomplete";
import { PosClient } from "./client";
import { NewCustomerForm } from "./new-customer-form";
import { TillLoader } from "./till-loader";
import { PosSaleDocuments } from "./sale-documents";
import type { PosSaleDocument } from "./print/slips";
import {
  gradeChip,
  gradeChipFallback,
  gradeRank,
  initials,
  itemsLabel,
  monoFont,
  posLayout,
  posTileColumns,
  themeForTenant,
  themeFromAccent,
  uiFont,
  type PosTheme,
} from "./theme";
import type {
  CatalogProduct,
  Customer,
  HeldCart,
  InventoryUnit,
  PosAddress,
  PosCart,
  PosSession,
  SharedPosProps,
} from "./types";
import { CommissionHint } from "./commission-hint";

/**
 * `crypto.randomUUID` only exists on a secure origin. A till reached over plain
 * HTTP on a shop LAN would otherwise throw here - at the checkout button, after
 * the payment has been taken.
 */
const idempotencyKey = (): string => {
  const provider = globalThis.crypto;
  if (typeof provider?.randomUUID === "function") return provider.randomUUID();
  if (typeof provider?.getRandomValues === "function") {
    const bytes = provider.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  }
  return `pos-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
};

/**
 * Rental months and the rental period are one fact, not two.
 *
 * ! They used to be three independent inputs: the end date defaulted to 30 days
 * ! out while the tenure defaulted to 1 month, and nothing kept them in step. A
 * ! twelve-month agreement could be written with a one-month date range, and the
 * ! platform stores both - `rental_ended_date` and `rental_tenure` - so the
 * ! order came out self-contradictory with no way to tell which half was meant.
 */
const addMonths = (iso: string, months: number): string => {
  const [year, month, day] = iso.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const target = new Date(Date.UTC(year, month - 1 + months, day));
  // Clamp a day the target month does not have: 31 Jan + 1 month is 28 Feb,
  // not 3 Mar, which is what the rollover would otherwise give.
  if (target.getUTCDate() !== day) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
};

/** Whole months from `start` to `end`, never less than one billing period. */
const monthsBetween = (start: string, end: string): number => {
  const [sy, sm, sd] = start.split("-").map(Number) as [number, number, number];
  const [ey, em, ed] = end.split("-").map(Number) as [number, number, number];
  const whole = (ey - sy) * 12 + (em - sm) - (ed < sd ? 1 : 0);
  return Math.max(1, whole);
};

const readable = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
};

/** The A-D grade a platform reports for one unit, if it reports one. */
const unitGrade = (
  unit: InventoryUnit,
): { code: string; label: string | null; note: string | null } => {
  const meta = unit.metadata ?? {};
  const raw = meta.grade ?? meta.gradeCode ?? null;
  const code =
    raw === null || raw === undefined ? "" : String(raw).toUpperCase();
  const label = meta.gradeLabel ? String(meta.gradeLabel) : null;
  const note = meta.conditionNote ?? meta.note ?? null;
  return {
    code,
    label,
    note: note === null || note === undefined ? null : String(note),
  };
};

/** A platform may hand back a bare filename rather than a URL. */
const resolveImage = (url: string | null, base?: string): string | null => {
  if (!url) return null;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith("data:")) return url;
  if (!base) return url;
  return `${base.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
};

const Icon = ({
  path,
  size = 18,
  stroke = "currentColor",
  width = 2.1,
}: {
  path: string;
  size?: number;
  stroke?: string;
  width?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    style={{ flex: "none" }}
  >
    {path.split("|").map((d, index) => (
      <path key={index} d={d} />
    ))}
  </svg>
);

const SignaturePad = ({
  onChange,
  theme,
}: {
  onChange: (value: string | null) => void;
  theme: PosTheme;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  };
  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.strokeStyle = theme.ink;
    context.lineTo(current.x, current.y);
    context.stroke();
  };
  const end = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(event.currentTarget.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 800,
            letterSpacing: ".06em",
            color: theme.mutedLight,
          }}
        >
          CUSTOMER SIGNATURE
        </span>
        <button
          type="button"
          onClick={clear}
          style={{
            border: 0,
            background: "transparent",
            color: theme.accent,
            cursor: "pointer",
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        /*
         * Backing resolution, not display size - the element is laid out at
         * 100% of the dialog. Widened with the dialog so a signature drawn
         * across the full pad keeps the same stroke density as before.
         */
        width={1100}
        height={200}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{
          width: "100%",
          // Taller to match the wider pad, so the signing area keeps a natural
          // writing ratio rather than becoming a letterbox.
          height: 128,
          border: `1px solid ${theme.border}`,
          borderRadius: 12,
          background: theme.surface,
          touchAction: "none",
          cursor: "crosshair",
        }}
      />
    </div>
  );
};

type CheckoutStep =
  | "customer"
  | "shipping"
  | "details"
  | "signature"
  | "payment";

const CHECKOUT_STEPS: Array<{ key: CheckoutStep; label: string }> = [
  { key: "customer", label: "Customer" },
  { key: "shipping", label: "Shipping" },
  { key: "details", label: "Details" },
  { key: "signature", label: "Signature" },
  { key: "payment", label: "Payment" },
];

export const SharedPos = ({
  apiUrl,
  tenant,
  storeId,
  token,
  onUnauthorized,
  onCheckout,
  onExit,
  brandName = "In-store POS",
  logoUrl,
  business: hostBusiness,
  imageBaseUrl,
  googleMapsApiKey,
  accentColor,
  theme: themeOverride,
  viewportOffset = 0,
  creditReference = null,
  onCreditApplied,
  onCreditRejected,
  commissionPreview,
}: SharedPosProps) => {
  const theme = useMemo<PosTheme>(() => {
    const base = themeForTenant(tenant);
    const withAccent = accentColor ? themeFromAccent(accentColor, base) : base;
    return themeOverride ? { ...withAccent, ...themeOverride } : withAccent;
  }, [tenant, accentColor, themeOverride]);

  const client = useMemo(
    () => new PosClient(apiUrl, tenant, storeId, token, onUnauthorized),
    [apiUrl, tenant, storeId, token, onUnauthorized],
  );

  const [session, setSession] = useState<PosSession | null>(null);
  const [cart, setCart] = useState<PosCart | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [catalogIndex, setCatalogIndex] = useState<CatalogProduct[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<CatalogProduct | null>(null);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitId, setUnitId] = useState("");
  const [rentalStart, setRentalStart] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [tenure, setTenure] = useState(1);
  const [tenureInput, setTenureInput] = useState("1");
  // Derived, never typed into independently: the end date IS start + tenure.
  const [rentalEnd, setRentalEnd] = useState(() =>
    addMonths(new Date().toISOString().slice(0, 10), 1),
  );

  const changeStart = (value: string) => {
    if (!value) return;
    setRentalStart(value);
    setRentalEnd(addMonths(value, tenure));
  };
  const changeTenure = (value: string) => {
    setTenureInput(value);
    if (value.trim() === "") return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(1, Math.min(120, Math.trunc(parsed)));
    setTenure(clamped);
    setRentalEnd(addMonths(rentalStart, clamped));
  };
  const commitTenure = () => {
    const parsed = Number(tenureInput);
    const clamped = Number.isFinite(parsed)
      ? Math.max(1, Math.min(120, Math.trunc(parsed)))
      : 1;
    setTenure(clamped);
    setTenureInput(String(clamped));
    setRentalEnd(addMonths(rentalStart, clamped));
  };
  // Setting the end date is the other way in to the same pair: the operator
  // says "until March" and the months follow, rather than being contradicted.
  const changeEnd = (value: string) => {
    if (!value) return;
    if (value <= rentalStart) {
      setTenure(1);
      setTenureInput("1");
      setRentalEnd(addMonths(rentalStart, 1));
      return;
    }
    const months = monthsBetween(rentalStart, value);
    setTenure(months);
    setTenureInput(String(months));
    setRentalEnd(value);
  };

  /**
   * What is being taken now, and what the customer handed over.
   *
   * Both are strings while the operator types: an empty box is not zero, and a
   * half-typed "1." is not a number yet.
   */
  const [amountInput, setAmountInput] = useState("");
  const [tenderedInput, setTenderedInput] = useState("");

  /** Sales parked at this till, loaded when the operator opens the list. */
  const [heldCarts, setHeldCarts] = useState<HeldCart[] | null>(null);
  const [parkOpen, setParkOpen] = useState(false);
  /** The "park this sale" name box, in place of the browser's own prompt. */
  const [parkNameOpen, setParkNameOpen] = useState(false);
  const [parkName, setParkName] = useState("");
  /** The customer picker's list is showing (the box is focused). */
  const [customerOpen, setCustomerOpen] = useState(false);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("customer");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [signatureDraft, setSignatureDraft] = useState<string | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup");

  /**
   * Charges the operator sets on this sale.
   *
   * Delivery used to be one fee on the store, applied to every job whatever it
   * involved. It is priced per sale here instead, with a second labelled
   * charge beside it for anything that is not delivery — stair carry, old-unit
   * removal, an after-hours call-out.
   *
   * Taxability is per charge because it is a judgement about the job, not a
   * property of the store; both start taxable, which is how the store fee was
   * always treated.
   */
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const [deliveryChargeTaxable, setDeliveryChargeTaxable] = useState(true);
  const [customChargeLabel, setCustomChargeLabel] = useState("");
  const [customCharge, setCustomCharge] = useState("");
  const [customChargeTaxable, setCustomChargeTaxable] = useState(true);

  const amount = (value: string): number => Math.max(0, Number(value) || 0);
  const [deliveryAddress, setDeliveryAddress] = useState<PosAddress>(() =>
    blankDeliveryAddress(tenant),
  );
  const [deliverySurvey, setDeliverySurvey] = useState<{
    stepsOutside: number | null;
    stepsInside: number | null;
  }>({ stepsOutside: null, stepsInside: null });
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [marketingConsent, setMarketingConsent] = useState(true);
  // Built from the cart at the moment it was committed. Held apart from the
  // cart state because the cart is gone once the transaction completes, and a
  // reprint has to show what was actually charged.
  const [saleDocument, setSaleDocument] = useState<PosSaleDocument | null>(
    null,
  );
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [noteLineId, setNoteLineId] = useState<string | null>(null);
  /** The line whose warranty is being chosen. */
  const [warrantyLineId, setWarrantyLineId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [removeConfirmLineId, setRemoveConfirmLineId] = useState<string | null>(
    null,
  );
  const [orderDetails, setOrderDetails] = useState({
    scheduledFor: "",
    deliveryInstructions: "",
    pickupInstructions: "",
    orderNote: "",
    entranceDoor: "" as "" | "single" | "double",
    entranceLevel: "" as "" | "ground" | "upstairs" | "basement",
    hosesBought: null as boolean | null,
    doorRemoval: null as boolean | null,
    dryerVent: null as boolean | null,
  });

  const serialized = session?.capabilities.serializedInventory ?? true;
  const rental = cart?.kind === "RENTAL";
  const needsSignature = session?.capabilities.signature ?? false;
  const frameHeight =
    viewportOffset > 0
      ? `calc(100dvh - ${Math.max(0, viewportOffset)}px)`
      : "100dvh";

  const money = useCallback(
    (value: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: session?.currency ?? "USD",
      }).format(value),
    [session?.currency],
  );

  /* ---------------------------------------------------------------- boot */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setBooting(true);
        const current = await client.request<PosSession>("/session");
        const kind = current.capabilities.transactionKinds[0];
        if (!kind)
          throw new Error("This platform has no enabled POS transaction type");
        const nextCart = await client.request<PosCart>("/carts", {
          method: "POST",
          body: JSON.stringify({ kind }),
        });
        const catalog = await client.request<{ items: CatalogProduct[] }>(
          "/catalog?pageSize=200&pageOffset=0",
        );
        if (active) {
          setSession(current);
          setCart(nextCart);
          setProducts(catalog.items);
          setCatalogIndex(catalog.items);
          const savedMethod = nextCart.fulfilment?.method;
          if (savedMethod === "delivery" || savedMethod === "pickup")
            setFulfilment(savedMethod);
        }
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error ? reason.message : "Unable to open the POS",
          );
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  /**
   * A credit the host sent us in. Applied to the open cart once, after boot:
   * the service asks the platform what it is worth and refuses one that has
   * already been spent, so a stale link discounts nothing.
   */
  const creditApplied = useRef<string | null>(null);
  useEffect(() => {
    if (!cart || !creditReference) return;
    if (creditApplied.current === creditReference) return;
    if (cart.creditReference === creditReference) {
      creditApplied.current = creditReference;
      return;
    }
    creditApplied.current = creditReference;
    let active = true;
    (async () => {
      try {
        const updated = await client.request<PosCart>(
          `/carts/${cart.id}/credit`,
          {
            method: "PATCH",
            body: JSON.stringify({ reference: creditReference }),
          },
        );
        if (!active) return;
        setCart(updated);
        onCreditApplied?.(creditReference);
      } catch (reason) {
        if (!active) return;
        const message =
          reason instanceof Error
            ? reason.message
            : "That credit could not be applied";
        setError(message);
        onCreditRejected?.(creditReference, message);
      }
    })();
    return () => {
      active = false;
    };
  }, [cart, client, creditReference, onCreditApplied, onCreditRejected]);

  const loadCatalog = useCallback(
    async (term: string, category: string | null) => {
      try {
        setLoadingCatalog(true);
        setError(null);
        const query = new URLSearchParams({ pageSize: "200", pageOffset: "0" });
        if (term.trim()) query.set("search", term.trim());
        if (category) query.set("categoryId", category);
        const data = await client.request<{ items: CatalogProduct[] }>(
          `/catalog?${query.toString()}`,
        );
        setProducts(data.items);
        if (!term.trim() && !category) setCatalogIndex(data.items);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load the catalogue",
        );
      } finally {
        setLoadingCatalog(false);
      }
    },
    [client],
  );

  /* Category rail, built from what the catalogue actually returned. The shared
	   service has no categories endpoint - a platform's category tree is its
	   own - so the rail lists what is on the floor rather than every branch. */
  const categories = useMemo(() => {
    const counts = new Map<
      string,
      { id: string; name: string; count: number }
    >();
    for (const product of catalogIndex) {
      if (!product.category) continue;
      const entry = counts.get(product.category.id);
      if (entry) entry.count += 1;
      else
        counts.set(product.category.id, {
          id: product.category.id,
          name: product.category.name,
          count: 1,
        });
    }
    return Array.from(counts.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [catalogIndex]);

  /**
   * Best grade first, then cheapest. An operator asked for "the good one" or
   * "the cheapest one" is choosing on exactly these two axes, and a picker in
   * database order makes them read every row to answer either question.
   */
  const sortedUnits = useMemo(
    () =>
      [...units].sort(
        (a, b) =>
          gradeRank(unitGrade(a).code) - gradeRank(unitGrade(b).code) ||
          a.price - b.price ||
          a.serial.localeCompare(b.serial),
      ),
    [units],
  );

  const visible = useMemo(
    () =>
      categoryId
        ? products.filter((p) => p.category?.id === categoryId)
        : products,
    [products, categoryId],
  );
  const sellable = useMemo(
    () => visible.filter((p) => p.availableCount > 0),
    [visible],
  );
  const outOfStock = useMemo(
    () => visible.filter((p) => p.availableCount <= 0),
    [visible],
  );

  // Search as the cashier types: once they pause, not on every keystroke.
  const searchedTerm = useRef(search);
  const categoryRef = useRef(categoryId);
  categoryRef.current = categoryId;
  useEffect(() => {
    if (search === searchedTerm.current) return;
    const timer = window.setTimeout(() => {
      searchedTerm.current = search;
      void loadCatalog(search, categoryRef.current);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [search, loadCatalog]);

  // Errors appear as a toast and clear themselves.
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const term = customerSearch.trim();
    // An empty box lists the first few customers; one letter is too little to
    // search on; a chosen customer needs no list.
    if (!customerOpen || customer || term.length === 1) {
      setCustomers([]);
      return;
    }
    // A slower, older reply must not overwrite the answer to what is typed now.
    let current = true;
    const timer = window.setTimeout(
      () => {
        client
          .request<Customer[]>(
            `/customers?search=${encodeURIComponent(term)}`,
          )
          .then((found) => {
            if (current) setCustomers(found);
          })
          .catch((reason) => {
            if (!current) return;
            // The starting list is a convenience: a service that cannot list
            // without a search yet should not interrupt the cashier with it.
            if (term) setError(reason.message);
          });
      },
      term ? 300 : 0,
    );
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [client, customerSearch, customerOpen, customer]);

  /* ------------------------------------------------------------- actions */
  const openProduct = async (product: CatalogProduct) => {
    setError(null);
    setSelected(product);
    setUnitId("");
    setUnits([]);
    if (!serialized) return;
    try {
      setUnitsLoading(true);
      setUnits(
        await client.request<InventoryUnit[]>(`/catalog/${product.id}/units`),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load units",
      );
    } finally {
      setUnitsLoading(false);
    }
  };

  const addSelected = async () => {
    if (!cart || !selected) return;
    try {
      setBusy(true);
      setError(null);
      const next = await client.request<PosCart>(`/carts/${cart.id}/lines`, {
        method: "POST",
        body: JSON.stringify({
          productId: selected.id,
          unitId: unitId || undefined,
          quantity: 1,
          rentalStart: rental
            ? new Date(`${rentalStart}T00:00:00.000Z`).toISOString()
            : undefined,
          rentalEnd: rental
            ? new Date(`${rentalEnd}T00:00:00.000Z`).toISOString()
            : undefined,
          rentalTenure: rental ? tenure : undefined,
        }),
      });
      setCart(next);
      setSelected(null);
      setUnits([]);
      setUnitId("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to add item");
    } finally {
      setBusy(false);
    }
  };

  const removeLine = async (lineId: string) => {
    if (!cart) return;
    try {
      setBusy(true);
      setCart(
        await client.request<PosCart>(`/carts/${cart.id}/lines/${lineId}`, {
          method: "DELETE",
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to remove item",
      );
    } finally {
      setBusy(false);
    }
  };

  /** Puts a warranty plan on a line, or takes it off with `null`. */
  const chooseWarranty = async (lineId: string, warrantyId: string | null) => {
    if (!cart) return;
    try {
      setBusy(true);
      setError(null);
      setCart(
        await client.request<PosCart>(`/carts/${cart.id}/lines/${lineId}`, {
          method: "PATCH",
          body: JSON.stringify({ warrantyId }),
        }),
      );
      setWarrantyLineId(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to change the warranty",
      );
    } finally {
      setBusy(false);
    }
  };

  const saveLineNote = async () => {
    if (!cart || !noteLineId) return;
    try {
      setBusy(true);
      setError(null);
      setCart(
        await client.request<PosCart>(`/carts/${cart.id}/lines/${noteLineId}`, {
          method: "PATCH",
          body: JSON.stringify({ note: noteDraft.trim() || null }),
        }),
      );
      setNoteLineId(null);
      setNoteDraft("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save the line note",
      );
    } finally {
      setBusy(false);
    }
  };

  const selectOptionalFee = async (
    lineId: string,
    attributeId: string,
    selectedFee: boolean,
  ) => {
    if (!cart) return;
    try {
      setBusy(true);
      setError(null);
      setCart(
        await client.request<PosCart>(
          `/carts/${cart.id}/lines/${lineId}/optional-fees/${encodeURIComponent(attributeId)}`,
          { method: "PATCH", body: JSON.stringify({ selected: selectedFee }) },
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to update the optional fee",
      );
    } finally {
      setBusy(false);
    }
  };

  /** How an item goes out: its own choice, else the order's. */
  const lineMethod = (line: { fulfilment?: "pickup" | "delivery" | null }) =>
    line.fulfilment ?? fulfilment;

  /**
   * Chooses how one item goes out. The order's own method follows: it is
   * delivery as soon as any item is delivered (the address and the delivery
   * charge hang off it), and pickup only when every item is.
   */
  const chooseLineMethod = async (
    lineId: string,
    method: "pickup" | "delivery",
  ) => {
    if (!cart) return;
    const lines = cart.lines.map((line) => ({
      ...line,
      fulfilment: line.id === lineId ? method : line.fulfilment,
    }));
    const order = lines.some((line) => lineMethod(line) === "delivery")
      ? "delivery"
      : "pickup";
    const previous = fulfilment;
    try {
      setBusy(true);
      setError(null);
      let next = await client.request<PosCart>(
        `/carts/${cart.id}/lines/${lineId}`,
        { method: "PATCH", body: JSON.stringify({ fulfilment: method }) },
      );
      if (order !== previous) {
        setFulfilment(order);
        next = await client.request<PosCart>(`/carts/${cart.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            fulfilment: { ...(next.fulfilment ?? {}), method: order },
          }),
        });
      }
      setCart(next);
    } catch (reason) {
      setFulfilment(previous);
      setError(
        reason instanceof Error ? reason.message : "Unable to update the item",
      );
    } finally {
      setBusy(false);
    }
  };

  const changeFulfilment = async (method: "pickup" | "delivery") => {
    if (!cart) return;
    const overridden = cart.lines.filter((line) => line.fulfilment);
    // Choosing for the whole order again also clears any per-item choices.
    if (method === fulfilment && overridden.length === 0) return;
    const previous = fulfilment;
    setFulfilment(method);
    try {
      setBusy(true);
      setError(null);
      for (const line of overridden) {
        await client.request<PosCart>(`/carts/${cart.id}/lines/${line.id}`, {
          method: "PATCH",
          body: JSON.stringify({ fulfilment: null }),
        });
      }
      setCart(
        await client.request<PosCart>(`/carts/${cart.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            fulfilment: { ...(cart.fulfilment ?? {}), method },
          }),
        }),
      );
    } catch (reason) {
      setFulfilment(previous);
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to update fulfilment",
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * A cart can arrive with a customer already on it - a replacement credit
   * carries its owner - and the checkout would otherwise open on a blank
   * search box, inviting the operator to pick somebody else for a sale the
   * credit cannot legally pay for.
   */
  // The cashier has changed the box themselves: do not put the cart's customer
  // back behind them while they clear it to pick somebody else.
  const customerEdited = useRef(false);
  useEffect(() => {
    customerEdited.current = false;
  }, [cart?.id]);
  useEffect(() => {
    if (!cart?.customerId || customer || customerEdited.current) return;
    const snapshot = cart.customerSnapshot as
      | { name?: string; email?: string; phone?: string }
      | null
      | undefined;
    setCustomer({
      id: cart.customerId,
      name: snapshot?.name ?? `Customer ${cart.customerId}`,
      email: snapshot?.email ?? null,
      phone: snapshot?.phone ?? null,
    } as Customer);
    setCustomerSearch(snapshot?.name ?? "");
  }, [cart?.customerId, cart?.customerSnapshot, customer]);

  const chooseCustomer = async (value: Customer) => {
    if (!cart) return;
    customerEdited.current = false;
    setCustomer(value);
    setCustomers([]);
    setCustomerOpen(false);
    setCustomerSearch(value.name);
    setDeliveryAddress(blankDeliveryAddress(tenant));
    try {
      setCart(
        await client.request<PosCart>(`/carts/${cart.id}`, {
          method: "PATCH",
          body: JSON.stringify({ customer: { id: value.id, snapshot: value } }),
        }),
      );
      try {
        const addresses = await client.request<PosAddress[]>(
          `/customers/${encodeURIComponent(value.id)}/addresses`,
        );
        if (addresses[0]) setDeliveryAddress(addresses[0]);
      } catch {
        // Customers without an address on file can still type one below.
      }
    } catch (reason) {
      setCustomer(null);
      setError(
        reason instanceof Error ? reason.message : "Unable to select customer",
      );
    }
  };

  const openNewCustomer = () => setShowNewCustomer(true);
  const closeNewCustomer = () => setShowNewCustomer(false);

  /** The new customer is chosen for this sale straight away. */
  const customerCreated = async (created: Customer) => {
    setShowNewCustomer(false);
    await chooseCustomer(created);
  };

  const deliveryComplete =
    fulfilment === "pickup" ||
    Boolean(
      deliveryAddress.line1.trim() &&
        deliveryAddress.city.trim() &&
        deliveryAddress.state.trim() &&
        deliveryAddress.postalCode.trim(),
    );
  const canTakeDeposit = session?.capabilities.partialPayment === true;
  const canGiveChange = session?.capabilities.cashChange === true;
  const amountDue = cart ? cart.grandTotal : 0;

  /**
   * What is actually being taken now. An empty box means the whole amount —
   * the common case stays a matter of pressing Complete.
   */
  const amountNow = (() => {
    if (!canTakeDeposit || amountInput.trim() === "") return amountDue;

    const parsed = Number(amountInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return amountDue;

    return Math.min(Math.round(parsed * 100) / 100, amountDue);
  })();

  const balanceDue = Math.round((amountDue - amountNow) * 100) / 100;

  const tenderedNow = (() => {
    if (!canGiveChange || paymentMethod !== "cash") return null;

    const parsed = Number(tenderedInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;

    return Math.round(parsed * 100) / 100;
  })();

  /** Change is only ever what was counted out above what is being applied. */
  const changeDue =
    tenderedNow === null
      ? null
      : Math.round((tenderedNow - amountNow) * 100) / 100;

  const checkoutDisabled =
    busy ||
    !cart?.lines.length ||
    !customer ||
    !deliveryComplete ||
    (needsSignature && !signatureData);
  const checkoutStepIndex = CHECKOUT_STEPS.findIndex(
    ({ key }) => key === checkoutStep,
  );
  const paymentOptions =
    tenant === "rent-buddyz"
      ? [
          { value: "cash", label: "Cash" },
          { value: "debit", label: "Debit" },
          { value: "credit", label: "Credit" },
          { value: "interac", label: "Interac" },
        ]
      : [
          { value: "cash", label: "Cash" },
          { value: "debit", label: "Debit" },
          { value: "credit", label: "Credit" },
          { value: "zelle", label: "Zelle" },
          { value: "certified_check", label: "Certified check" },
        ];

  useEffect(() => {
    const syncFullscreen = () =>
      setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };

  const canPark = session?.capabilities.holds === true;

  const loadHeldCarts = async () => {
    try {
      setHeldCarts(await client.request<HeldCart[]>("/carts/held"));
    } catch {
      // A list that will not load is shown as empty rather than as an error
      // over a sale in progress.
      setHeldCarts([]);
    }
  };

  /**
   * Parks the open sale. The units on it stay reserved — the stale-cart sweep
   * deliberately leaves held carts alone — so the machine is still the
   * customer's while they think about it.
   */
  const parkCart = async (name: string | null) => {
    if (!cart) return;

    try {
      setBusy(true);
      setError(null);
      await client.request(`/carts/${cart.id}/hold`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      // The till always needs a cart to work in, so a fresh one opens behind
      // the parked sale.
      const kind = session?.capabilities.transactionKinds[0];
      if (kind) {
        setCart(
          await client.request<PosCart>("/carts", {
            method: "POST",
            body: JSON.stringify({ kind }),
          }),
        );
      }
      setCustomer(null);
      setParkOpen(false);
      setHeldCarts(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to park this sale",
      );
    } finally {
      setBusy(false);
    }
  };

  const resumeHeldCart = async (id: string) => {
    try {
      setBusy(true);
      setError(null);
      const resumed = await client.request<PosCart>(`/carts/${id}/resume`, {
        method: "POST",
      });
      setCart(resumed);
      setParkOpen(false);
      setHeldCarts(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to resume that sale",
      );
    } finally {
      setBusy(false);
    }
  };

  const openCheckout = () => {
    setError(null);
    setCheckoutStep("customer");
    setAmountInput("");
    setTenderedInput("");
    setSignatureData(null);
    setSignatureDraft(null);
    setMarketingConsent(true);
    setDeliverySurvey({ stepsOutside: null, stepsInside: null });
    setOrderDetails({
      scheduledFor: "",
      deliveryInstructions: "",
      pickupInstructions: "",
      orderNote: "",
      entranceDoor: "",
      entranceLevel: "",
      hosesBought: null,
      doorRemoval: null,
      dryerVent: null,
    });
    setCheckoutOpen(true);
  };

  /**
   * The cart's fulfilment, as both the Details step and the final checkout
   * send it.
   *
   * Built in one place on purpose: the charges live on the fulfilment, so a
   * second hand-rolled copy of this payload is a second chance for the figure
   * the Payment step totals and the figure actually charged to disagree.
   */
  const buildFulfilmentPayload = () => {
    const address = fulfilment === "delivery" ? deliveryAddress : undefined;
    const platformCartDetails =
      fulfilment === "delivery"
        ? {
            fulfilment,
            delivery_date: orderDetails.scheduledFor || null,
            delivery_instructions:
              orderDetails.deliveryInstructions.trim() || null,
            steps_outside: deliverySurvey.stepsOutside,
            steps_inside: deliverySurvey.stepsInside,
            entrance_door: orderDetails.entranceDoor || null,
            entrance_level: orderDetails.entranceLevel || null,
            hoses_bought: orderDetails.hosesBought,
            door_removal: orderDetails.doorRemoval,
            dryer_vent: orderDetails.dryerVent,
            order_note: orderDetails.orderNote.trim() || null,
          }
        : {
            fulfilment,
            pickup_date: orderDetails.scheduledFor || null,
            pickup_instructions:
              orderDetails.pickupInstructions.trim() || null,
            order_note: orderDetails.orderNote.trim() || null,
          };

    return {
      cart: platformCartDetails,
      method: fulfilment,
      /**
       * `shippingFee` is the key the cart has always carried for the delivery
       * amount; it is operator-set now rather than copied from the store.
       * Zeroed on a pickup — nothing was delivered.
       */
      shippingFee: fulfilment === "delivery" ? amount(deliveryCharge) : 0,
      deliveryChargeTaxable,
      customCharge: amount(customCharge),
      customChargeLabel: customChargeLabel.trim() || null,
      customChargeTaxable,
      signatureData,
      marketingConsent,
      shippingAddress: address,
      billingAddress: address,
      stepsOutside:
        fulfilment === "delivery" ? deliverySurvey.stepsOutside : null,
      stepsInside:
        fulfilment === "delivery" ? deliverySurvey.stepsInside : null,
      scheduledFor: orderDetails.scheduledFor || null,
      deliveryInstructions:
        fulfilment === "delivery"
          ? orderDetails.deliveryInstructions.trim() || null
          : null,
      pickupInstructions:
        fulfilment === "pickup"
          ? orderDetails.pickupInstructions.trim() || null
          : null,
      orderNote: orderDetails.orderNote.trim() || null,
    };
  };

  /**
   * Pushes the charges to the cart and takes the repriced totals back.
   *
   * ! Called on leaving Details, not only at checkout. The charges live on the
   * ! cart, so until the server has them the Payment step is totalling a sale
   * ! that does not include them — the operator confirms one number and the
   * ! customer is charged another.
   */
  const syncCharges = async (): Promise<boolean> => {
    if (!cart) return false;
    try {
      setBusy(true);
      setError(null);
      const repriced = await client.request<PosCart>(`/carts/${cart.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          notes: orderDetails.orderNote.trim() || null,
          fulfilment: buildFulfilmentPayload(),
        }),
      });
      setCart(repriced);
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to apply the charges",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const completeCheckout = async () => {
    if (!cart || !customer || !session) return;
    try {
      setBusy(true);
      setError(null);
      /**
       * Sent again here even though Details already pushed it: the signature
       * is captured after that step, and this is the payload the sale is
       * actually committed with. Same builder, so the two cannot diverge.
       */
      const checkoutCart = await client.request<PosCart>(`/carts/${cart.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          notes: orderDetails.orderNote.trim() || null,
          fulfilment: buildFulfilmentPayload(),
        }),
      });
      setCart(checkoutCart);
      await client.request(`/carts/${cart.id}/payments`, {
        method: "PUT",
        body: JSON.stringify({
          /**
           * Nothing to take when a credit covers the sale: the payment line
           * would be for zero, which is not a payment and which every layer
           * below rightly refuses.
           */
          /**
           * ! `amount` is what is APPLIED to the sale; `tendered` is the cash
           * ! counted out. Sending the note instead of the amount applied would
           * ! overstate every cash sale by the change given.
           */
          payments:
            checkoutCart.grandTotal > 0
              ? [
                  {
                    method: paymentMethod,
                    amount: Math.min(amountNow, checkoutCart.grandTotal),
                    ...(tenderedNow !== null && tenderedNow > amountNow
                      ? { tendered: tenderedNow }
                      : {}),
                  },
                ]
              : [],
        }),
      });
      const order = await client.request<{
        orderId: string;
        number: string;
        externalOrderId: string;
        pickupCode?: string | null;
      }>(`/carts/${cart.id}/checkout`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey() },
        body: "{}",
      });
      setCheckoutOpen(false);
      setSaleDocument(
        buildSaleDocument({
          tenant,
          cart: checkoutCart,
          amountPaid: Math.min(amountNow, checkoutCart.grandTotal),
          balanceDue: Math.max(
            0,
            Math.round((checkoutCart.grandTotal - amountNow) * 100) / 100,
          ),
          tendered: tenderedNow,
          order,
          customer,
          fulfilment,
          signatureData,
          paymentMethod,
          session,
          theme,
          brandName,
          logoUrl,
          hostBusiness,
          stepsOutside: deliverySurvey.stepsOutside,
          stepsInside: deliverySurvey.stepsInside,
          scheduledFor: orderDetails.scheduledFor,
          deliveryInstructions: orderDetails.deliveryInstructions,
          pickupInstructions: orderDetails.pickupInstructions,
          orderNote: orderDetails.orderNote,
          entranceDoor: orderDetails.entranceDoor || null,
          entranceLevel: orderDetails.entranceLevel || null,
          hosesBought: orderDetails.hosesBought,
          doorRemoval: orderDetails.doorRemoval,
          dryerVent: orderDetails.dryerVent,
          address: deliveryAddress.line1 ? deliveryAddress : undefined,
        }),
      );
      setDocumentsOpen(true);
      onCheckout?.(order);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Finished with the completed sale: clear the till for the next customer.
   *
   * A reload rather than unwinding each piece of state by hand - the cart is
   * gone server-side once checkout commits, and a full reset is the only way
   * to be sure nothing from the last sale (customer, signature, fulfilment,
   * survey answers) leaks into the next one. This is what the removed
   * "Start another transaction" button did.
   */
  const resetAfterSale = () => window.location.reload();

  /* --------------------------------------------------------------- style */
  const s = useMemo(
    () => ({
      field: {
        // ! `border-box`, or the padding and border are added to the 100%
        // ! width and every input overflows the grid cell holding it.
        boxSizing: "border-box",
        width: "100%",
        height: 42,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: "0 12px",
        fontSize: 14,
        background: theme.surface,
        color: theme.ink,
        fontFamily: uiFont,
        outline: "none",
      } as React.CSSProperties,
      ghostButton: {
        height: 38,
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: theme.surface,
        color: theme.inkSoft,
        fontSize: 13,
        fontWeight: 700,
        padding: "0 14px",
        cursor: "pointer",
        fontFamily: uiFont,
      } as React.CSSProperties,
      primaryButton: {
        height: 44,
        minWidth: 132,
        borderRadius: 11,
        border: 0,
        background: theme.accent,
        color: "#fff",
        fontSize: 13.5,
        fontWeight: 800,
        padding: "0 18px",
        cursor: "pointer",
        fontFamily: uiFont,
        boxShadow: `0 5px 14px ${theme.accentShadow}`,
      } as React.CSSProperties,
      mono: {
        fontFamily: monoFont,
        fontSize: 10.5,
        color: theme.mutedLight,
      } as React.CSSProperties,
      label: {
        fontSize: 11.5,
        fontWeight: 800,
        letterSpacing: ".06em",
        color: theme.mutedLight,
      } as React.CSSProperties,
      modalBackdrop: {
        position: "fixed" as const,
        inset: 0,
        background: "rgba(10,25,20,.44)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: 16,
      },
      modal: {
        background: theme.surface,
        borderRadius: 18,
        border: `1px solid ${theme.borderSoft}`,
        boxShadow: "0 24px 60px rgba(16,22,20,.22)",
        display: "flex",
        flexDirection: "column" as const,
        maxHeight: "calc(100vh - 32px)",
      },
    }),
    [theme],
  );

  /* ---------------------------------------------------------------- gate */
  if (booting) {
    return <TillLoader theme={theme} height={frameHeight} />;
  }

  if (!session || !cart) {
    return (
      <div
        style={{
          height: frameHeight,
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: theme.bg,
          fontFamily: uiFont,
        }}
      >
        <div
          style={{
            maxWidth: 460,
            textAlign: "center",
            background: theme.surface,
            padding: 32,
            borderRadius: 16,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: theme.ink,
              marginBottom: 8,
            }}
          >
            The till could not be opened
          </div>
          <div style={{ fontSize: 13.5, color: theme.muted, lineHeight: 1.5 }}>
            {error ?? "POS is unavailable"}
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- till */
  return (
    <div
      className="shared-pos-root"
      style={{
        height: frameHeight,
        maxHeight: frameHeight,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: theme.bg,
        color: theme.ink,
        fontFamily: uiFont,
      }}
    >
      {/* The till is dropped into admin panels with their own global CSS.
			    Without this, a host that never set `border-box` makes every
			    padded input overflow the grid cell holding it. */}
      <style>{`.shared-pos-root, .shared-pos-root *, .shared-pos-root *::before, .shared-pos-root *::after { box-sizing: border-box; }
.shared-pos-root ::-webkit-scrollbar { width: 9px; height: 9px; }
.shared-pos-root ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 9px; }
.shared-pos-root ::-webkit-scrollbar-track { background: transparent; }`}</style>
      {/* ------------------------------------------------------ header */}
      <header
        style={{
          height: posLayout.headerHeight,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 16px",
          background: theme.surface,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 38,
              paddingLeft: 6,
              paddingRight: 12,
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              background: theme.surfaceAlt,
              cursor: "pointer",
              fontFamily: uiFont,
            }}
          >
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 28,
                height: 28,
                borderRadius: 8,
                background: theme.accent,
                color: "#fff",
              }}
            >
              <Icon path="M15 18l-6-6 6-6" size={15} width={2.4} />
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: theme.ink }}>
              Dashboard
            </span>
          </button>
        )}

        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: "-.02em",
            color: theme.ink,
          }}
        >
          {brandName}
        </span>
        {rental && (
          <span
            style={{
              borderRadius: 999,
              padding: "5px 11px",
              background: theme.accentSoft,
              color: theme.accentDeep,
              fontWeight: 800,
              fontSize: 11.5,
              letterSpacing: ".04em",
            }}
          >
            RENTAL
          </span>
        )}

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            paddingRight: 12,
            borderRight: `1px solid ${theme.borderSoft}`,
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 28,
              height: 28,
              borderRadius: 999,
              background: theme.accentSoft,
              color: theme.accent,
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {initials(session.displayName)}
          </span>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              lineHeight: 1.15,
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700, color: theme.ink }}>
              {session.displayName ?? "Staff"}
            </span>
            <span
              style={{ fontSize: 10.5, color: theme.muted }}
            >{`Store ${storeId}`}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          style={{
            display: "grid",
            placeItems: "center",
            width: 38,
            height: 38,
            borderRadius: 10,
            border: `1px solid ${theme.border}`,
            background: theme.surfaceAlt,
            color: theme.inkSoft,
            cursor: "pointer",
          }}
        >
          <Icon
            path={
              fullscreen
                ? "M9 3v6H3|M15 21v-6h6|M3 9l7-7|M21 15l-7 7"
                : "M15 3h6v6|M9 21H3v-6|M21 3l-7 7|M3 21l7-7"
            }
            size={19}
            width={2}
          />
        </button>

        {onUnauthorized && (
          <button
            type="button"
            onClick={() => setLogoutConfirmOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 38,
              borderRadius: 10,
              border: 0,
              padding: "0 16px",
              cursor: "pointer",
              background: theme.accent,
              color: "#fff",
              fontFamily: uiFont,
              fontSize: 13.5,
              fontWeight: 700,
            }}
          >
            <Icon
              path="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4|M16 17l5-5-5-5|M21 12H9"
              size={18}
            />
            Logout
          </button>
        )}
      </header>

      {error && (
        <div
          role="alert"
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            // Above every modal (the highest is 1300), so it is never dimmed behind one.
            zIndex: 2000,
            width: "min(420px, calc(100vw - 32px))",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
            background: theme.dangerBg,
            border: `1px solid ${theme.dangerBorder}`,
            color: theme.danger,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <Icon
            path="M12 9v4|M12 17h.01|M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
            size={16}
          />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              border: 0,
              background: "transparent",
              color: theme.danger,
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* ------------------------------------------- category rail */}
        <nav
          style={{
            width: posLayout.categoryRailWidth,
            flex: "none",
            display: "flex",
            flexDirection: "column",
            gap: 0,
            padding: "0 0 12px",
            overflowY: "auto",
            background: theme.surface,
            borderRight: `1px solid ${theme.border}`,
          }}
        >
          <span style={{ ...s.label, padding: "12px 12px 8px" }}>
            CATEGORIES
          </span>
          {[
            { id: null, name: "All products", count: catalogIndex.length },
            ...categories,
          ].map((node) => {
            const active = categoryId === node.id;
            return (
              <button
                type="button"
                key={node.id ?? "all"}
                onClick={() => {
                  setCategoryId(node.id);
                  void loadCatalog(search, node.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                  minHeight: 34,
                  margin: "0 8px 3px",
                  borderRadius: 9,
                  padding: "6px 10px",
                  border: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 13,
                  fontFamily: uiFont,
                  background: active ? theme.accent : "transparent",
                  color: active ? "#fff" : theme.inkSoft,
                  fontWeight: active ? 800 : 600,
                }}
              >
                <span style={{ lineHeight: 1.25 }}>{node.name}</span>
                <span
                  style={{
                    flex: "none",
                    borderRadius: 6,
                    padding: "1px 5px",
                    fontFamily: monoFont,
                    fontSize: 10,
                    background: active ? "rgba(255,255,255,.22)" : theme.bg,
                    color: active ? "#fff" : theme.mutedLight,
                  }}
                >
                  {node.count}
                </span>
              </button>
            );
          })}
        </nav>

        {/* ------------------------------------------- product grid */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ flex: "none", padding: "12px 12px 10px" }}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                searchedTerm.current = search;
                loadCatalog(search, categoryId);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 44,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                background: theme.surface,
                padding: "0 12px",
              }}
            >
              <Icon
                path="M11 18a7 7 0 100-14 7 7 0 000 14z|M20 20l-4.2-4.2"
                size={18}
                stroke={theme.muted}
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  rental
                    ? "Search a product, SKU or serial to rent out"
                    : "Search a product, SKU or model number"
                }
                aria-label="Search the catalogue"
                style={{
                  height: "100%",
                  flex: 1,
                  minWidth: 0,
                  border: "none",
                  background: "transparent",
                  fontSize: 14.5,
                  fontWeight: 500,
                  color: theme.ink,
                  outline: "none",
                  fontFamily: uiFont,
                }}
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch("");
                    searchedTerm.current = "";
                    loadCatalog("", categoryId);
                  }}
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: 0,
                    background: theme.bg,
                    cursor: "pointer",
                    color: theme.inkSoft,
                  }}
                >
                  <Icon path="M18 6L6 18M6 6l12 12" size={15} width={2.4} />
                </button>
              )}
            </form>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "0 12px 14px",
            }}
          >
            {loadingCatalog ? (
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  padding: "80px 0",
                  color: theme.muted,
                }}
              >
                Loading the floor…
              </div>
            ) : visible.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "80px 0",
                  color: theme.mutedLight,
                }}
              >
                <span
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: theme.inkSoft,
                  }}
                >
                  Nothing on the floor matches that
                </span>
                <span style={{ fontSize: 14 }}>
                  Try a shorter search, or clear the category filter.
                </span>
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <div
                  style={{
                    display: "grid",
                    alignItems: "stretch",
                    gridTemplateColumns: posTileColumns,
                    gap: posLayout.tileGap,
                  }}
                >
                  {sellable.map((product) => (
                    <ProductTile
                      key={product.id}
                      product={product}
                      theme={theme}
                      rental={rental}
                      money={money}
                      onChoose={openProduct}
                      imageBaseUrl={imageBaseUrl}
                    />
                  ))}
                </div>

                {outOfStock.length > 0 && (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        marginTop: 4,
                      }}
                    >
                      <span style={{ ...s.label, flex: "none" }}>
                        OUT OF STOCK
                      </span>
                      <span
                        style={{ height: 1, flex: 1, background: theme.border }}
                      />
                    </div>
                    <div
                      style={{
                        display: "grid",
                        alignItems: "stretch",
                        gridTemplateColumns: posTileColumns,
                        gap: posLayout.tileGap,
                      }}
                    >
                      {outOfStock.map((product) => (
                        <ProductTile
                          key={product.id}
                          product={product}
                          theme={theme}
                          rental={rental}
                          money={money}
                          onChoose={openProduct}
                          imageBaseUrl={imageBaseUrl}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </main>

        {/* -------------------------------------------- order ticket */}
        <aside
          style={{
            width: posLayout.cartWidth,
            flex: "none",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            background: theme.surface,
            borderLeft: `1px solid ${theme.border}`,
          }}
        >
          <div
            style={{
              flex: "none",
              display: "flex",
              alignItems: "baseline",
              gap: 9,
              padding: "16px 16px 10px",
            }}
          >
            <span
              style={{
                fontSize: 17,
                fontWeight: 800,
                letterSpacing: "-.02em",
                color: theme.ink,
              }}
            >
              Order
            </span>
            <span style={{ ...s.mono, fontSize: 12 }}>
              {itemsLabel(cart.lines.length)}
            </span>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                flex: "none",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: "0 16px 12px",
                minHeight: 120,
              }}
            >
              {cart.lines.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    borderRadius: 16,
                    border: `1px dashed ${theme.border}`,
                    background: theme.accentTint,
                    padding: "44px 20px",
                  }}
                >
                  <Icon
                    path="M3 5h2l2.4 11.2A2 2 0 009.36 18h8.2a2 2 0 001.96-1.6L21 8H6"
                    size={28}
                    stroke={theme.accentOutline}
                    width={1.9}
                  />
                  <span
                    style={{
                      fontSize: 15.5,
                      fontWeight: 700,
                      color: theme.inkSoft,
                    }}
                  >
                    Cart is empty
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: theme.mutedLight,
                      textAlign: "center",
                    }}
                  >
                    {serialized
                      ? "Choose a product, then pick its unit."
                      : "Choose a product to begin."}
                  </span>
                </div>
              ) : (
                cart.lines.map((line) => (
                  <React.Fragment key={line.id}>
                    <OrderLineCard
                      line={line}
                      rental={rental}
                      theme={theme}
                      money={money}
                      imageBaseUrl={imageBaseUrl}
                      busy={busy}
                      confirmingRemove={removeConfirmLineId === line.id}
                      onNote={() => {
                        setNoteLineId(line.id);
                        setNoteDraft(lineNote(line));
                      }}
                      onWarranty={() => setWarrantyLineId(line.id)}
                      onAskRemove={() => setRemoveConfirmLineId(line.id)}
                      onCancelRemove={() => setRemoveConfirmLineId(null)}
                      onRemove={() => {
                        setRemoveConfirmLineId(null);
                        void removeLine(line.id);
                      }}
                      onSelectOptionalFee={selectOptionalFee}
                    />
                    <div
                      key={line.id}
                      style={{
                        border: `1px solid ${theme.borderSoft}`,
                        borderRadius: 14,
                        padding: 11,
                        display: "none",
                        flexDirection: "column",
                        gap: 5,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13.5,
                            fontWeight: 700,
                            lineHeight: 1.25,
                            color: theme.ink,
                          }}
                        >
                          {line.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          disabled={busy}
                          aria-label={`Remove ${line.name}`}
                          style={{
                            border: 0,
                            background: "transparent",
                            color: theme.danger,
                            cursor: busy ? "not-allowed" : "pointer",
                            fontSize: 12.5,
                            fontWeight: 700,
                            flex: "none",
                            padding: 0,
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                        }}
                      >
                        {/* Which grade was assigned, on the ticket as well as in the picker -
											    it is part of what the customer is agreeing to. */}
                        {(() => {
                          const code = String(
                            (
                              line.metadata?.unit as
                                | Record<string, unknown>
                                | undefined
                            )?.grade ?? "",
                          ).toUpperCase();
                          if (!code) return null;
                          const chip = gradeChip[code] ?? gradeChipFallback;
                          return (
                            <span
                              style={{
                                flex: "none",
                                borderRadius: 5,
                                padding: "1px 5px",
                                fontFamily: monoFont,
                                fontSize: 10,
                                fontWeight: 800,
                                border: `1px solid ${chip.border}`,
                                background: chip.background,
                                color: chip.color,
                              }}
                            >
                              {code}
                            </span>
                          );
                        })()}
                        <span style={{ ...s.mono }}>
                          {line.serial
                            ? `SERIAL ${line.serial}`
                            : (line.sku ?? "—")}
                        </span>
                      </div>
                      {rental && line.rentalTenure && (
                        <div style={{ fontSize: 12, color: theme.muted }}>
                          {`${line.rentalTenure} month${line.rentalTenure === 1 ? "" : "s"}`}
                          {line.rentalStart && line.rentalEnd
                            ? ` · ${line.rentalStart.slice(0, 10)} → ${line.rentalEnd.slice(0, 10)}`
                            : ""}
                        </div>
                      )}

                      {/* What the customer keeps paying, and what they pay once. A rental card
									    that shows a single figure hides the fact that a recurring add-on is
									    charged again every period for the length of the agreement. */}
                      <LineCharges
                        line={line}
                        rental={rental}
                        theme={theme}
                        money={money}
                        busy={busy}
                        onSelectOptionalFee={selectOptionalFee}
                      />

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          marginTop: 2,
                        }}
                      >
                        <span style={{ fontSize: 12, color: theme.muted }}>
                          {rental ? "Due now" : money(line.unitPrice)}
                          {!rental && line.depositAmount > 0
                            ? ` + ${money(line.depositAmount)} deposit`
                            : ""}
                        </span>
                        <span
                          style={{
                            fontSize: 15,
                            fontWeight: 800,
                            color: theme.ink,
                          }}
                        >
                          {money(line.lineTotal)}
                        </span>
                      </div>
                    </div>
                  </React.Fragment>
                ))
              )}
            </div>

            {cart.lines.length > 0 && (
              <div
                style={{
                  marginTop: "auto",
                  flex: "none",
                  borderTop: `1px solid ${theme.borderSoft}`,
                  background: theme.accentTint,
                  padding: "12px 16px 14px",
                }}
              >
                <div
                  style={{
                    borderRadius: 14,
                    border: `1px solid ${theme.borderSoft}`,
                    background: theme.surface,
                    padding: "10px 12px",
                    display: "grid",
                    gap: 7,
                    fontSize: 13.5,
                  }}
                >
                  <PaymentSummary
                    cart={cart}
                    rental={rental}
                    theme={theme}
                    money={money}
                    taxes={session?.taxes}
                    compact
                  />
                </div>
              </div>
            )}
          </div>

          {cart.lines.length > 0 && (
            <div
              style={{
                flex: "none",
                padding: "12px 16px 14px",
                background: theme.surface,
                borderTop: `1px solid ${theme.borderSoft}`,
                boxShadow: "0 -6px 18px rgba(16,22,20,.05)",
              }}
            >
              {/*
                * Parking a sale, and picking one back up. Only on a platform
                * that supports held carts — the button would otherwise promise
                * something the service refuses.
                */}
              {canPark && (
                <div style={{ display: "flex", gap: 8, marginBottom: 9 }}>
                  <button
                    type="button"
                    disabled={busy || cart.lines.length === 0}
                    onClick={() => {
                      setParkName(customer?.name ?? "");
                      setParkNameOpen(true);
                    }}
                    style={{ ...s.ghostButton, flex: 1, height: 42 }}
                  >
                    Park sale
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setParkOpen(true);
                      void loadHeldCarts();
                    }}
                    style={{ ...s.ghostButton, flex: 1, height: 42 }}
                  >
                    Parked sales
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={openCheckout}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  height: 56,
                  width: "100%",
                  borderRadius: 14,
                  border: 0,
                  padding: "0 20px",
                  cursor: busy ? "not-allowed" : "pointer",
                  fontFamily: uiFont,
                  color: "#fff",
                  background: busy ? "#C9D3CE" : theme.accent,
                  boxShadow: busy ? "none" : `0 6px 18px ${theme.accentShadow}`,
                }}
              >
                <span
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    letterSpacing: "-.01em",
                  }}
                >
                  Continue to Checkout
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 17,
                    fontWeight: 800,
                  }}
                >
                  {money(cart.grandTotal)}
                  <Icon path="M5 12h13M13 6l6 6-6 6" size={19} width={2.6} />
                </span>
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* --------------------------------------------- unit picker */}
      {selected && (
        <div
          style={s.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={selected.name}
        >
          <div style={{ ...s.modal, width: "min(560px, 100%)" }}>
            <div
              style={{
                padding: "20px 22px 14px",
                borderBottom: `1px solid ${theme.borderSoft}`,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 800,
                  color: theme.ink,
                }}
              >
                {selected.name}
              </h2>
              <div style={{ ...s.mono, marginTop: 4 }}>
                {selected.sku ?? "NO SKU"} · {selected.availableCount} available
              </div>
            </div>

            <div
              style={{
                padding: 22,
                display: "grid",
                gap: 14,
                overflowY: "auto",
              }}
            >
              {serialized && (
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={s.label}>SERIALIZED UNIT</span>
                  {unitsLoading ? (
                    <div style={{ color: theme.muted, fontSize: 13.5 }}>
                      Loading units…
                    </div>
                  ) : units.length === 0 ? (
                    <div style={{ color: theme.muted, fontSize: 13.5 }}>
                      No units are free for this product right now.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gap: 6,
                        maxHeight: 260,
                        overflowY: "auto",
                      }}
                    >
                      {sortedUnits.map((unit) => {
                        const active = unitId === unit.id;
                        const grade = unitGrade(unit);
                        const chip = grade.code
                          ? (gradeChip[grade.code] ?? gradeChipFallback)
                          : null;
                        return (
                          <button
                            type="button"
                            key={unit.id}
                            onClick={() => setUnitId(unit.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              padding: "9px 12px",
                              borderRadius: 10,
                              cursor: "pointer",
                              textAlign: "left",
                              fontFamily: uiFont,
                              border: `1.5px solid ${active ? theme.accent : theme.border}`,
                              background: active
                                ? theme.accentSoft
                                : theme.surface,
                            }}
                          >
                            <span
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 9,
                                minWidth: 0,
                              }}
                            >
                              {/* The grade is the thing being chosen between. Two units of one
															    model differ by wear, not by serial number. */}
                              {chip && (
                                <span
                                  title={grade.label ?? undefined}
                                  style={{
                                    flex: "none",
                                    borderRadius: 6,
                                    padding: "2px 6px",
                                    fontFamily: monoFont,
                                    fontSize: 10.5,
                                    fontWeight: 800,
                                    border: `1px solid ${chip.border}`,
                                    background: chip.background,
                                    color: chip.color,
                                  }}
                                >
                                  {grade.code}
                                </span>
                              )}
                              <span
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  minWidth: 0,
                                  lineHeight: 1.3,
                                }}
                              >
                                <span
                                  style={{
                                    fontFamily: monoFont,
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    color: theme.ink,
                                  }}
                                >
                                  {unit.serial}
                                </span>
                                {(grade.label || grade.note) && (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: theme.mutedLight,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {[grade.label, grade.note]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 800,
                                flex: "none",
                                color: active ? theme.accentDeep : theme.ink,
                              }}
                            >
                              {money(unit.price)}
                              {rental ? "/mo" : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </label>
              )}

              {rental && (
                <div style={{ display: "grid", gap: 8 }}>
                  <span style={s.label}>RENTAL PERIOD</span>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 110px",
                      gap: 10,
                    }}
                  >
                    <label style={{ display: "grid", gap: 5 }}>
                      <span style={{ fontSize: 11, color: theme.muted }}>
                        Starts
                      </span>
                      <input
                        type="date"
                        style={s.field}
                        value={rentalStart}
                        onChange={(event) => changeStart(event.target.value)}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 5 }}>
                      <span style={{ fontSize: 11, color: theme.muted }}>
                        Ends
                      </span>
                      <input
                        type="date"
                        style={s.field}
                        value={rentalEnd}
                        min={rentalStart}
                        onChange={(event) => changeEnd(event.target.value)}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 5 }}>
                      <span style={{ fontSize: 11, color: theme.muted }}>
                        Months
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        inputMode="numeric"
                        style={s.field}
                        value={tenureInput}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => changeTenure(event.target.value)}
                        onBlur={commitTenure}
                      />
                    </label>
                  </div>
                  {/* Says out loud what the three controls now agree on: the operator is
										    committing a customer to a length of agreement, not to two dates and
										    a number that happen to sit beside each other. */}
                  <span style={{ fontSize: 12, color: theme.muted }}>
                    {`${tenure} month${tenure === 1 ? "" : "s"} · ${readable(rentalStart)} → ${readable(rentalEnd)}`}
                    {selected && selected.deposit > 0
                      ? ` · ${money(selected.deposit)} deposit`
                      : ""}
                  </span>
                </div>
              )}

              {/*
                * What this line pays the person adding it. Shown only when the
                * host supplies an answer, so a platform without commissions —
                * or an operator whose platform will not tell them — sees
                * nothing rather than an empty box.
                */}
              {commissionPreview && selected && (
                <CommissionHint
                  theme={theme}
                  money={money}
                  preview={commissionPreview}
                  input={{
                    productId: selected.id,
                    unitId: unitId || null,
                    // The unit's own rate when there is one: stock of one model
                    // is not interchangeable, and the line is priced from the
                    // machine actually being handed over.
                    unitPrice:
                      units.find((unit) => unit.id === unitId)?.price ??
                      selected.price,
                    tenure: rental ? tenure : 1,
                  }}
                />
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                padding: "0 22px 22px",
              }}
            >
              <button
                type="button"
                style={{ ...s.ghostButton, width: 110 }}
                onClick={() => {
                  setSelected(null);
                  setUnits([]);
                  setUnitId("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || (serialized && !unitId)}
                onClick={addSelected}
                style={{
                  height: 38,
                  width: 150,
                  borderRadius: 10,
                  border: 0,
                  fontFamily: uiFont,
                  fontSize: 13.5,
                  fontWeight: 800,
                  color: "#fff",
                  cursor:
                    busy || (serialized && !unitId) ? "not-allowed" : "pointer",
                  background:
                    busy || (serialized && !unitId) ? "#C9D3CE" : theme.accent,
                }}
              >
                Add to order
              </button>
            </div>
          </div>
        </div>
      )}

      {parkNameOpen && (
        <div
          style={{ ...s.modalBackdrop, zIndex: 1250 }}
          role="dialog"
          aria-modal="true"
          aria-label="Park this sale"
        >
          <form
            style={{ ...s.modal, width: "min(440px, 100%)", borderRadius: 18, padding: 22 }}
            onSubmit={(event) => {
              event.preventDefault();
              setParkNameOpen(false);
              // An empty name is still a park.
              void parkCart(parkName.trim() || null);
            }}
          >
            <h2 style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 800, color: theme.ink }}>
              Park this sale
            </h2>
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: theme.muted }}>
              Give it a name to find it by later. The units stay reserved.
            </p>
            <input
              autoFocus
              style={s.field}
              value={parkName}
              maxLength={80}
              placeholder="e.g. customer name"
              onChange={(event) => setParkName(event.target.value)}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button
                type="button"
                style={{ ...s.ghostButton, height: 42 }}
                onClick={() => setParkNameOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" style={{ ...s.primaryButton, height: 42 }}>
                Park sale
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ------------------------------------------------ checkout */}
      {parkOpen && (
        <div
          role="dialog"
          aria-label="Parked sales"
          onClick={() => setParkOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(16,22,20,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 460,
              maxHeight: "80vh",
              overflowY: "auto",
              background: theme.surface,
              borderRadius: 16,
              padding: 18,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: theme.ink }}>
                Parked sales
              </span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => setParkOpen(false)}
                style={{
                  background: "none",
                  border: 0,
                  cursor: "pointer",
                  color: theme.muted,
                  fontFamily: uiFont,
                  fontSize: 13,
                }}
              >
                Close
              </button>
            </div>

            {heldCarts === null && (
              <span style={{ fontSize: 13, color: theme.muted }}>Loading…</span>
            )}

            {heldCarts !== null && heldCarts.length === 0 && (
              <span style={{ fontSize: 13, color: theme.muted }}>
                Nothing is parked at this till.
              </span>
            )}

            {(heldCarts ?? []).map((held) => (
              <button
                key={held.id}
                type="button"
                disabled={busy}
                onClick={() => void resumeHeldCart(held.id)}
                style={{
                  display: "grid",
                  gap: 3,
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  cursor: busy ? "not-allowed" : "pointer",
                  fontFamily: uiFont,
                }}
              >
                <span
                  style={{ fontSize: 13.5, fontWeight: 800, color: theme.ink }}
                >
                  {held.heldName || held.customerName || "Unnamed sale"}
                </span>
                <span style={{ fontSize: 11.5, color: theme.muted }}>
                  {`${held.lineCount} item${held.lineCount === 1 ? "" : "s"} · ${money(held.grandTotal)}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div
          style={s.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Checkout"
        >
          <div
            style={{ ...s.modal, width: "min(720px, 100%)", borderRadius: 22 }}
          >
            <div
              style={{
                padding: "18px 22px 14px",
                borderBottom: `1px solid ${theme.borderSoft}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "grid", gap: 3 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 21,
                    fontWeight: 800,
                    letterSpacing: "-.02em",
                    color: theme.ink,
                  }}
                >
                  Checkout
                </h2>
                <span style={{ fontSize: 13.5, color: theme.muted }}>
                  Customer → Shipping → Details → Signature → Payment
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span
                  style={{ fontSize: 20, fontWeight: 800, color: theme.ink }}
                >
                  {money(cart.grandTotal)}
                </span>
                <button
                  type="button"
                  aria-label="Close checkout"
                  onClick={() => setCheckoutOpen(false)}
                  style={{
                    ...s.ghostButton,
                    width: 34,
                    height: 34,
                    padding: 0,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon path="M18 6L6 18M6 6l12 12" size={16} width={2.4} />
                </button>
              </div>
            </div>

            <div
              style={{
                padding: "14px 22px 22px",
                display: "grid",
                gap: 14,
                overflowY: "auto",
              }}
            >
              <ol
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                }}
              >
                {CHECKOUT_STEPS.map((entry, index) => {
                  const done = index < checkoutStepIndex;
                  const current = index === checkoutStepIndex;
                  return (
                    <React.Fragment key={entry.key}>
                      <li
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            display: "grid",
                            placeItems: "center",
                            width: 23,
                            height: 23,
                            borderRadius: 999,
                            flex: "none",
                            fontSize: 10.5,
                            fontWeight: 800,
                            border: `1.5px solid ${done || current ? theme.accent : theme.border}`,
                            background:
                              done || current ? theme.accent : theme.surface,
                            color: done || current ? "#fff" : theme.mutedLight,
                          }}
                        >
                          {done ? "✓" : index + 1}
                        </span>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: current ? 800 : 600,
                            color: current
                              ? theme.ink
                              : done
                                ? theme.accentDeep
                                : theme.mutedLight,
                          }}
                        >
                          {entry.label}
                        </span>
                      </li>
                      {index < CHECKOUT_STEPS.length - 1 && (
                        <span
                          style={{
                            height: 1,
                            flex: 1,
                            minWidth: 10,
                            background: done ? theme.accent : theme.borderSoft,
                          }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </ol>

              {checkoutStep === "customer" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "grid", gap: 7 }}>
                    <span style={s.label}>CUSTOMER</span>
                    <div style={{ position: "relative" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        style={s.field}
                        value={customerSearch}
                        placeholder="Search by name, email or phone"
                        // The browser's own saved-address list would sit on top of ours.
                        autoComplete="off"
                        name="pos-customer-search"
                        ref={customerInputRef}
                        onFocus={() => setCustomerOpen(true)}
                        onBlur={() => setCustomerOpen(false)}
                        onChange={(event) => {
                          customerEdited.current = true;
                          setCustomer(null);
                          setCustomerOpen(true);
                          setCustomerSearch(event.target.value);
                        }}
                      />
                      <button
                        type="button"
                        onClick={openNewCustomer}
                        style={{
                          ...s.ghostButton,
                          width: 48,
                          padding: 0,
                          fontSize: 20,
                          color: theme.accent,
                          height: 42,
                        }}
                      >
                        +
                      </button>
                    </div>
                    {/*
                      * A dropdown of fixed height under the box: the first
                      * customers when it is focused empty, matches as the
                      * cashier types. It scrolls inside itself rather than
                      * growing the dialog.
                      */}
                    {customers.length > 0 && !customer && customerOpen && (() => {
                      // Positioned against the screen, not the dialog: the dialog
                      // scrolls and clips, and the list should be free to run past it.
                      const box = customerInputRef.current?.getBoundingClientRect();
                      return (
                      <div
                        style={{
                          position: "fixed",
                          top: (box?.bottom ?? 0) + 4,
                          left: box?.left ?? 0,
                          width: box?.width ?? 320,
                          zIndex: 1400,
                          height: 220,
                          overflowY: "auto",
                          background: theme.surface,
                          border: `1px solid ${theme.border}`,
                          borderRadius: 10,
                          boxShadow: "0 10px 24px rgba(16,22,20,.14)",
                        }}
                      >
                        {customers.slice(0, 15).map((value) => (
                          <button
                            type="button"
                            key={value.id}
                            // Keeps the box focused, so choosing is not
                            // pre-empted by the blur that closes the list.
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => chooseCustomer(value)}
                            style={{
                              display: "block",
                              width: "100%",
                              border: 0,
                              textAlign: "left",
                              cursor: "pointer",
                              borderBottom: `1px solid ${theme.borderSoft}`,
                              background: theme.surface,
                              padding: "9px 11px",
                              fontFamily: uiFont,
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 700, color: theme.ink }}>
                              {value.name}
                            </span>
                            <div style={{ fontSize: 11.5, color: theme.muted }}>
                              {value.email ?? value.phone}
                            </div>
                          </button>
                        ))}
                      </div>
                      );
                    })()}
                    </div>
                    {customer && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                          padding: "9px 11px",
                          borderRadius: 10,
                          background: theme.accentSoft,
                          border: `1px solid ${theme.accentOutline}`,
                        }}
                      >
                        <span
                          style={{
                            display: "grid",
                            placeItems: "center",
                            width: 26,
                            height: 26,
                            borderRadius: 999,
                            background: theme.accent,
                            color: "#fff",
                            fontSize: 10.5,
                            fontWeight: 800,
                          }}
                        >
                          {initials(customer.name)}
                        </span>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            lineHeight: 1.2,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: theme.ink,
                            }}
                          >
                            {customer.name}
                          </span>
                          <span style={{ fontSize: 11.5, color: theme.muted }}>
                            {customer.email ?? customer.phone ?? ""}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      style={{ ...s.ghostButton, height: 44 }}
                      onClick={() => setCheckoutOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!customer || busy}
                      onClick={() => setCheckoutStep("shipping")}
                      style={{
                        ...s.primaryButton,
                        opacity: !customer || busy ? 0.55 : 1,
                      }}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {checkoutStep === "shipping" && (
                <div style={{ display: "grid", gap: 12 }}>
                  {/*
                    * Per item, because one order may mix them: the customer
                    * takes the microwave today and has the fridge delivered
                    * later. The choice below is the order's default and where
                    * it is delivered TO.
                    */}
                  {cart && cart.lines.length > 1 && (
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        padding: 14,
                        borderRadius: 13,
                        border: `1.5px solid ${theme.border}`,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: theme.ink }}>
                        How is each item going out?
                      </span>
                      {cart.lines.map((line) => {
                        const method = lineMethod(line);
                        return (
                          <div
                            key={line.id}
                            style={{ display: "flex", alignItems: "center", gap: 10 }}
                          >
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                fontSize: 13,
                                color: theme.inkSoft,
                              }}
                            >
                              {line.name}
                              {line.serial && (
                                <span style={{ marginLeft: 8, color: theme.mutedLight }}>
                                  {line.serial}
                                </span>
                              )}
                            </span>
                            <div style={{ display: "flex", gap: 6, flex: "none" }}>
                              {(["delivery", "pickup"] as const).map((option) => {
                                const active = method === option;
                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    disabled={busy}
                                    aria-pressed={active}
                                    onClick={() => void chooseLineMethod(line.id, option)}
                                    style={{
                                      padding: "4px 12px",
                                      borderRadius: 10,
                                      cursor: busy ? "not-allowed" : "pointer",
                                      fontFamily: uiFont,
                                      fontSize: 12,
                                      fontWeight: 700,
                                      border: `1.5px solid ${active ? theme.accent : theme.border}`,
                                      background: active ? theme.accentSoft : theme.surface,
                                      color: active ? theme.accentDeep : theme.muted,
                                    }}
                                  >
                                    {option === "pickup" ? "Pickup" : "Delivery"}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <span style={s.label}>
                    HOW WILL THE ORDER LEAVE THE STORE?
                  </span>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 9,
                    }}
                  >
                    {[
                      {
                        value: "pickup" as const,
                        title: "Customer pickup",
                        note: "No delivery address is required.",
                      },
                      {
                        value: "delivery" as const,
                        title: "Delivery",
                        /*
                         * No fee quoted: delivery is priced per job on the
                         * Details step now, so there is no store rate to show
                         * and `session.shippingFee` is always 0.
                         */
                        note: "Delivered to the customer.",
                      },
                    ].map((option) => {
                      const active = fulfilment === option.value;
                      return (
                        <button
                          type="button"
                          key={option.value}
                          disabled={busy}
                          onClick={() => void changeFulfilment(option.value)}
                          style={{
                            display: "grid",
                            gap: 4,
                            minHeight: 76,
                            padding: "12px 14px",
                            textAlign: "left",
                            borderRadius: 13,
                            cursor: busy ? "not-allowed" : "pointer",
                            fontFamily: uiFont,
                            border: `1.5px solid ${active ? theme.accent : theme.border}`,
                            background: active
                              ? theme.accentSoft
                              : theme.surface,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 800,
                              color: active ? theme.accentDeep : theme.ink,
                            }}
                          >
                            {option.title}
                          </span>
                          <span style={{ fontSize: 11.5, color: theme.muted }}>
                            {option.note}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {fulfilment === "delivery" && (
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        padding: 12,
                        borderRadius: 12,
                        border: `1px solid ${theme.border}`,
                        background: theme.surfaceAlt,
                      }}
                    >
                      <span style={s.label}>DELIVERY ADDRESS</span>
                      <GoogleAddressInput
                        apiKey={googleMapsApiKey}
                        address={deliveryAddress}
                        onAddressChange={setDeliveryAddress}
                        inputStyle={s.field}
                        disabled={busy}
                      />
                      {googleMapsApiKey && (
                        <span
                          style={{
                            marginTop: -3,
                            color: theme.mutedLight,
                            fontSize: 10.5,
                          }}
                        >
                          Start typing and choose a Google result to verify the
                          address.
                        </span>
                      )}
                      <input
                        style={s.field}
                        placeholder="Unit, suite or buzzer (optional)"
                        value={deliveryAddress.line2}
                        onChange={(event) =>
                          setDeliveryAddress({
                            ...deliveryAddress,
                            line2: event.target.value,
                          })
                        }
                      />
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                        }}
                      >
                        <input
                          style={s.field}
                          placeholder="City"
                          value={deliveryAddress.city}
                          onChange={(event) =>
                            setDeliveryAddress({
                              ...deliveryAddress,
                              city: event.target.value,
                            })
                          }
                        />
                        <input
                          style={s.field}
                          placeholder="Province / state"
                          value={deliveryAddress.state}
                          onChange={(event) =>
                            setDeliveryAddress({
                              ...deliveryAddress,
                              state: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                        }}
                      >
                        <input
                          style={s.field}
                          placeholder="Postal / ZIP code"
                          value={deliveryAddress.postalCode}
                          onChange={(event) =>
                            setDeliveryAddress({
                              ...deliveryAddress,
                              postalCode: event.target.value,
                            })
                          }
                        />
                        <select
                          style={s.field}
                          value={deliveryAddress.countryCode}
                          onChange={(event) =>
                            setDeliveryAddress({
                              ...deliveryAddress,
                              countryCode: event.target.value,
                              country:
                                event.target.value === "CA"
                                  ? "Canada"
                                  : "United States",
                            })
                          }
                        >
                          <option value="CA">Canada</option>
                          <option value="US">United States</option>
                        </select>
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      style={{ ...s.ghostButton, height: 44 }}
                      onClick={() => setCheckoutStep("customer")}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={!deliveryComplete || busy}
                      onClick={() => setCheckoutStep("details")}
                      style={{
                        ...s.primaryButton,
                        opacity: !deliveryComplete || busy ? 0.55 : 1,
                      }}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {checkoutStep === "details" && (
                <div style={{ display: "grid", gap: 14 }}>
                  {fulfilment === "delivery" ? (
                    <>
                      <span style={{ ...s.label, marginTop: 3 }}>DELIVERY</span>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 12,
                        }}
                      >
                        <label style={{ display: "grid", gap: 5 }}>
                          <span style={s.label}>DELIVERY DATE</span>
                          <input
                            style={s.field}
                            type="date"
                            value={orderDetails.scheduledFor}
                            onChange={(event) =>
                              setOrderDetails({
                                ...orderDetails,
                                scheduledFor: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label style={{ display: "grid", gap: 5 }}>
                          <span style={s.label}>ENTRANCE DOOR</span>
                          <select
                            style={s.field}
                            value={orderDetails.entranceDoor}
                            onChange={(event) =>
                              setOrderDetails({
                                ...orderDetails,
                                entranceDoor: event.target.value as
                                  | ""
                                  | "single"
                                  | "double",
                              })
                            }
                          >
                            <option value="">Not asked</option>
                            <option value="single">Single</option>
                            <option value="double">Double</option>
                          </select>
                        </label>
                        <label style={{ display: "grid", gap: 5 }}>
                          <span style={s.label}>LEVEL</span>
                          <select
                            style={s.field}
                            value={orderDetails.entranceLevel}
                            onChange={(event) =>
                              setOrderDetails({
                                ...orderDetails,
                                entranceLevel: event.target.value as
                                  | ""
                                  | "ground"
                                  | "upstairs"
                                  | "basement",
                              })
                            }
                          >
                            <option value="">Not asked</option>
                            <option value="ground">Ground level</option>
                            <option value="upstairs">Upstairs</option>
                            <option value="basement">Basement</option>
                          </select>
                        </label>
                        <div />
                        <label style={{ display: "grid", gap: 5 }}>
                          <span style={s.label}>STEPS OUTSIDE HOME</span>
                          <input
                            style={s.field}
                            type="number"
                            min={0}
                            step={1}
                            placeholder="0"
                            value={deliverySurvey.stepsOutside ?? ""}
                            onChange={(event) =>
                              setDeliverySurvey({
                                ...deliverySurvey,
                                stepsOutside: parseStepCount(
                                  event.target.value,
                                ),
                              })
                            }
                          />
                        </label>
                        <label style={{ display: "grid", gap: 5 }}>
                          <span style={s.label}>STEPS INSIDE HOME</span>
                          <input
                            style={s.field}
                            type="number"
                            min={0}
                            step={1}
                            placeholder="0"
                            value={deliverySurvey.stepsInside ?? ""}
                            onChange={(event) =>
                              setDeliverySurvey({
                                ...deliverySurvey,
                                stepsInside: parseStepCount(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      <span style={{ fontSize: 12, color: theme.muted }}>
                        Tick what applies. Extras are recorded for the driver
                        and charged on the day if needed.
                      </span>
                      <div style={{ display: "grid", gap: 9 }}>
                        {(
                          [
                            ["hosesBought", "Hoses bought"],
                            ["doorRemoval", "Door removal"],
                            ["dryerVent", "Dryer vent"],
                          ] as const
                        ).map(([key, label]) => (
                          <div
                            key={key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              fontSize: 13.5,
                              color: theme.ink,
                            }}
                          >
                            <span>{label}</span>
                            <div style={{ display: "flex", gap: 5 }}>
                              {([true, false] as const).map((answer) => {
                                const active = orderDetails[key] === answer;
                                return (
                                  <button
                                    key={String(answer)}
                                    type="button"
                                    aria-pressed={active}
                                    style={{
                                      ...s.ghostButton,
                                      height: 32,
                                      minWidth: 52,
                                      padding: "0 10px",
                                      color: active ? "#fff" : theme.inkSoft,
                                      background: active
                                        ? theme.accent
                                        : theme.surface,
                                      borderColor: active
                                        ? theme.accent
                                        : theme.border,
                                    }}
                                    onClick={() =>
                                      setOrderDetails({
                                        ...orderDetails,
                                        [key]: active ? null : answer,
                                      })
                                    }
                                  >
                                    {answer ? "Yes" : "No"}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      <label style={{ display: "grid", gap: 5 }}>
                        <span style={s.label}>DELIVERY INSTRUCTIONS</span>
                        <span style={{ fontSize: 11.5, color: theme.muted }}>
                          Enter one step per line. The slip numbers the steps.
                        </span>
                        <textarea
                          style={{ ...s.field, minHeight: 82, padding: 11 }}
                          value={orderDetails.deliveryInstructions}
                          placeholder={
                            "Park in the alley behind the house\nUse the side gate\nRemove the screen door"
                          }
                          onChange={(event) =>
                            setOrderDetails({
                              ...orderDetails,
                              deliveryInstructions: event.target.value,
                            })
                          }
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <span style={{ ...s.label, marginTop: 3 }}>PICKUP</span>
                      <label style={{ display: "grid", gap: 5 }}>
                        <span style={s.label}>PICKUP DATE</span>
                        <input
                          style={s.field}
                          type="date"
                          value={orderDetails.scheduledFor}
                          onChange={(event) =>
                            setOrderDetails({
                              ...orderDetails,
                              scheduledFor: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label style={{ display: "grid", gap: 5 }}>
                        <span style={s.label}>PICKUP INSTRUCTIONS</span>
                        <span style={{ fontSize: 11.5, color: theme.muted }}>
                          Enter one step per line. The slip numbers the steps.
                        </span>
                        <textarea
                          style={{ ...s.field, minHeight: 82, padding: 11 }}
                          value={orderDetails.pickupInstructions}
                          placeholder={
                            "Bring photo ID\nCollect from the rear loading bay\nBring straps"
                          }
                          onChange={(event) =>
                            setOrderDetails({
                              ...orderDetails,
                              pickupInstructions: event.target.value,
                            })
                          }
                        />
                      </label>
                    </>
                  )}
                  <label style={{ display: "grid", gap: 5 }}>
                    <span style={s.label}>NOTE (OPTIONAL)</span>
                    <textarea
                      style={{ ...s.field, minHeight: 68, padding: 11 }}
                      value={orderDetails.orderNote}
                      placeholder="Anything about this order - prints on the invoice."
                      onChange={(event) =>
                        setOrderDetails({
                          ...orderDetails,
                          orderNote: event.target.value,
                        })
                      }
                    />
                  </label>
                  {/* ── Charges the operator sets on this sale ── */}
                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                      padding: 14,
                      borderRadius: 14,
                      border: `1px solid ${theme.border}`,
                      background: theme.surfaceAlt,
                    }}
                  >
                    <span style={s.label}>CHARGES</span>

                    {/* Delivery only: a counter pickup has nothing to charge for. */}
                    {fulfilment === "delivery" && (
                      <div style={{ display: "grid", gap: 6 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <span style={{ flex: 1, fontSize: 13.5, color: theme.ink }}>
                            Delivery charge
                          </span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={deliveryCharge}
                            placeholder="0.00"
                            onChange={(event) => setDeliveryCharge(event.target.value)}
                            style={{ ...s.field, width: 120, textAlign: "right" }}
                          />
                        </div>
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            fontSize: 12,
                            color: theme.muted,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={deliveryChargeTaxable}
                            onChange={(event) =>
                              setDeliveryChargeTaxable(event.target.checked)
                            }
                            style={{ accentColor: theme.accent }}
                          />
                          Taxable
                        </label>
                      </div>
                    )}

                    <div style={{ display: "grid", gap: 6 }}>
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 10 }}
                      >
                        <input
                          type="text"
                          value={customChargeLabel}
                          placeholder="Custom charge (e.g. stair carry)"
                          maxLength={120}
                          onChange={(event) => setCustomChargeLabel(event.target.value)}
                          style={{ ...s.field, flex: 1 }}
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={customCharge}
                          placeholder="0.00"
                          onChange={(event) => setCustomCharge(event.target.value)}
                          style={{ ...s.field, width: 120, textAlign: "right" }}
                        />
                      </div>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          fontSize: 12,
                          color: theme.muted,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={customChargeTaxable}
                          onChange={(event) =>
                            setCustomChargeTaxable(event.target.checked)
                          }
                          style={{ accentColor: theme.accent }}
                        />
                        Taxable
                      </label>
                      {/*
                        * The invoice prints the label, so an amount without one
                        * would bill the customer for something unidentifiable.
                        * The platform refuses it too; this says so first.
                        */}
                      {amount(customCharge) > 0 && !customChargeLabel.trim() && (
                        <span style={{ fontSize: 11.5, color: theme.danger }}>
                          Describe the charge so it can be printed on the invoice.
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      style={{ ...s.ghostButton, height: 44 }}
                      onClick={() => setCheckoutStep("shipping")}
                    >
                      Back
                    </button>
                    {/*
                      * Applies the charges before advancing, so the Payment
                      * step totals the sale the customer will actually be
                      * charged. Only moves on if the cart came back repriced —
                      * advancing on a failed write would show a total that
                      * does not include what was just typed.
                      */}
                    <button
                      type="button"
                      disabled={
                        busy || (amount(customCharge) > 0 && !customChargeLabel.trim())
                      }
                      style={{
                        ...s.primaryButton,
                        opacity:
                          busy || (amount(customCharge) > 0 && !customChargeLabel.trim())
                            ? 0.55
                            : 1,
                      }}
                      onClick={async () => {
                        if (await syncCharges()) setCheckoutStep("signature");
                      }}
                    >
                      {busy ? "Applying…" : "Continue"}
                    </button>
                  </div>
                </div>
              )}

              {checkoutStep === "signature" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      borderRadius: 15,
                      border: `1px dashed ${signatureData ? theme.accentOutline : theme.border}`,
                      background: signatureData
                        ? theme.accentSoft
                        : theme.surfaceAlt,
                      padding: "20px 16px",
                      textAlign: "center",
                      fontSize: 13.5,
                      color: signatureData ? theme.accentDeep : theme.muted,
                    }}
                  >
                    {needsSignature
                      ? signatureData
                        ? "Signature captured. The order is ready for payment."
                        : "No order is completed until the customer has signed."
                      : "A customer signature is not required for this transaction."}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <button
                      type="button"
                      style={{ ...s.ghostButton, height: 44 }}
                      onClick={() => setCheckoutStep("details")}
                    >
                      Back
                    </button>
                    {needsSignature ? (
                      <button
                        type="button"
                        style={s.primaryButton}
                        onClick={() => {
                          setSignatureDraft(signatureData);
                          setSignatureOpen(true);
                        }}
                      >
                        {signatureData ? "Retake signature" : "Take signature"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={s.primaryButton}
                        onClick={() => setCheckoutStep("payment")}
                      >
                        Continue
                      </button>
                    )}
                  </div>
                </div>
              )}

              {checkoutStep === "payment" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${theme.borderSoft}`,
                      background: theme.accentTint,
                      padding: "11px 13px",
                      display: "grid",
                      gap: 6,
                      fontSize: 13.5,
                    }}
                  >
                    <PaymentSummary
                      cart={cart}
                      rental={rental}
                      theme={theme}
                      money={money}
                      taxes={session?.taxes}
                    />
                  </div>
                  <span style={s.label}>PAYMENT TYPE</span>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 7,
                    }}
                  >
                    {paymentOptions.map((option) => {
                      const active = paymentMethod === option.value;
                      return (
                        <button
                          type="button"
                          key={option.value}
                          aria-pressed={active}
                          onClick={() => setPaymentMethod(option.value)}
                          style={{
                            minHeight: 48,
                            borderRadius: 12,
                            padding: "0 8px",
                            cursor: "pointer",
                            border: `1.5px solid ${active ? theme.accent : theme.border}`,
                            background: active ? theme.accent : theme.surface,
                            color: active ? "#fff" : theme.inkSoft,
                            fontFamily: uiFont,
                            fontSize: 13,
                            fontWeight: active ? 800 : 600,
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {/*
                    * Taking less than the full amount, and counting out cash.
                    * Both are platform capabilities: a platform with nowhere to
                    * carry a balance never sees the deposit box, and one that
                    * does not record change never sees the tendered box.
                    */}
                  {(canTakeDeposit || (canGiveChange && paymentMethod === "cash")) && (
                    <div
                      style={{
                        display: "grid",
                        gap: 9,
                        borderRadius: 12,
                        border: `1px solid ${theme.borderSoft}`,
                        padding: "11px 13px",
                      }}
                    >
                      {canTakeDeposit && (
                        <label style={{ display: "grid", gap: 5 }}>
                          <span style={s.label}>
                            TAKING NOW — LEAVE EMPTY FOR THE FULL {money(amountDue)}
                          </span>
                          <input
                            style={s.field}
                            type="number"
                            min={0}
                            max={amountDue}
                            step="0.01"
                            inputMode="decimal"
                            placeholder={money(amountDue)}
                            value={amountInput}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => setAmountInput(event.target.value)}
                          />
                        </label>
                      )}

                      {canGiveChange && paymentMethod === "cash" && (
                        <label style={{ display: "grid", gap: 5 }}>
                          <span style={s.label}>CASH COUNTED OUT</span>
                          <input
                            style={s.field}
                            type="number"
                            min={0}
                            step="0.01"
                            inputMode="decimal"
                            placeholder={money(amountNow)}
                            value={tenderedInput}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => setTenderedInput(event.target.value)}
                          />
                        </label>
                      )}

                      {changeDue !== null && changeDue > 0 && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 14,
                            fontWeight: 800,
                            color: theme.ink,
                          }}
                        >
                          <span>Change due</span>
                          <span>{money(changeDue)}</span>
                        </div>
                      )}

                      {balanceDue > 0 && (
                        <div
                          style={{
                            display: "grid",
                            gap: 3,
                            borderTop: `1px solid ${theme.borderSoft}`,
                            paddingTop: 7,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: 14,
                              fontWeight: 800,
                              color: theme.ink,
                            }}
                          >
                            <span>Balance on delivery</span>
                            <span>{money(balanceDue)}</span>
                          </div>
                          <span style={{ fontSize: 11.5, color: theme.muted }}>
                            {fulfilment === "delivery"
                              ? "Printed on the delivery slip for the driver to collect."
                              : "A counter pickup must be paid in full — switch to delivery or take the whole amount."}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      style={{ ...s.ghostButton, width: 120, height: 52 }}
                      onClick={() => setCheckoutStep("signature")}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={checkoutDisabled}
                      onClick={completeCheckout}
                      style={{
                        ...s.primaryButton,
                        flex: 1,
                        height: 52,
                        fontSize: 16,
                        opacity: checkoutDisabled ? 0.55 : 1,
                      }}
                    >
                      {busy
                        ? "Completing…"
                        : `Complete checkout · ${money(cart.grandTotal)}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {signatureOpen && (
        <div
          style={{ ...s.modalBackdrop, zIndex: 1200 }}
          role="dialog"
          aria-modal="true"
          aria-label="Customer signature"
        >
          <div
            style={{
              ...s.modal,
              /*
               * The pad is laid out at 100% of this dialog, so the dialog is
               * what actually caps how long a signature can be. Widened for
               * a full-width signing area on a counter screen; `100%` still
               * keeps it inside a narrow tablet.
               */
              width: "min(920px, 100%)",
              borderRadius: 22,
              padding: 22,
            }}
          >
            <h2
              style={{
                margin: "0 0 4px",
                fontSize: 20,
                fontWeight: 800,
                color: theme.ink,
              }}
            >
              Customer signature
            </h2>
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                margin: "0 0 15px",
                fontSize: 11.5,
                lineHeight: 1.4,
                color: theme.muted,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(event) => setMarketingConsent(event.target.checked)}
                style={{
                  width: 14,
                  height: 14,
                  margin: "1px 0 0",
                  accentColor: theme.accent,
                }}
              />
              <span>
                I agree to receive marketing messages and promotional calls.
                Consent is optional and can be withdrawn at any time.
              </span>
            </label>
            <SignaturePad onChange={setSignatureDraft} theme={theme} />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 18,
              }}
            >
              <button
                type="button"
                style={{ ...s.ghostButton, height: 44 }}
                onClick={() => setSignatureOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!signatureDraft}
                onClick={() => {
                  setSignatureData(signatureDraft);
                  setSignatureOpen(false);
                  setCheckoutStep("payment");
                }}
                style={{
                  ...s.primaryButton,
                  opacity: signatureDraft ? 1 : 0.55,
                }}
              >
                Confirm signature
              </button>
            </div>
          </div>
        </div>
      )}

      {logoutConfirmOpen && (
        <div
          style={{ ...s.modalBackdrop, zIndex: 1300 }}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm logout"
        >
          <div
            style={{
              ...s.modal,
              width: "min(440px, 100%)",
              borderRadius: 18,
              padding: 22,
            }}
          >
            <h2
              style={{
                margin: "0 0 7px",
                fontSize: 19,
                fontWeight: 800,
                color: theme.ink,
              }}
            >
              Log out of the POS?
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                lineHeight: 1.5,
                color: theme.muted,
              }}
            >
              Make sure the current transaction is held or completed before
              leaving.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 20,
              }}
            >
              <button
                type="button"
                style={{ ...s.ghostButton, height: 42 }}
                onClick={() => setLogoutConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{ ...s.primaryButton, height: 42 }}
                onClick={onUnauthorized}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        * There is no "Checkout complete" interstitial. The till used to stop
        * on a dialog offering "Print documents" / "Start another
        * transaction"; the sale is already committed by then, so the dialog
        * only stood between the operator and the next customer.
        *
        * What it carried has not been dropped. The documents view below opens
        * straight away instead, and it shows the new order number in its own
        * header - the two things the dialog existed for. Closing it resets
        * the till, exactly as "Start another transaction" did.
        */}
      {documentsOpen && saleDocument && (
        <PosSaleDocuments
          document={saleDocument}
          theme={theme}
          // Done = finished with this sale. Resets the till for the next one,
          // which is what "Start another transaction" used to do.
          onClose={resetAfterSale}
        />
      )}

      {warrantyLineId && (() => {
        const target = cart?.lines.find((entry) => entry.id === warrantyLineId);
        if (!target) return null;
        const plans = target.availableWarranties ?? [];
        return (
          <div
            style={{ ...s.modalBackdrop, zIndex: 1250 }}
            role="dialog"
            aria-modal="true"
            aria-label="Extended warranty"
          >
            <div style={{ ...s.modal, width: "min(640px, 100%)", borderRadius: 18, padding: 22 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 800, color: theme.ink }}>
                Extended warranty
              </h2>
              <p style={{ margin: "0 0 14px", fontSize: 12.5, color: theme.muted }}>
                For {target.name}. Charged once with this rental and printed on the invoice.
              </p>
              {plans.length === 0 ? (
                <p style={{ fontSize: 13, color: theme.muted }}>
                  No warranty is offered with this rental.
                </p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                  {plans.map((plan) => {
                    const active = target.warranty?.id === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        disabled={busy}
                        onClick={() => void chooseWarranty(target.id, plan.id)}
                        style={{
                          textAlign: "left",
                          padding: 12,
                          borderRadius: 12,
                          cursor: "pointer",
                          fontFamily: uiFont,
                          border: `1.5px solid ${active ? theme.accent : theme.border}`,
                          background: active ? theme.accentSoft : theme.surface,
                          color: theme.ink,
                        }}
                      >
                        <div style={{ fontSize: 13.5, fontWeight: 800 }}>{plan.title}</div>
                        <div style={{ marginTop: 4, fontSize: 11.5, color: theme.muted }}>
                          {plan.durationMonths === 0
                            ? "As-is, no cover period"
                            : `${plan.durationMonths} month${plan.durationMonths === 1 ? "" : "s"} of cover`}
                        </div>
                        <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: theme.accentDeep }}>
                          {money(plan.price * target.quantity)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  disabled={busy || !target.warranty}
                  style={{ ...s.ghostButton, height: 42, opacity: target.warranty ? 1 : 0.5 }}
                  onClick={() => void chooseWarranty(target.id, null)}
                >
                  No warranty on this item
                </button>
                <button
                  type="button"
                  style={{ ...s.primaryButton, height: 42 }}
                  onClick={() => setWarrantyLineId(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {noteLineId && (
        <div
          style={{ ...s.modalBackdrop, zIndex: 1250 }}
          role="dialog"
          aria-modal="true"
          aria-label="Order item note"
        >
          <div
            style={{
              ...s.modal,
              width: "min(500px, 100%)",
              borderRadius: 18,
              padding: 22,
            }}
          >
            <h2
              style={{
                margin: "0 0 5px",
                fontSize: 19,
                fontWeight: 800,
                color: theme.ink,
              }}
            >
              Item note
            </h2>
            <p
              style={{ margin: "0 0 13px", fontSize: 12.5, color: theme.muted }}
            >
              This note stays visible on the item card and prints with the item.
            </p>
            <textarea
              autoFocus
              value={noteDraft}
              maxLength={2000}
              rows={5}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Add condition, handling or customer instructions for this item"
              style={{
                ...s.field,
                height: 118,
                resize: "vertical",
                padding: 12,
                lineHeight: 1.45,
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 16,
              }}
            >
              <button
                type="button"
                style={{ ...s.ghostButton, height: 42 }}
                onClick={() => {
                  setNoteLineId(null);
                  setNoteDraft("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                style={{
                  ...s.primaryButton,
                  height: 42,
                  opacity: busy ? 0.55 : 1,
                }}
                onClick={() => void saveLineNote()}
              >
                {busy ? "Saving…" : "Save note"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------- new customer */}
      {showNewCustomer && (
        <NewCustomerForm
          client={client}
          theme={theme}
          emailVerification={session?.capabilities.customerEmailVerification === true}
          googleMapsApiKey={googleMapsApiKey}
          onClose={closeNewCustomer}
          onCreated={customerCreated}
        />
      )}
    </div>
  );
};

/**
 * Turns the cart that was just committed into the printed document.
 *
 * Built from the cart rather than from the checkout response because the
 * platforms return different shapes - Appliance Outlet hands back a full
 * invoice, Rent Buddyz an order id - while the cart the till priced is the same
 * object on both, and it is what the customer actually agreed to.
 */
const buildSaleDocument = (input: {
  tenant: SharedPosProps["tenant"];
  cart: PosCart;
  /** What was applied to the sale now, and what the driver still collects. */
  amountPaid?: number;
  balanceDue?: number;
  /** Cash counted out, when change was given. */
  tendered?: number | null;
  order: { number: string; pickupCode?: string | null };
  customer: Customer;
  fulfilment: "pickup" | "delivery";
  signatureData: string | null;
  stepsOutside: number | null;
  stepsInside: number | null;
  scheduledFor: string;
  deliveryInstructions: string;
  pickupInstructions: string;
  orderNote: string;
  entranceDoor: "single" | "double" | null;
  entranceLevel: "ground" | "upstairs" | "basement" | null;
  hosesBought: boolean | null;
  doorRemoval: boolean | null;
  dryerVent: boolean | null;
  paymentMethod: string;
  session: PosSession;
  theme: PosTheme;
  brandName: string;
  logoUrl?: string | null;
  hostBusiness?: Partial<NonNullable<PosSession["business"]>>;
  address?: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}): PosSaleDocument => {
  const { cart, session, address } = input;
  const currencySign =
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cart.currency || session.currency || "USD",
    })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? "$";

  // The host's letterhead wins wherever it says something; the platform's
  // session fills whatever the host leaves out.
  const defined = <T extends object>(value: T | null | undefined) =>
    Object.fromEntries(
      Object.entries(value ?? {}).filter(
        ([, v]) => v !== undefined && v !== null && v !== "",
      ),
    ) as Partial<T>;
  const store = {
    ...defined(session.business),
    ...defined(input.hostBusiness),
  } as Partial<NonNullable<PosSession["business"]>>;
  const business = {
    name: store?.name || input.brandName,
    logoUrl: input.logoUrl ?? null,
    addressLines: store?.addressLines ?? [],
    phone: store?.phone ?? null,
    website: store?.website ?? null,
    email: store?.email ?? null,
    registrationLabel: store?.registrationLabel ?? null,
    registrationNumber: store?.registrationNumber ?? null,
    currencySign,
    // The store's website terms are not printed on the invoice.
    terms: null,
    accent: input.theme.accent,
    // 172 prints as RB-INV-00172, the way Appliance Outlet writes AO-INV-00042.
    invoicePrefix: input.tenant === "rent-buddyz" ? "RB-INV-" : "AO-INV-",
  };

  const rental = cart.kind === "RENTAL";
  const tenure =
    cart.lines.find((line) => line.rentalTenure)?.rentalTenure ?? null;
  const period = cart.lines.find((line) => line.rentalStart && line.rentalEnd);

  // Only a mixed order says how each item goes out; otherwise it is the same
  // for all of them and the header already says so.
  const mixedFulfilment =
    new Set(cart.lines.map((line) => line.fulfilment ?? input.fulfilment)).size > 1;

  const items = cart.lines.flatMap((line) => {
    const details: string[] = [];
    if (line.sku) details.push(`SKU ${line.sku}`);
    if (mixedFulfilment) {
      details.push(
        (line.fulfilment ?? input.fulfilment) === "pickup"
          ? "Customer pickup"
          : "Delivery",
      );
    }
    if (rental && line.rentalTenure) {
      details.push(
        `${line.rentalTenure} month${line.rentalTenure === 1 ? "" : "s"}`,
      );
    }
    if (line.rentalStart && line.rentalEnd) {
      details.push(
        `${line.rentalStart.slice(0, 10)} to ${line.rentalEnd.slice(0, 10)}`,
      );
    }
    for (const attribute of lineAttributes(line).filter(
      (entry) => entry.selected !== false,
    )) {
      details.push(
        `${attribute.name}${attribute.recurring ? " (recurring)" : ""}`,
      );
    }
    if (line.depositAmount > 0) details.push("Refundable deposit held");
    const conditionNote = (
      line.metadata?.unit as Record<string, unknown> | undefined
    )?.conditionNote;
    if (typeof conditionNote === "string" && conditionNote.trim()) {
      details.push(conditionNote.trim());
    }
    const note = lineNote(line);
    if (note) details.push(`Note: ${note}`);

    const mainItem = {
      // Which slip it goes on: its own choice, else the order's.
      fulfilment: (line.fulfilment ?? input.fulfilment) as "pickup" | "delivery",
      quantity: line.quantity,
      description: line.name,
      reference: line.serial ?? line.sku ?? null,
      grade:
        String(
          (line.metadata?.unit as Record<string, unknown> | undefined)?.grade ??
            "",
        ) || null,
      gradeLabel:
        String(
          (line.metadata?.unit as Record<string, unknown> | undefined)
            ?.gradeLabel ?? "",
        ) || null,
      details,
      unitPrice: line.unitPrice,
      // The table is pre-tax, as on the AO invoice. Fees, deposits and tax
      // have their own summary rows and must not be counted into an item twice.
      amount: line.unitPrice * line.quantity,
    };
    // A warranty sold with the rental is its own line, as at Appliance Outlet:
    // named, priced, and counted in the totals below.
    const warrantyItem = line.warranty
      ? {
          quantity: 1,
          description: "Extended Warranty",
          reference: "-",
          grade: null,
          warranty: true,
          details: [
            `${line.warranty.title} - ${
              line.warranty.durationMonths === 0
                ? "as-is"
                : `${line.warranty.durationMonths} month${line.warranty.durationMonths === 1 ? "" : "s"}`
            }`,
          ],
          unitPrice: line.warranty.total,
          amount: line.warranty.total,
        }
      : null;
    return warrantyItem ? [mainItem, warrantyItem] : [mainItem];
  });

  const recurringFees = groupedFees(cart, true, true);
  const oneTimeFees = groupedFees(cart, false, true);
  const recurringFeeTotal = recurringFees.reduce(
    (total, fee) => total + fee.amount,
    0,
  );
  const baseCurrentPeriod = Math.max(0, cart.subtotal - recurringFeeTotal);
  const exemption = taxExemption(cart);
  const preTaxTotal =
    cart.subtotal +
    cart.feeTotal +
    (cart.warrantyTotal ?? 0) +
    cart.shippingTotal +
    (cart.customTotal ?? 0) +
    cart.depositTotal;
  const taxLabel = exemption.exempt
    ? `Tax exempt${exemption.reason ? ` - ${exemption.reason}` : ""}`
    : cart.taxRate > 0
      ? `Tax (${(cart.taxRate * 100).toFixed(2).replace(/\.00$/, "")}%)`
      : "Tax";
  const taxRows = exemption.exempt
    ? null
    : taxBreakdown(session.taxes, cart.taxTotal);
  // "GST (5%)" prints as "GST 5%", in capitals, like AO's "SALES TAX 9.1%".
  const plainTaxLabel = (label: string): string =>
    label.replace("(", "").replace(")", "");

  /**
   * What was taken now. Defaults to the whole sale, so a document built without
   * these figures reads exactly as it did before deposits existed.
   */
  const paidNow = input.amountPaid ?? cart.grandTotal;
  const changeGiven =
    input.tendered != null
      ? Math.max(0, Math.round((input.tendered - paidNow) * 100) / 100)
      : 0;
  const totals = [
    // What the goods actually cost: any markdown is already taken off, so there
    // is no MSRP-then-discount pair to subtract in your head.
    { label: "Amount", value: rental ? baseCurrentPeriod : cart.subtotal },
    ...recurringFees.map((fee) => ({ label: fee.name, value: fee.amount })),
    ...oneTimeFees.map((fee) => ({ label: fee.name, value: fee.amount })),
    ...(cart.feeTotal > 0 && oneTimeFees.length === 0
      ? [{ label: "Fees", value: cart.feeTotal }]
      : []),
    ...((cart.warrantyTotal ?? 0) > 0
      ? [{ label: "Warranty", value: cart.warrantyTotal ?? 0 }]
      : []),
    ...(cart.shippingTotal > 0
      ? [{ label: "Delivery", value: cart.shippingTotal }]
      : []),
    // Printed under its own label — an unexplained amount on an invoice is
    // what the label exists to prevent.
    ...((cart.customTotal ?? 0) > 0
      ? [{
        label: cart.customChargeLabel?.trim() || "Additional charge",
        value: cart.customTotal ?? 0,
      }]
      : []),
    ...(cart.depositTotal > 0
      ? [{ label: "Security deposit (refundable)", value: cart.depositTotal }]
      : []),
    { label: "Subtotal", value: preTaxTotal, emphasis: true },
    // One row per configured tax where the store has more than one, so the
    // printed invoice itemises GST and PST rather than a combined figure.
    ...(taxRows
      ? taxRows.map((row) => ({
          label: plainTaxLabel(row.label),
          value: row.amount,
          emphasis: true,
        }))
      : [
          {
            label: plainTaxLabel(taxLabel),
            value: cart.taxTotal,
            emphasis: true,
          },
        ]),
    // A replacement credit pays part of what is owed after tax, as on the
    // till's own summary, so the printed rows still add up to the TOTAL.
    ...((cart.creditTotal ?? 0) > 0
      ? [
          {
            label: cart.creditLabel || "Exchange credit",
            value: Math.min(cart.creditTotal ?? 0, preTaxTotal + cart.taxTotal),
            negative: true,
          },
        ]
      : []),
    { label: "Total", value: cart.grandTotal, emphasis: true },
    { label: "Deposit", value: cart.grandTotal, emphasis: true },
    { label: "Balance", value: 0, emphasis: true },
  ];
  const agreementRecurringTotal = cart.lines.reduce(
    (total, line) =>
      total + line.unitPrice * line.quantity * (line.rentalTenure ?? 1),
    0,
  );
  const futureRecurringTotal = Math.max(
    0,
    agreementRecurringTotal - cart.subtotal,
  );
  const recurringSummary = rental
    ? [
        { label: "Recurring charge each period", value: cart.subtotal },
        { label: "Remaining scheduled payments", value: futureRecurringTotal },
        {
          label: "Recurring total over term",
          value: agreementRecurringTotal,
          emphasis: true,
        },
      ]
    : undefined;

  const shipLines = address
    ? ([
        address.line1,
        address.line2,
        `${address.city}, ${address.state} ${address.postalCode}`,
        address.country,
      ].filter(Boolean) as string[])
    : [];

  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return {
    business,
    number: input.order.number,
    date: today,
    kind: rental ? "RENTAL" : "SALE",
    fulfilment: input.fulfilment,
    soldTo: {
      name: input.customer.name,
      lines: shipLines,
    },
    shipTo:
      input.fulfilment === "delivery"
        ? { name: input.customer.name, lines: shipLines }
        : { name: "CUSTOMER PICKUP", lines: [] },
    items,
    totals,
    recurringSummary,
    paymentNote: rental
      ? "Future-period tax is calculated when each recurring payment is billed."
      : null,
    // A till usually takes the whole amount before the goods leave, so this
    // normally prints zero. When a delivery was booked on a deposit it is
    // exactly what the person at the door has to collect.
    balance: input.balanceDue ?? 0,
    term:
      rental && tenure
        ? `${tenure} month${tenure === 1 ? "" : "s"}${
            period?.rentalStart && period?.rentalEnd
              ? ` from ${period.rentalStart.slice(0, 10)} to ${period.rentalEnd.slice(0, 10)}`
              : ""
          }`
        : null,
    tender: `Paid by ${input.paymentMethod.replace(/_/g, " ")} - ${new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency: cart.currency || session.currency || "USD",
      },
    ).format(paidNow)}`,
    payments: [
      {
        label: input.paymentMethod
          .replace(/_/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
        amount: paidNow,
      },
      /**
       * Cash counted out and the change handed back, each on its own line. A
       * customer checking the slip against the notes in their hand should find
       * both figures on it.
       */
      ...(changeGiven > 0
        ? [
            { label: "Cash tendered", amount: input.tendered ?? 0 },
            { label: "Change given", amount: changeGiven },
          ]
        : []),
    ],
    notes: input.orderNote.trim() || null,
    deliveryInstructions: input.deliveryInstructions.trim() || null,
    pickupInstructions: input.pickupInstructions.trim() || null,
    signature: input.signatureData,
    stepsOutside: input.fulfilment === "delivery" ? input.stepsOutside : null,
    stepsInside: input.fulfilment === "delivery" ? input.stepsInside : null,
    scheduledFor: input.scheduledFor || null,
    entranceDoor: input.entranceDoor,
    entranceLevel: input.entranceLevel,
    hosesBought: input.hosesBought,
    doorRemoval: input.doorRemoval,
    dryerVent: input.dryerVent,
    pickupCode: input.order.pickupCode ?? null,
  };
};

const blankDeliveryAddress = (
  tenant: SharedPosProps["tenant"],
): PosAddress => ({
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: tenant === "rent-buddyz" ? "Canada" : "United States",
  countryCode: tenant === "rent-buddyz" ? "CA" : "US",
});

const parseStepCount = (value: string): number | null => {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
};

/**
 * One display row per configured tax (GST, PST, ...), from the single charged
 * figure.
 *
 * The cart is priced with one combined rate, so the per-tax amounts have to be
 * apportioned back out rather than recomputed: recomputing from a base would
 * drift from what was actually charged, because tax is rounded per line and
 * deposits are outside the base. Shares are taken in proportion to each rate
 * and the last row absorbs the rounding remainder, so the rows always add up
 * to `taxTotal` exactly.
 *
 * Returns `null` when there is nothing to break out - no breakdown reported,
 * or a single tax - and the caller keeps the existing one-line display.
 */
const taxBreakdown = (
  taxes: { name: string; rate: number }[] | undefined,
  taxTotal: number,
): { label: string; amount: number }[] | null => {
  const configured = (taxes ?? []).filter((tax) => tax.rate > 0);
  if (configured.length < 2) return null;

  const totalRate = configured.reduce((sum, tax) => sum + tax.rate, 0);
  if (totalRate <= 0) return null;

  const cents = Math.round(taxTotal * 100);
  let allocated = 0;
  return configured.map((tax, index) => {
    const last = index === configured.length - 1;
    const share = last
      ? cents - allocated
      : Math.round((cents * tax.rate) / totalRate);
    allocated += share;
    const percent = (tax.rate * 100).toFixed(2).replace(/\.?0+$/, "");
    return { label: `${tax.name} (${percent}%)`, amount: share / 100 };
  });
};

/**
 * Why a cart carries no tax, when it carries none.
 *
 * ! Without this the breakdown read "Taxable amount $1,299.99 / Tax $0.00" for
 * ! a reseller - a total that looks like the till forgot the tax, shown to the
 * ! person who has to decide whether to believe it.
 */
const taxExemption = (
  cart: PosCart,
): { exempt: boolean; reason: string | null } => ({
  exempt: Boolean(cart.customerSnapshot?.taxExempt),
  reason: cart.customerSnapshot?.taxExemptReason
    ? String(cart.customerSnapshot.taxExemptReason)
    : null,
});

interface LineAttribute {
  id: string;
  name: string;
  value: number;
  recurring: boolean;
  optional?: boolean;
  selected?: boolean;
}

const lineAttributes = (line: PosCart["lines"][number]): LineAttribute[] => {
  const product = (line.metadata?.product ?? {}) as Record<string, unknown>;
  return (
    Array.isArray(product.attributes) ? product.attributes : []
  ) as LineAttribute[];
};

const lineNote = (line: PosCart["lines"][number]): string =>
  typeof line.metadata?.additionalNote === "string"
    ? line.metadata.additionalNote
    : "";

const OrderLineCard = ({
  line,
  rental,
  theme,
  money,
  imageBaseUrl,
  busy,
  confirmingRemove,
  onNote,
  onWarranty,
  onAskRemove,
  onCancelRemove,
  onRemove,
  onSelectOptionalFee,
}: {
  line: PosCart["lines"][number];
  rental: boolean;
  theme: PosTheme;
  money: (value: number) => string;
  imageBaseUrl?: string;
  busy: boolean;
  confirmingRemove: boolean;
  onNote: () => void;
  onWarranty: () => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
  onSelectOptionalFee: (
    lineId: string,
    attributeId: string,
    selected: boolean,
  ) => void;
}) => {
  const unit = (line.metadata?.unit ?? {}) as Record<string, unknown>;
  const code = String(unit.grade ?? "").toUpperCase();
  const gradeLabel = String(unit.gradeLabel ?? (code || "Unassessed"));
  const conditionNote = unit.conditionNote ? String(unit.conditionNote) : "";
  const chip = code
    ? (gradeChip[code] ?? gradeChipFallback)
    : gradeChipFallback;
  const note = lineNote(line);
  const image = resolveImage(line.imageUrl ?? null, imageBaseUrl);
  const discounted =
    line.originalUnitPrice !== null && line.originalUnitPrice > line.unitPrice;
  const discountPercent =
    discounted && line.originalUnitPrice
      ? Math.round(
          ((line.originalUnitPrice - line.unitPrice) / line.originalUnitPrice) *
            100,
        )
      : 0;

  return (
    <article
      style={{
        position: "relative",
        overflow: "visible",
        borderRadius: 16,
        border: `1px solid ${theme.borderSoft}`,
        background: theme.surfaceAlt,
      }}
    >
      <div style={{ display: "flex", gap: 12, padding: "12px 12px 10px" }}>
        <div
          style={{
            width: 56,
            height: 56,
            flex: "none",
            borderRadius: 11,
            overflow: "hidden",
            display: "grid",
            placeItems: "center",
            background: theme.surfaceMuted,
            backgroundImage: image ? `url("${image}")` : undefined,
            backgroundSize: "contain",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          {!image && (
            <Icon
              path="M4 5h16v14H4z|M8 13l2-2 3 3 2-2 3 3"
              size={20}
              stroke={theme.mutedLight}
            />
          )}
        </div>

        <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span
              title={line.name}
              style={{
                minWidth: 0,
                flex: 1,
                fontSize: 13.5,
                fontWeight: 700,
                lineHeight: 1.3,
                color: theme.ink,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {line.name}
            </span>
            <span
              title={gradeLabel}
              style={{
                flex: "none",
                maxWidth: 86,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                borderRadius: 6,
                padding: "1px 5px",
                fontSize: 10.5,
                fontWeight: 800,
                border: `1px solid ${chip.border}`,
                background: chip.background,
                color: chip.color,
              }}
            >
              {gradeLabel}
            </span>
          </div>
          <span
            style={{
              ...{
                fontFamily: monoFont,
                fontSize: 11,
                color: theme.mutedLight,
              },
            }}
          >
            {[line.serial, line.sku].filter(Boolean).join(" · ") || "—"}
          </span>
          {conditionNote && (
            <span
              style={{ fontSize: 11.5, lineHeight: 1.35, color: theme.muted }}
            >
              {conditionNote}
            </span>
          )}
        </div>

        <div style={{ flex: "none", textAlign: "right", minWidth: 88 }}>
          {discounted && (
            <div
              style={{
                fontSize: 10.5,
                color: theme.mutedLight,
                textDecoration: "line-through",
              }}
            >
              {money(line.originalUnitPrice as number)}
            </div>
          )}
          <div style={{ fontSize: 15, fontWeight: 800, color: theme.ink }}>
            {money(line.unitPrice)}
          </div>
          {discountPercent > 0 && (
            <div
              style={{ fontSize: 10.5, fontWeight: 700, color: theme.accent }}
            >
              {discountPercent}% off
            </div>
          )}
        </div>
      </div>

      {note && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            margin: "0 12px 10px",
            borderRadius: 10,
            border: `1px solid ${theme.accentOutline}`,
            background: theme.accentTint,
            padding: "8px 10px",
          }}
        >
          <Icon path="M4 5h16M4 11h16M4 17h9" size={14} stroke={theme.accent} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: theme.accentDeep,
              }}
            >
              NOTE
            </div>
            <div
              style={{
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontSize: 12,
                lineHeight: 1.45,
                color: theme.inkSoft,
              }}
            >
              {note}
            </div>
          </div>
        </div>
      )}

      {rental && line.rentalTenure && (
        <div
          style={{ margin: "0 12px 8px", fontSize: 11.5, color: theme.muted }}
        >
          {`${line.rentalTenure} month${line.rentalTenure === 1 ? "" : "s"}`}
          {line.rentalStart && line.rentalEnd
            ? ` · ${line.rentalStart.slice(0, 10)} → ${line.rentalEnd.slice(0, 10)}`
            : ""}
        </div>
      )}

      <div style={{ padding: "0 12px 9px" }}>
        <LineCharges
          line={line}
          rental={rental}
          theme={theme}
          money={money}
          busy={busy}
          onSelectOptionalFee={onSelectOptionalFee}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 12px 9px",
          borderTop: `1px solid ${theme.borderSoft}`,
          background: theme.surface,
          borderRadius: "0 0 16px 16px",
        }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={onNote}
          style={{
            ...lineAction(theme),
            flex: 1,
            color: note ? theme.accentDeep : theme.inkSoft,
            borderColor: note ? theme.accentOutline : theme.border,
            background: note ? theme.accentSoft : theme.surface,
          }}
        >
          <Icon path="M4 5h16M4 11h16M4 17h9" size={15} />
          {note ? "Note added" : "Add note"}
        </button>
        {(line.warranty || (line.availableWarranties?.length ?? 0) > 0) && (
          <button
            type="button"
            disabled={busy}
            onClick={onWarranty}
            title={line.warranty ? "Change or remove the warranty" : "Add an extended warranty"}
            style={{
              ...lineAction(theme),
              flex: 1,
              minWidth: 0,
              color: line.warranty ? theme.accentDeep : theme.inkSoft,
              borderColor: line.warranty ? theme.accentOutline : theme.border,
              background: line.warranty ? theme.accentSoft : theme.surface,
            }}
          >
            <Icon path="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z" size={15} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {line.warranty
                ? `${line.warranty.title} · ${money(line.warranty.total)}`
                : "Add warranty"}
            </span>
          </button>
        )}
        <div style={{ position: "relative", flex: "none" }}>
          <button
            type="button"
            disabled={busy}
            onClick={onAskRemove}
            aria-label={`Remove ${line.name} from the order`}
            title="Remove this line"
            style={{
              ...lineAction(theme),
              width: 36,
              padding: 0,
              justifyContent: "center",
              color: theme.danger,
              borderColor: theme.dangerBorder,
            }}
          >
            <Icon
              path="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
              size={16}
              width={2.1}
            />
          </button>
          {confirmingRemove && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 42,
                zIndex: 40,
                width: 220,
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                background: theme.surface,
                padding: 12,
                boxShadow: "0 12px 30px rgba(16,22,20,.18)",
              }}
            >
              <div
                style={{ fontSize: 12.5, fontWeight: 700, color: theme.ink }}
              >
                Remove this item?
              </div>
              <div style={{ marginTop: 3, fontSize: 11.5, color: theme.muted }}>
                This only removes it from the current order.
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 7,
                  marginTop: 10,
                }}
              >
                <button
                  type="button"
                  onClick={onCancelRemove}
                  style={{ ...lineAction(theme), height: 32 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  style={{
                    ...lineAction(theme),
                    height: 32,
                    border: 0,
                    background: theme.danger,
                    color: "#fff",
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

const lineAction = (theme: PosTheme): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  height: 36,
  borderRadius: 9,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  padding: "0 10px",
  cursor: "pointer",
  color: theme.inkSoft,
  fontFamily: uiFont,
  fontSize: 12.5,
  fontWeight: 700,
});

/**
 * What a rental line costs, split the way the customer experiences it.
 *
 * Rent Buddyz products carry store "custom attributes" — a damage waiver, a
 * delivery plan, an installation fee. `recurring` decides everything: a
 * recurring one is billed with the rent every period for the whole agreement, a
 * non-recurring one is a single charge taken at the counter. The web checkout
 * splits them exactly here, so the till has to show the same split or an
 * operator quotes "two thousand a month" for an agreement that bills more.
 */
const LineCharges = ({
  line,
  rental,
  theme,
  money,
  busy,
  onSelectOptionalFee,
}: {
  line: PosCart["lines"][number];
  rental: boolean;
  theme: PosTheme;
  money: (value: number) => string;
  busy: boolean;
  onSelectOptionalFee: (
    lineId: string,
    attributeId: string,
    selected: boolean,
  ) => void;
}) => {
  const product = (line.metadata?.product ?? {}) as Record<string, unknown>;
  const attributes = lineAttributes(line);
  const recurring = attributes.filter((a) => a.recurring);
  const oneOff = attributes.filter((a) => !a.recurring);
  const baseRent =
    Number(product.baseUnitPrice ?? product.baseRent ?? line.unitPrice) || 0;
  const cycle = String(product.billingCycle ?? "Monthly").toLowerCase();
  const per =
    cycle === "weekly" ? "/wk" : cycle === "biweekly" ? "/2wk" : "/mo";
  const periods = line.rentalTenure ?? 1;

  // A sale with no add-ons has nothing to explain; the single figure says it.
  if (!rental && oneOff.length === 0) return null;

  const row = (label: string, value: string, strong = false, muted = false) => (
    <div
      key={label}
      style={{ display: "flex", justifyContent: "space-between", gap: 8 }}
    >
      <span
        style={{
          color: muted ? theme.mutedLight : theme.muted,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex: "none",
          fontWeight: strong ? 800 : 600,
          color: strong ? theme.ink : theme.inkSoft,
        }}
      >
        {value}
      </span>
    </div>
  );
  const attributeRow = (attribute: LineAttribute) => {
    const selected = attribute.selected !== false;
    if (!attribute.optional) return row(attribute.name, money(attribute.value));
    return (
      <label
        key={attribute.id}
        style={{
          display: "grid",
          gridTemplateColumns: "16px minmax(0, 1fr) auto",
          alignItems: "center",
          gap: 6,
          cursor: busy ? "not-allowed" : "pointer",
          color: selected ? theme.muted : theme.mutedLight,
        }}
      >
        <input
          type="checkbox"
          checked={selected}
          disabled={busy}
          aria-label={`${selected ? "Remove" : "Add"} optional fee ${attribute.name}`}
          onChange={(event) =>
            onSelectOptionalFee(line.id, attribute.id, event.target.checked)
          }
          style={{
            width: 14,
            height: 14,
            margin: 0,
            accentColor: theme.accent,
          }}
        />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {attribute.name} <span style={{ fontSize: 10 }}>(optional)</span>
        </span>
        <span
          style={{
            fontWeight: 600,
            color: selected ? theme.inkSoft : theme.mutedLight,
            textDecoration: selected ? "none" : "line-through",
          }}
        >
          {selected ? money(attribute.value) : "Removed"}
        </span>
      </label>
    );
  };

  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        marginTop: 4,
        padding: "8px 9px",
        borderRadius: 10,
        background: theme.accentTint,
        border: `1px solid ${theme.borderSoft}`,
        fontSize: 11.5,
      }}
    >
      {rental && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 8,
              marginBottom: 1,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: ".06em",
                color: theme.mutedLight,
              }}
            >
              RECURRING
            </span>
            <span
              style={{ fontSize: 13, fontWeight: 800, color: theme.accent }}
            >
              {`${money(line.unitPrice)}${per}`}
            </span>
          </div>
          {recurring.length > 0 && row("Rent", money(baseRent))}
          {recurring.map(attributeRow)}
          <div style={{ color: theme.mutedLight }}>
            {`Billed every period · ${periods} × ${money(line.unitPrice)} = ${money(line.unitPrice * periods)} over the term`}
          </div>
        </>
      )}

      {oneOff.length > 0 && (
        <>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: ".06em",
              color: theme.mutedLight,
              marginTop: rental ? 3 : 0,
            }}
          >
            ONE-TIME
          </div>
          {oneOff.map(attributeRow)}
        </>
      )}

      {line.depositAmount > 0 &&
        row("Refundable deposit", money(line.depositAmount), false, true)}
    </div>
  );
};

const groupedFees = (cart: PosCart, recurring: boolean, selected: boolean) => {
  const grouped = new Map<string, number>();
  for (const line of cart.lines) {
    for (const attribute of lineAttributes(line)) {
      if (
        attribute.recurring !== recurring ||
        (attribute.selected !== false) !== selected
      )
        continue;
      const amount = attribute.value * (recurring ? line.quantity : 1);
      grouped.set(attribute.name, (grouped.get(attribute.name) ?? 0) + amount);
    }
  }
  return Array.from(grouped.entries()).map(([name, amount]) => ({
    name,
    amount,
  }));
};

const PaymentSummary = ({
  cart,
  rental,
  theme,
  money,
  taxes,
  compact = false,
}: {
  cart: PosCart;
  rental: boolean;
  theme: PosTheme;
  money: (value: number) => string;
  /** The store's configured taxes, for an itemised breakdown. */
  taxes?: { name: string; rate: number }[];
  compact?: boolean;
}) => {
  const recurringFees = groupedFees(cart, true, true);
  const oneTimeFees = groupedFees(cart, false, true);
  const removedFees = [
    ...groupedFees(cart, true, false),
    ...groupedFees(cart, false, false),
  ];
  const recurringFeeTotal = recurringFees.reduce(
    (total, fee) => total + fee.amount,
    0,
  );
  const baseCurrentPeriod = Math.max(0, cart.subtotal - recurringFeeTotal);
  const agreementRecurringTotal = cart.lines.reduce(
    (total, line) =>
      total + line.unitPrice * line.quantity * (line.rentalTenure ?? 1),
    0,
  );
  const futureRecurringTotal = Math.max(
    0,
    agreementRecurringTotal - cart.subtotal,
  );
  const exemption = taxExemption(cart);
  const originalMerchandise = cart.subtotal + cart.discountTotal;
  const preTaxTotal =
    cart.subtotal +
    cart.feeTotal +
    (cart.warrantyTotal ?? 0) +
    cart.shippingTotal +
    (cart.customTotal ?? 0) +
    cart.depositTotal;
  const taxLabel = exemption.exempt
    ? `Tax exempt${exemption.reason ? ` · ${exemption.reason}` : ""}`
    : cart.taxRate > 0
      ? `Tax (${(cart.taxRate * 100).toFixed(2).replace(/\.00$/, "")}%)`
      : "Tax";
  const taxRows = exemption.exempt ? null : taxBreakdown(taxes, cart.taxTotal);
  // What the credit actually paid for, which is never more than the sale.
  const creditApplied = Math.min(
    cart.creditTotal ?? 0,
    preTaxTotal + cart.taxTotal,
  );
  const creditUnused = Math.max(0, (cart.creditTotal ?? 0) - creditApplied);
  const sectionLabel: React.CSSProperties = {
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: ".08em",
    color: theme.mutedLight,
    marginTop: 2,
  };
  const feeRow = (prefix: string, fee: { name: string; amount: number }) => (
    <Row
      key={`${prefix}-${fee.name}`}
      theme={theme}
      label={`${prefix} · ${fee.name}`}
      value={money(fee.amount)}
    />
  );

  return (
    <div style={{ display: "grid", gap: compact ? 5 : 6 }}>
      <div style={sectionLabel}>PAYMENT BREAKDOWN</div>
      {cart.discountTotal > 0 && (
        <Row
          theme={theme}
          label={
            rental ? "Original current-period price" : "MSRP / original price"
          }
          value={money(originalMerchandise)}
        />
      )}
      {cart.discountTotal > 0 && (
        <Row
          theme={theme}
          label="Discount / markdown"
          value={`− ${money(cart.discountTotal)}`}
          accent
        />
      )}
      <Row
        theme={theme}
        label={rental ? "Base rent · current period" : "Merchandise total"}
        value={money(rental ? baseCurrentPeriod : cart.subtotal)}
      />
      {rental && recurringFees.map((fee) => feeRow("Recurring", fee))}
      {oneTimeFees.map((fee) => feeRow("One-time", fee))}
      {cart.feeTotal > 0 && oneTimeFees.length === 0 && (
        <Row theme={theme} label="One-time fees" value={money(cart.feeTotal)} />
      )}
      {(cart.warrantyTotal ?? 0) > 0 && (
        <Row theme={theme} label="Extended warranty" value={money(cart.warrantyTotal ?? 0)} />
      )}
      {(cart.customTotal ?? 0) > 0 && (
        <Row
          theme={theme}
          label={cart.customChargeLabel?.trim() || "Additional charge"}
          value={money(cart.customTotal ?? 0)}
        />
      )}
      {cart.shippingTotal > 0 && (
        <Row
          theme={theme}
          label="Delivery fee"
          value={money(cart.shippingTotal)}
        />
      )}
      {cart.depositTotal > 0 && (
        <Row
          theme={theme}
          label="Refundable security deposit"
          value={money(cart.depositTotal)}
        />
      )}
      {removedFees.length > 0 && (
        <Row
          theme={theme}
          label={`Optional fees removed (${removedFees.length})`}
          value={money(0)}
          accent
        />
      )}
      <div
        style={{ height: 1, background: theme.borderSoft, margin: "3px 0" }}
      />
      <Row theme={theme} label="Subtotal" value={money(preTaxTotal)} />
      {/*
       * A store charging GST and PST gets a row each. They are apportioned
       * from the one charged figure, so they always add back up to it.
       */}
      {taxRows ? (
        taxRows.map((row) => (
          <Row
            key={row.label}
            theme={theme}
            label={row.label}
            value={money(row.amount)}
          />
        ))
      ) : (
        <Row theme={theme} label={taxLabel} value={money(cart.taxTotal)} />
      )}
      {/*
       * The credit sits below tax on purpose: the new rental is taxed in full,
       * and the credit then pays part of what is owed. It is the customer's
       * own money coming back, not a discount on this sale.
       */}
      {(cart.creditTotal ?? 0) > 0 && (
        <>
          <Row
            theme={theme}
            label={cart.creditLabel || "Credit applied"}
            value={`− ${money(creditApplied)}`}
            accent
          />
          {/*
           * What the credit could not pay for. A credit worth more than the
           * rental leaves a remainder, and showing the face value alone made
           * the till look like it had handed over money it had not.
           */}
          {creditUnused > 0 && (
            <Row
              theme={theme}
              label="Credit not used on this sale"
              value={money(creditUnused)}
            />
          )}
        </>
      )}
      <div
        style={{ height: 1, background: theme.borderSoft, margin: "3px 0" }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 800, color: theme.ink }}>
          Grand Total
        </span>
        <span
          style={{
            fontSize: compact ? 20 : 22,
            fontWeight: 800,
            letterSpacing: "-.02em",
            color: theme.accent,
          }}
        >
          {money(cart.grandTotal)}
        </span>
      </div>

      {rental && (
        <>
          <div
            style={{
              height: 1,
              background: theme.borderSoft,
              margin: "4px 0 1px",
            }}
          />
          <div style={sectionLabel}>RECURRING COMMITMENT</div>
          <Row
            theme={theme}
            label="Recurring charge each period"
            value={money(cart.subtotal)}
          />
          <Row
            theme={theme}
            label="Current period included above"
            value={money(cart.subtotal)}
          />
          <Row
            theme={theme}
            label="Remaining scheduled payments"
            value={money(futureRecurringTotal)}
          />
          <Row
            theme={theme}
            label="Recurring total over selected terms"
            value={money(agreementRecurringTotal)}
          />
          <div
            style={{
              fontSize: 10.5,
              lineHeight: 1.35,
              color: theme.mutedLight,
            }}
          >
            Future-period tax is calculated when each recurring payment is
            billed.
          </div>
        </>
      )}
    </div>
  );
};

const Row = ({
  theme,
  label,
  value,
  accent,
}: {
  theme: PosTheme;
  label: string;
  value: string;
  accent?: boolean;
}) => (
  <div style={{ display: "flex", justifyContent: "space-between" }}>
    <span style={{ color: theme.muted }}>{label}</span>
    <span
      style={{ fontWeight: 700, color: accent ? theme.accent : theme.inkSoft }}
    >
      {value}
    </span>
  </div>
);

/**
 * One model on the grid.
 *
 * ! There is no quantity stepper and no bare "Add". On a serialized platform a
 * ! tile is several machines of one model at several prices; there is nothing
 * ! here to add until one of them has been picked.
 */
const ProductTile = ({
  product,
  theme,
  rental,
  money,
  onChoose,
  imageBaseUrl,
}: {
  product: CatalogProduct;
  theme: PosTheme;
  rental: boolean;
  money: (value: number) => string;
  onChoose: (product: CatalogProduct) => void;
  imageBaseUrl?: string;
}) => {
  const image = resolveImage(product.imageUrl, imageBaseUrl);
  const out = product.availableCount <= 0;
  const discounted =
    product.originalPrice !== null && product.originalPrice > product.price;

  return (
    <article
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        height: 264,
        minHeight: 264,
        maxHeight: 264,
        overflow: "hidden",
        borderRadius: 14,
        border: `1px solid ${theme.borderSoft}`,
        background: theme.surface,
        padding: 10,
        boxShadow: "0 1px 2px rgba(16,22,20,.04)",
      }}
    >
      <div
        style={{
          position: "relative",
          height: 92,
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          background: theme.surfaceMuted,
          backgroundImage: image ? `url("${image}")` : undefined,
          backgroundSize: "contain",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {!image && (
          <span
            style={{
              fontFamily: monoFont,
              fontSize: 9.5,
              letterSpacing: ".04em",
              color: theme.mutedLight,
            }}
          >
            no image
          </span>
        )}
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            borderRadius: 6,
            padding: "1px 6px",
            fontFamily: monoFont,
            fontSize: 10,
            fontWeight: 700,
            background: out ? theme.bg : "rgba(255,255,255,.92)",
            color: out ? theme.muted : theme.inkSoft,
            boxShadow: "0 1px 2px rgba(16,22,20,.08)",
          }}
        >
          {out ? "Out of stock" : `${product.availableCount} on floor`}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          height: 44,
          minHeight: 44,
          overflow: "hidden",
        }}
      >
        <h3
          title={product.name}
          style={{
            margin: 0,
            minHeight: 32,
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-.01em",
            color: theme.ink,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {product.name}
        </h3>
        <span
          style={{
            fontFamily: monoFont,
            fontSize: 10,
            color: theme.mutedLight,
          }}
        >
          {product.sku ?? "—"}
        </span>
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 7,
          minHeight: 76,
        }}
      >
        {!out && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              lineHeight: 1.1,
              minHeight: 35,
            }}
          >
            {discounted && (
              <span
                style={{
                  fontSize: 11,
                  color: theme.mutedLight,
                  textDecoration: "line-through",
                }}
              >
                {money(product.originalPrice as number)}
              </span>
            )}
            <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: theme.mutedLight,
                }}
              >
                from
              </span>
              <span
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  letterSpacing: "-.02em",
                  color: theme.accent,
                }}
              >
                {money(product.price)}
              </span>
              {rental && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: theme.mutedLight,
                  }}
                >
                  /mo
                </span>
              )}
            </span>
            {product.deposit > 0 && (
              <span style={{ fontSize: 10.5, color: theme.mutedLight }}>
                {`+ ${money(product.deposit)} deposit`}
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={out}
          onClick={() => onChoose(product)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            height: 34,
            width: "100%",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: uiFont,
            cursor: out ? "not-allowed" : "pointer",
            border: out ? `1px solid ${theme.borderSoft}` : 0,
            background: out ? theme.surfaceMuted : theme.accent,
            color: out ? theme.mutedLight : "#fff",
          }}
        >
          <Icon path="M4 7h10M4 12h16M4 17h7" size={14} width={2.3} />
          {out ? "Out of stock" : "Choose unit"}
        </button>
      </div>
    </article>
  );
};

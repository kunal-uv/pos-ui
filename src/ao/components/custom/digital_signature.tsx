import React, { useCallback, useRef, useState } from "react";
import { posColor } from "./pos_design";
import { PosButton, PosModal } from "./pos_ui";

export const DEFAULT_MARKETING_CONSENT = true;

/** The box the pad occupies on screen, in CSS pixels. */
interface SignatureBox {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** The pixel grid the canvas actually draws on. Not the same thing. */
interface SignatureSurface {
	width: number;
	height: number;
}

/**
 * Where a pointer at `clientX/clientY` lands on the canvas's own pixel grid.
 *
 * ! **This is what put the ink somewhere other than the pen.** The backing store
 * ! was pinned at 500 × 200 while the element is laid out `w-full` and 200px
 * ! tall, so a CSS pixel was never a canvas pixel - and the old code passed
 * ! `clientX - rect.left` in as a canvas coordinate untouched. The height
 * ! matched by coincidence (200 CSS px against a 200px grid), which is why the
 * ! vertical position looked fine; horizontally the stroke drifted further from
 * ! the pen the further across the pad you drew.
 *
 * ! Scaling by `surface / box` rather than assuming they are equal is also what
 * ! makes the pad correct at any modal width and on any screen density.
 */
export const signaturePoint = (
	event: { clientX: number; clientY: number },
	box: SignatureBox,
	surface: SignatureSurface,
) => ({
	x:
		box.width === 0
			? 0
			: ((event.clientX - box.left) * surface.width) / box.width,
	y:
		box.height === 0
			? 0
			: ((event.clientY - box.top) * surface.height) / box.height,
});

interface DigitalSignatureModalProps {
	isOpen: boolean;
	/** Backs out of the pad. Nothing is sold. */
	onClose: () => void;
	onConfirm: (signatureDataURL: string) => void;
	customerName: string;
	/**
	 * P28. The marketing consent, drawn directly above the pad so it is visibly
	 * part of what is being signed.
	 *
	 * ! It used to sit on the checkout step behind this modal, which is the one
	 * ! place the spec says it must not be: a statement the customer agrees to
	 * ! has to be on screen at the moment they put their name to it. Declining
	 * ! never blocks the sale.
	 */
	consent: boolean;
	onConsentChange: (next: boolean) => void;
}

/**
 * ! `onSkip` is gone (A55, D17, CHK-34). It closed the pad and let the sale
 * ! through unsigned. This modal now stands between the cart and the invoice
 * ! rather than opening after one has been created, so skipping would mean
 * ! billing a customer who never signed. The way out is Cancel, which sells
 * ! nothing and leaves the cart alone.
 */
export const DigitalSignatureModal = ({
	isOpen,
	onClose,
	onConfirm,
	customerName,
	consent,
	onConsentChange,
}: DigitalSignatureModalProps) => {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const observerRef = useRef<ResizeObserver | null>(null);
	/** The stroke in progress, by pointer id. A ref, because pointermove fires
	 *  faster than React commits state and a dropped move is a gap in the ink. */
	const strokeRef = useRef<number | null>(null);
	const [hasSignature, setHasSignature] = useState(false);

	/**
	 * The grid the canvas draws on, read off the element every time.
	 *
	 * ! Never remembered in a ref. A remembered surface is how the pad went
	 * ! completely blank: it sat at its initial `{0, 0}` while the canvas was
	 * ! never sized, and `signaturePoint` dutifully mapped every pointer to
	 * ! (0, 0), so no stroke had any length and nothing appeared at all.
	 */
	const surfaceOf = (canvas: HTMLCanvasElement): SignatureSurface => ({
		width: canvas.width,
		height: canvas.height,
	});

	/**
	 * Matches the pixel grid to the box the pad occupies. Returns whether it
	 * actually changed anything, because assigning either dimension wipes the
	 * canvas and a signature half written must survive a spurious callback.
	 */
	const fitSurface = useCallback((canvas: HTMLCanvasElement) => {
		const ratio = window.devicePixelRatio || 1;

		// ! `clientWidth`, not `getBoundingClientRect()`. The modal animates in
		// ! with a scale transform, and the rect reports the *transformed* box
		// ! while a ResizeObserver reports layout - so sizing off the rect
		// ! mid-animation bakes in a size that nothing ever comes back to fix.
		// ! The rect is still right for mapping a pointer, which is in viewport
		// ! space and does have to account for the transform.
		const width = Math.round(canvas.clientWidth * ratio);
		const height = Math.round(canvas.clientHeight * ratio);

		if (width === 0 || height === 0) return false;
		if (canvas.width === width && canvas.height === height) return false;

		canvas.width = width;
		canvas.height = height;

		return true;
	}, []);

	/** White, with the pen set up. A fresh pad for a fresh customer. */
	const blank = useCallback((canvas: HTMLCanvasElement) => {
		const ctx = canvas.getContext("2d");

		if (!ctx) return;

		ctx.strokeStyle = "#000000";
		// Scaled with the density, or the line is hairline-thin on a retina till.
		ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		setHasSignature(false);
	}, []);

	/**
	 * ! A callback ref, not an effect. Mantine renders the modal body through a
	 * ! portal that mounts on an effect of its own, so on the commit where
	 * ! `isOpen` turns true `canvasRef.current` is still null. Setting the pad up
	 * ! from an effect therefore found no canvas, did nothing, and - worse -
	 * ! returned before attaching its ResizeObserver, so nothing ever came back
	 * ! to it. The pad stayed transparent at the default 300 × 150 with a
	 * ! zero-sized surface: no white, no pen, and every pointer mapped to the
	 * ! origin. That is the blank pad. Binding to the element's attachment
	 * ! removes the timing assumption entirely.
	 */
	const attachCanvas = useCallback(
		(canvas: HTMLCanvasElement | null) => {
			observerRef.current?.disconnect();
			observerRef.current = null;
			canvasRef.current = canvas;

			if (!canvas) return;

			fitSurface(canvas);
			blank(canvas);

			if (typeof ResizeObserver === "undefined") return;

			// Covers the opening animation, a till being rotated, and the case
			// where the pad is attached before it has been laid out.
			const observer = new ResizeObserver(() => {
				if (fitSurface(canvas)) blank(canvas);
			});

			observer.observe(canvas);
			observerRef.current = observer;
		},
		[fitSurface, blank],
	);

	const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;

		if (!canvas) return;

		// ! Last line of defence. If a pointer somehow arrives before anything
		// ! has sized the grid, size it here rather than swallowing the stroke -
		// ! a pad that silently eats signatures is the worst of the failures
		// ! this component has had.
		if (fitSurface(canvas)) blank(canvas);

		const ctx = canvas.getContext("2d");

		if (!ctx) return;

		const point = signaturePoint(
			event,
			canvas.getBoundingClientRect(),
			surfaceOf(canvas),
		);

		// ! Captured, so a stroke that strays off the pad and comes back is one
		// ! stroke. Without it the line broke the moment the pen left the box.
		canvas.setPointerCapture?.(event.pointerId);
		strokeRef.current = event.pointerId;

		setHasSignature(true);
		ctx.beginPath();
		ctx.moveTo(point.x, point.y);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (strokeRef.current !== event.pointerId) return;

		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");

		if (!canvas || !ctx) return;

		const point = signaturePoint(
			event,
			canvas.getBoundingClientRect(),
			surfaceOf(canvas),
		);

		ctx.lineTo(point.x, point.y);
		ctx.stroke();
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (strokeRef.current !== event.pointerId) return;

		canvasRef.current?.releasePointerCapture?.(event.pointerId);
		strokeRef.current = null;
	};

	const clearSignature = () => {
		const canvas = canvasRef.current;

		if (canvas) blank(canvas);
	};

	const handleConfirm = () => {
		// Confirm is disabled until there is a signature, so there is nothing to
		// warn about here - it used to raise an `alert`, which on a till is a
		// modal on top of a modal.
		if (!hasSignature) return;

		const signatureDataURL = canvasRef.current?.toDataURL("image/png");

		if (!signatureDataURL) {
			return;
		}

		onConfirm(signatureDataURL);
	};

	if (!isOpen) return null;

	return (
		<PosModal
			opened={isOpen}
			onClose={onClose}
			size="lg"
			title="Customer Signature"
			subtitle={
				customerName
					? `${customerName} — no invoice exists until this is signed.`
					: "No invoice exists until this is signed."
			}
		>
			{/* P28. Above the pad, checked by default, and never a condition of
			    completing the sale. */}
			<button
				type="button"
				aria-pressed={consent}
				onClick={() => onConsentChange(!consent)}
				style={{
					background: consent ? posColor.greenTint : posColor.surface,
					border: `1.5px solid ${consent ? posColor.green : posColor.borderSoft}`,
				}}
				className="flex items-center gap-3 rounded-[15px] p-4 text-left transition-colors"
			>
				<span
					style={{
						background: consent ? posColor.green : posColor.surface,
						borderColor: consent ? posColor.green : posColor.border,
						color: consent ? "#FFFFFF" : "transparent",
					}}
					className="grid h-[22px] w-[22px] flex-none place-items-center rounded-[7px] border-[1.5px] text-[13px] font-extrabold"
				>
					✓
				</span>
				<span
					className="text-[12px] leading-[1.35]"
					style={{ color: posColor.inkSoft }}
				>
					I agree to receive marketing messages and promotional emails.
				</span>
			</button>

			<div
				style={{
					border: `1.5px solid ${posColor.border}`,
					background: posColor.surface,
				}}
				className="overflow-hidden rounded-[15px]"
			>
				{/* ! One set of pointer handlers for finger, stylus and mouse
				    alike. The previous version listened for mouse events and then
				    tried to *synthesise* them from touch handlers - and built
				    those `MouseEvent`s without `bubbles`, so React, which listens
				    at the root rather than on the element, never received them.
				    On a touchscreen till, where the customer signs with a finger,
				    the pad did nothing whatsoever.

				    ! `touch-action: none` is what lets a finger draw rather than
				    scroll the modal, and it does that without depending on
				    `preventDefault` inside a listener React may have registered
				    as passive. */}
				<canvas
					ref={attachCanvas}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
					style={{ touchAction: "none" }}
					className="block h-[200px] w-full cursor-crosshair bg-white"
				/>
				<div
					style={{
						borderTop: `1px solid ${posColor.borderSoft}`,
						background: posColor.surfaceAlt,
						color: posColor.muted,
					}}
					className="flex items-center justify-between px-3 py-2 text-[12.5px]"
				>
					<span>Sign above with a finger or the mouse.</span>
					{hasSignature && (
						<span
							className="font-bold"
							style={{ color: posColor.green }}
						>
							✓ Signature captured
						</span>
					)}
				</div>
			</div>

			<div className="flex items-center gap-[10px]">
				<PosButton variant="secondary" onClick={clearSignature}>
					Clear
				</PosButton>
				<div className="ml-auto flex gap-[10px]">
					{/* The way out, now that the pad gates the sale. Without it a
					    till that reached this step by mistake would be stuck. */}
					<PosButton variant="secondary" onClick={onClose}>
						Cancel
					</PosButton>
					<PosButton disabled={!hasSignature} onClick={handleConfirm}>
						Confirm &amp; Complete Sale
					</PosButton>
				</div>
			</div>
		</PosModal>
	);
};

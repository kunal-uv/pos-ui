"use client";

import React, { useEffect, useState } from "react";
import {
	ButtonComponent,
	GroupComponent,
	ModalComponent,
	SpaceComponent,
	TextAreaInputComponent,
	TitleComponent,
} from "..";

interface Props {
	isOpen: boolean;
	/** Closes without writing anything. */
	onClose: () => void;
	/** Called once, with the finished note, when Save is pressed. */
	onSave: (note: string) => void;
	/** The note as it already stands, used to seed the form. */
	note: string | undefined;
	/** Names the product when the note belongs to one line rather than the order. */
	title?: string;
}

/**
 * The note that prints under one machine on the invoice (P5, CHK-01).
 *
 * ! **The note is edited locally and written once, on Save.** It used to be
 * ! wired the other way round: the textarea's `onChange` went straight out to
 * ! the caller, whose handler fired `PATCH /pos/cart/lines/:id` - so every
 * ! keystroke was a request, and the value rendered in the box was whatever the
 * ! *server* last echoed back. Typing faster than the round trip dropped and
 * ! reordered characters, every key put the whole cart into its busy state, and
 * ! a failed write reloaded the cart out from under the person typing. The Save
 * ! button meanwhile closed the modal and saved nothing at all.
 *
 * ! Which is also what makes Cancel mean something. A note half written and
 * ! thought better of is now discarded, where before it had already been
 * ! persisted letter by letter.
 */
const AdditionalNoteModal = (props: Props) => {
	const {
		isOpen,
		onClose,
		onSave,
		note,
		title,
	} = props;

	const [draft, setDraft] = useState<string>(note ?? "");

	// The caller mounts this per line, so the initial state above is normally
	// enough. Reseeding on open keeps it right for a caller that leaves it
	// mounted and toggles `isOpen` instead.
	useEffect(() => {
		if (isOpen) {
			setDraft(note ?? "");
		}
	}, [isOpen, note]);

	const handleSave = () => {
		// Trailing whitespace is not a note. Clearing the box IS allowed - it is
		// how a note that should not have been added gets taken off again - so an
		// empty string saves rather than being refused.
		onSave(draft.trim());
		onClose();
	};

	return (
		<ModalComponent
			opened={isOpen}
			onClose={onClose}
			className="border-grey-800"
			title={<TitleComponent title={title ?? "Add Additional Note"} />}
			size="lg"
		>

			<TextAreaInputComponent
				autoFocus
				autosize
				minRows={4}
				maxRows={10}
				title="Additional Note"
				value={draft}
				setValue={setDraft}
				placeholder="Additional Note"
			/>

			<SpaceComponent showHeight />

			<GroupComponent justify="end">
				<ButtonComponent
					title="Cancel"
					variant="default"
					w={100}
					onClick={onClose}
				/>
				<ButtonComponent
					title="Save"
					w={100}
					onClick={handleSave}
				/>
			</GroupComponent>
		</ModalComponent>
	);
};

export default AdditionalNoteModal;

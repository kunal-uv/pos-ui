"use client";

import React, { useEffect, useState } from "react";
import {
	ButtonComponent,
	CurrencyInputComponent,
	GroupComponent,
	ModalComponent,
	StackComponent,
	TextInputComponent,
} from "../mantine";

interface Props {
	isOpen: boolean;
	onClose: () => void;
	onAdd: (item: { name: string; price: string }) => void;
}

/** A taxed one-off part or unique item that does not enter inventory. */
export const PosOpenLineItemModal = ({ isOpen, onClose, onAdd }: Props) => {
	const [name, setName] = useState("");
	const [price, setPrice] = useState("");

	useEffect(() => {
		if (!isOpen) {
			setName("");
			setPrice("");
		}
	}, [isOpen]);

	const valid = name.trim().length >= 2 && Number(price) > 0;

	return (
		<ModalComponent
			opened={isOpen}
			onClose={onClose}
			title="Add open line item"
			size="md"
		>
			<StackComponent gap="md">
				<TextInputComponent
					required
					label="Description"
					placeholder="One-off part or unique item"
					value={name}
					setValue={setName}
				/>
				<CurrencyInputComponent
					required
					label="Price"
					value={price}
					setValue={(value) => setPrice(String(value))}
				/>
				<GroupComponent justify="end">
					<ButtonComponent
						title="Cancel"
						variant="default"
						onClick={onClose}
					/>
					<ButtonComponent
						title="Add to order"
						disabled={!valid}
						onClick={() => {
							onAdd({
								name: name.trim(),
								price: Number(price).toFixed(2),
							});
							onClose();
						}}
					/>
				</GroupComponent>
			</StackComponent>
		</ModalComponent>
	);
};

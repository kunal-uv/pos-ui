import { ComboboxItem } from "@mantine/core";
import { ComboboxItemGroup } from "@mantine/core/lib/components/Combobox/Combobox.types";

export interface ComboBoxProps extends ComboboxItem {
	id: string,
}

export interface GroupedComboBoxProps extends ComboboxItemGroup {
	group: string,
	items: ComboBoxProps[],
}

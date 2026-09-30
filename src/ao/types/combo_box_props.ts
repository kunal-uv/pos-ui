/**
 * ! `ComboboxItemGroup` comes from the package entry, not from
 * ! `@mantine/core/lib/components/Combobox/Combobox.types` as the admin imports
 * ! it. Mantine's `exports` map does not publish `./lib/*`, so that deep path
 * ! resolves only under the admin's older `node` resolution and fails every
 * ! build that honours the map - which is what broke this package's own build.
 * ! The type is the same one; it is re-exported publicly.
 */
import { ComboboxItem, ComboboxItemGroup } from "@mantine/core";

export interface ComboBoxProps extends ComboboxItem {
	id: string,
}

export interface GroupedComboBoxProps extends ComboboxItemGroup {
	group: string,
	items: ComboBoxProps[],
}

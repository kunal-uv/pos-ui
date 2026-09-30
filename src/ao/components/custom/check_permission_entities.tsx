import { getCookie } from "cookies-next";

interface PermissionEntity {
	entity: string;
	permissions: string[];
}

/**
 * Reads the permission set the API put in a cookie at login.
 *
 * The cookie is attacker-visible and can be truncated, tampered with or left
 * over from an older release, so every step is defensive: this runs during
 * render on the customers, users, items and settings pages, and an uncaught
 * `SyntaxError` here blanks the whole page rather than merely hiding a button.
 * A cookie we cannot make sense of grants nothing.
 */
const readPermissionEntities = (): PermissionEntity[] => {
	const raw = getCookie("permission_entities");

	if (!raw) return [];

	try {
		const parsed: unknown = JSON.parse(decodeURIComponent(raw));

		if (!Array.isArray(parsed)) return [];

		return parsed.filter(
			(entry): entry is PermissionEntity =>
				typeof entry === "object" &&
				entry !== null &&
				typeof (entry as PermissionEntity).entity === "string" &&
				Array.isArray((entry as PermissionEntity).permissions),
		);
	} catch {
		return [];
	}
};

/**
 * Whether the signed-in user's role is the admin one.
 *
 * ! Same rule the API applies: `is-authorized` returns `next()` for an admin
 * ! before it looks at a single entity. Without this the two disagreed, and the
 * ! disagreement is invisible - the API happily serves the request while the
 * ! button that would send it is hidden. That is how Master Data lost its Add
 * ! Product and Import CSV buttons: `product` and `inventory-unit` are entities
 * ! newer than the roles stored against them, so no role lists them yet.
 */
const isAdminUser = (): boolean => {
	const raw = getCookie("is_admin");

	if (!raw) return false;

	try {
		return JSON.parse(raw as string) === true;
	} catch {
		return raw === "true";
	}
};

export const checkPermissions = (
	entity: string,
	requiredPermissions: string[],
) => {
	if (isAdminUser()) return true;

	const entityPermissions = readPermissionEntities().find(
		(permission) => permission.entity === entity,
	)?.permissions;

	if (!entityPermissions) return false;

	return requiredPermissions.every((permission) =>
		entityPermissions.includes(permission),
	);
};

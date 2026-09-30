/**
 * Shim for AO's `utils/theme_provider`. The till only reads `darkMode`; the
 * host decides it, since the colour scheme belongs to the admin shell.
 */
import { requirePlatform } from "../platform";

export const useThemeProvider = () => ({ darkMode: requirePlatform().useDarkMode() });

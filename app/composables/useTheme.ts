// Wraps Nuxt UI's built-in color mode so all components (UCard, UInput, etc.) respond correctly.
/**
 * Wraps Nuxt UI's built-in color mode to manage application theming.
 * 
 * @returns An object containing the current dark mode computed boolean, and methods to initialize and toggle the theme.
 */
export function useTheme() {
  const colorMode = useColorMode()

  // Toggles between dark and light, defaulting to the OS preference when unknown.
  function toggle() {
    const currentlyDark =
      colorMode.value === 'dark' ||
      (colorMode.preference === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)

    colorMode.preference = currentlyDark ? 'light' : 'dark'
  }

  // No-op init kept for API compatibility with AppSidebar which calls init() on mount.
  function init() {}

  const isDark = computed(() => colorMode.value === 'dark')

  return { isDark, init, toggle }
}

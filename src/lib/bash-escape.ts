/**
 * Escape a string for safe inclusion inside `bash -c $'...'`.
 *
 * The ANSI-C-quoting form $'…' interprets these escape sequences:
 *   \\  → backslash
 *   \'  → single quote
 *   \n  → newline
 *   \r  → carriage return
 *   \t  → tab
 *
 * That lets us pack a multi-line shell script into a single physical line
 * that survives clipboards, terminal pastes, and trailing-newline-trimming
 * web terminals (e.g. Hostinger Browser Terminal) without rewriting word
 * splitting or quoting rules.
 *
 * The order of replacements matters: backslash MUST be escaped first so we
 * don't double-escape the ones we introduce below it.
 */
export function escapeForBashC(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

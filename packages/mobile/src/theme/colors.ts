// Zen Capsule — Warm Cream + Claude Orange Theme
// Inspired by vintage/Focus Tomato aesthetic with Claude's signature orange
// All color constants are defined here.

export const C = {
  // ── Backgrounds ──────────────────────────────────
  bg:           '#FFF5EB',   // warm cream main background
  bgCard:       '#FFF0E0',   // card surface (slightly warmer)
  bgElevated:   '#FFE8D0',   // elevated surfaces (modals)
  bgDark:       '#2D1B0E',   // dark brown (for contrast sections)

  // ── Borders ──────────────────────────────────────
  border:       '#E8D5C0',   // standard border
  borderLight:  '#F0E0D0',   // subtle separator
  borderDark:   '#D4B896',   // stronger border

  // ── Primary Accent (Claude Orange) ────────────────
  primary:      '#E8712A',   // Claude orange — buttons, links, active
  primaryDark:  '#C85A1A',   // darker orange for pressed states
  primaryFaded: '#E8712A18', // low-opacity highlight
  primaryMid:   '#E8712A55', // medium-opacity (switch track)
  primaryLight: '#FFEEDD',   // light orange tint bg

  // ── Text ─────────────────────────────────────────
  textPrimary:   '#2D1B0E',  // dark brown — main text
  textSecondary: '#7A6652',  // medium brown — subtitle
  textHint:      '#A89880',  // placeholder, hint
  textInactive:  '#C4B098',  // disabled / inactive tab
  textWhite:     '#FFF5EB',  // white text on dark bg
  textOnPrimary: '#FFFFFF',  // white text on orange buttons

  // ── Status / Category ────────────────────────────
  critical:       '#DC3545',  // error, critical
  criticalFaded:  '#DC354518',
  criticalBorder: '#DC354530',
  warning:        '#E8912A',  // important / warning
  success:        '#28A745',  // completed, social
  successFaded:   '#28A74518',
  successBorder:  '#28A74530',

  // ── Misc ─────────────────────────────────────────
  tabBarBg:     '#FFF5EB',
  tabBarBorder: '#E8D5C0',
  overlay:      '#2D1B0E88', // dark overlay for modals
} as const

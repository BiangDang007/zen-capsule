// Zen Capsule — Warm Dark Theme
// All color constants are defined here. Never hardcode colors in components.

export const Colors = {
  // ── Backgrounds ──────────────────────────────────
  bg:           '#1A1410',   // main dark warm brown
  bgCard:       '#2A2018',   // card / input surface
  bgElevated:   '#352A20',   // elevated surfaces (modals, tooltips)

  // ── Borders ──────────────────────────────────────
  border:       '#4A3828',   // standard border
  borderLight:  '#3D2E22',   // subtle separator

  // ── Primary Accent (warm amber) ──────────────────
  primary:      '#FF9F43',   // buttons, links, active states
  primaryFaded: '#FF9F4322', // low-opacity highlight
  primaryMid:   '#FF9F4388', // medium-opacity (switch track)

  // ── Text ─────────────────────────────────────────
  textPrimary:   '#FFF0E0',  // main text
  textSecondary: '#AA9080',  // muted / subtitle
  textHint:      '#887766',  // placeholder, hint
  textInactive:  '#665544',  // disabled / inactive tab
  textWhite:     '#FFF5EB',  // high-contrast white-ish
  textMedium:    '#CCAA88',  // medium emphasis

  // ── Status / Category ────────────────────────────
  critical:     '#FF6348',   // error, critical, destructive
  criticalFaded:'#FF634822', // low-opacity critical bg
  criticalBorder:'#FF634844',// critical border with alpha
  warning:      '#FFA502',   // important / warning
  success:      '#2ECC71',   // completed, social
  successFaded: '#2ECC7122', // low-opacity success bg

  // ── Ads section ──────────────────────────────────
  adsBg:        '#1A1210',   // ads strip background
  adsBorder:    '#332211',   // ads border
  adsText:      '#AA8866',   // ads text

  // ── Misc ─────────────────────────────────────────
  tabBarBorder: '#2A2018',   // bottom tab bar top border
  switchThumbOff: '#665544', // switch thumb when disabled
  transparent:  'transparent',
} as const

export type ColorKey = keyof typeof Colors

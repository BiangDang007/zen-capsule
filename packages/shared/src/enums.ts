// Focus session phase
export type Phase = 'RITUAL' | 'FOCUS' | 'BREAK'

// Device platform
export type Platform = 'CHROME' | 'IOS' | 'ANDROID'

// AI urgency category
export type AiCategory = 'critical' | 'important' | 'normal' | 'social'

// User feedback action on AI decision
export type UserAction =
  | 'ALLOWED_THROUGH'
  | 'DISMISSED'
  | 'OVERRODE_AI'
  | 'CONFIRMED_BLOCK'
  | 'MARKED_URGENT'
  | 'MARKED_NOT_URGENT'

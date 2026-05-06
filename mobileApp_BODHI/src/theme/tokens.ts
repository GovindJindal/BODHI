// ─────────────────────────────────────────────────────────────
//  BODHI Design Tokens — Soft-UI Premium Theme
//  Clean · High-contrast · Soft Milk · Vibrant Accents
// ─────────────────────────────────────────────────────────────

export const Colors = {
  // ── Core Brand ──────────────────────────────────────────────
  neonLime:        '#3D4DFF',  // primary highlight — stark blue
  neonLimeDim:     '#2530A8',  // muted blue
  neonLimeDark:    '#1A2273',  // text on light backgrounds
  electricViolet:  '#C83232',  // secondary — muted crimson
  hotPink:         '#C83232',  // error/danger — muted crimson
  magenta:         '#9B111E',  // deep crimson
  neonGreen:       '#3D4DFF',  // blue for specific CTAs

  // ── Gradient (Soft UI) ──────────────────────────
  gradientStart:   '#FDFDF9',
  gradientMid:     '#FFFFFF',
  gradientEnd:     '#FDFDF9',

  // ── Surfaces (Light Mode) ──
  surface:         '#FDFDF9',
  surfaceLow:      '#F4F4F0',
  surfaceHigh:     '#FFFFFF',
  surfaceHighest:  '#FFFFFF',
  surfaceContainer:'#F0F0EB',
  surfaceWhite:    '#FFFFFF',
  surfaceDim:      '#E8E8E3',

  // ── Surfaces (Base) ────────────────────
  darkBase:        '#FDFDF9',  // Soft Milk
  darkCard:        '#FFFFFF',  // Pure White

  // ── Text ────────────────────────────────────────────────────
  textPrimary:     '#1C1C1E',  // dark text on light bg
  textSecondary:   'rgba(0,0,0,0.6)',
  textMuted:       'rgba(0,0,0,0.4)',
  textOnNeon:      '#FFFFFF',  // text on dark blue/crimson buttons

  // ── Semantic ────────────────────────────────────────────────
  errorRed:        '#C83232',
  green:           '#34c759',
  secondaryContainer: 'rgba(200,50,50,0.1)',
  onSecondaryContainer: '#C83232',

  // ── Glassmorphism ────────────────────────────────────────────
  glassLight:      'rgba(0,0,0,0.03)',
  glassDark:       '#FFFFFF',
  glassBorder:     'rgba(0,0,0,0.08)',

  // ── Tab Bar ──────────────────────────────────────────────────
  tabInactive:     'rgba(0,0,0,0.35)',
  tabActive:       '#3D4DFF',
  tabDark:         'rgba(0,0,0,0.45)',

  // ── Extended Palette ─────────────────────────────────────────
  danger:          '#C83232',
  success:         '#34c759',
  bgSurface:       '#FDFDF9',
  bgCard:          '#FFFFFF',
  bgGlassBorder:   'rgba(0,0,0,0.08)',
  divider:         'rgba(0,0,0,0.08)',
  textInverse:     '#FFFFFF',
  bgDeep:          '#FDFDF9',
  neonLimeSubtle:  'rgba(61,77,255,0.1)',
  neonCyan:        '#3D4DFF',

  // ── New Premium Colors ───────────────────────────────────────
  orange:          '#C83232',
  warmYellow:      '#3D4DFF',
  crimson:         '#C83232',
  bloodRed:        '#8B0000',
  accentBlue:      '#3D4DFF',
  amber:           '#3D4DFF',
  cardBg:          '#FFFFFF',
  cardBorder:      'rgba(0,0,0,0.08)',

  // ── Backwards compat aliases ────────────────────────────────
  purple:          '#C83232',
  bg:              '#FDFDF9',
} as const;

export const ScreenColors = {
  brand: {
    navy: '#1A1A4E',
    navyAlt: '#2D2D8E',
    coral: '#D85A30',
    appBgWarmWhite: '#FAFAF8',
    appBgCool: '#F4F4F6',
    surface: '#FFFFFF',
    border: '#EEEBE6',
    textPrimary: '#111111',
    textSecondary: '#6B6560',
    textMuted: '#9B9B9B',
    ctaDisabledOpacity: 0.4,
  },
  auth: {
    background: '#EDE8E1',
  },
  profile: {
    background: '#F4F4F6',
  },
  subscription: {
    background: '#FAFAF8',
    cardBackground: '#FFFFFF',
    cardBorder: '#EEEBE6',
    headerBackground: '#FAFAF8',
    primaryAccent: '#D85A30',
    textPrimary: '#1A1A1A',
    textSecondary: '#6B6560',
    textMuted: '#9A9590',
    chipBackground: '#F0EDE8',
    chipText: '#4A4540',
    chipSelectedBackground: '#1A1A1A',
    chipSelectedText: '#FFFFFF',
    searchBackground: '#EEEBE6',
    badgePopularBackground: '#FFF0EB',
    badgePopularText: '#C04A20',
    badgeBestValueBackground: '#EAF3DE',
    badgeBestValueText: '#3B6D11',
    badgeGenericGreen: '#1DB954',
    badgeGenericTeal: '#10A37F',
    badgeGenericOrange: '#D83B01',
    badgeGenericRed: '#FF0000',
    badgeGenericBlue: '#0061FF',
    iconMuted: '#8A847F',
    surfaceDarkSoft: '#1A0A08',
    surfaceDarkCard: '#12101A',
    surfaceDarkCardEnd: '#0A080F',
    borderDarkSoft: '#2A1510',
    modalOverlay: 'rgba(0,0,0,0.5)',
    modalSheetBackground: '#FFFFFF',
    modalPill: '#D7D2CC',
    heroGraphicBorder: '#E8DED6',
    iconOnDark: '#FFFFFF',
    star: '#BA7517',
    categoryChipTint: '#F6ECE7',
  },
  notifications: {
    background: '#FAFAF8',
    itemBackground: '#FFFFFF',
    itemBorder: '#EEEBE6',
    unreadBackground: '#FFF8F5',
    unreadAccent: '#D85A30',
    title: '#1A1A1A',
    body: '#6B6560',
    timestamp: '#9A9590',
    markAllRead: '#378ADD',
    iconInfo: '#378ADD',
    iconMarket: '#BA7517',
    iconSecurity: '#E24B4A',
  },
} as const;

export const Fonts = {
  headline: "'Inter', sans-serif",
  body:     "'Inter', sans-serif",
  label:    "'Inter', sans-serif",
} as const;

export const Radius = {
  sm:   8,
  md:   16,
  lg:   24,
  xl:   32,
  xxl:  36,
  full: 9999,
} as const;

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
  xxxl: 32,
  px:  6,
} as const;

export const FontSize = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   17,
  xl:   20,
  xxl:  26,
  xxxl: 34,
  hero: 44,
} as const;

export const Shadow = {
  neonLime: {
    shadowColor:   '#3D4DFF',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius:  12,
    elevation:     4,
  },
  neonViolet: {
    shadowColor:   '#C83232',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius:  12,
    elevation:     4,
  },
  card: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius:  12,
    elevation:     3,
  },
  warmGlow: {
    shadowColor:   '#000000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius:  8,
    elevation:     2,
  },
} as const;

export const Gradients = {
  signatureNeon: {
    colors: ['#FDFDF9', '#FFFFFF', '#FDFDF9'],
    start:  { x: 0, y: 0 },
    end:    { x: 1, y: 1 },
  },
  neonLimeRadial: ['#3D4DFF', '#2530A8'],
  darkAmbient: {
    colors: ['#FDFDF9', '#FFFFFF', '#FDFDF9'],
    start:  { x: 0, y: 0 },
    end:    { x: 1, y: 1 },
  },
  darkVibrant: {
    colors: ['#d4c4b8ff', '#fffae6ff'],
    start:  { x: 0, y: 0 },
    end:    { x: 1, y: 1 },
  },
  authCTA: {
    colors: ['#C83232', '#9B111E'],
    start:  { x: 0, y: 0 },
    end:    { x: 1, y: 0 },
  },
  heroWarm: {
    colors: ['#FDFDF9', '#FFFFFF', '#FDFDF9', '#FFFFFF'],
    start:  { x: 0, y: 0 },
    end:    { x: 1, y: 1 },
  },
  premiumCard: {
    colors: ['#FFFFFF', '#FFFFFF'],
    start:  { x: 0, y: 0 },
    end:    { x: 1, y: 1 },
  },
} as const;

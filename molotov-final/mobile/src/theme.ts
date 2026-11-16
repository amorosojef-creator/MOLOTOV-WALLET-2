export const C = {
  bg: '#090909',
  surface: '#111411',
  card: '#161A15',
  cardHi: '#1C221A',
  border: '#262D22',
  lime: '#CCFF00',
  limeSoft: 'rgba(204,255,0,0.14)',
  limeLine: 'rgba(204,255,0,0.55)',
  text: '#FFFFFF',
  sub: '#C4CCC0',
  muted: '#8E988B',
  danger: '#FF5C5C',
  dangerSoft: 'rgba(255,92,92,0.14)',
  ink: '#0A0A0A',
  paper: '#F4F5F2',
};
export const R = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const glow = (c = C.lime, r = 18, o = 0.55) => ({ shadowColor: c, shadowOpacity: o, shadowRadius: r, shadowOffset: { width: 0, height: 0 }, elevation: 8 });

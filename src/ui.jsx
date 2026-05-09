/* Small UI primitives shared across views */
const { useState, useEffect, useMemo, useRef } = React;

function Icon({ name, size = 16, color = 'currentColor' }) {
  const s = { width: size, height: size, color };
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'home':       return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M3 11l9-7 9 7v9a2 2 0 01-2 2h-4v-7H10v7H6a2 2 0 01-2-2v-9z"/></svg>;
    case 'pending':    return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M3 7h18M3 12h18M3 17h12"/><circle cx="20" cy="17" r="2.5"/></svg>;
    case 'dashboard':  return <svg style={s} viewBox="0 0 24 24" {...stroke}><rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/></svg>;
    case 'table':      return <svg style={s} viewBox="0 0 24 24" {...stroke}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/></svg>;
    case 'calendar':   return <svg style={s} viewBox="0 0 24 24" {...stroke}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>;
    case 'refresh':    return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M3 12a9 9 0 0115.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 01-15.5 6.3L3 16M3 21v-5h5"/></svg>;
    case 'download':   return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14"/></svg>;
    case 'printer':    return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M6 9V4h12v5M6 18H4a1 1 0 01-1-1v-6a2 2 0 012-2h14a2 2 0 012 2v6a1 1 0 01-1 1h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></svg>;
    case 'search':     return <svg style={s} viewBox="0 0 24 24" {...stroke}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case 'arrow-r':    return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case 'arrow-l':    return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M19 12H5M11 6l-6 6 6 6"/></svg>;
    case 'check':      return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M5 13l4 4L19 7"/></svg>;
    case 'x':          return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M6 6l12 12M18 6l-12 12"/></svg>;
    case 'mail':       return <svg style={s} viewBox="0 0 24 24" {...stroke}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/></svg>;
    case 'lock':       return <svg style={s} viewBox="0 0 24 24" {...stroke}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 118 0v4"/></svg>;
    case 'open':       return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M3 7l9 6 9-6"/><path d="M3 7v12a2 2 0 002 2h14a2 2 0 002-2V7"/><path d="M3 7l9-4 9 4"/></svg>;
    case 'warn':       return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18.5v.01"/></svg>;
    case 'info':       return <svg style={s} viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 12h1v5h1"/></svg>;
    case 'phone':      return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/></svg>;
    case 'hotel':      return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M3 21V5h12v16M15 11h6v10M8 9h2M8 13h2M8 17h2M18 14h.01M18 17h.01"/></svg>;
    case 'note':       return <svg style={s} viewBox="0 0 24 24" {...stroke}><path d="M5 4h11l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"/><path d="M16 4v4h4M8 12h8M8 16h6"/></svg>;
    case 'sun':        return <svg style={s} viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>;
    default: return null;
  }
}

function Pill({ tone = 'muted', children }) {
  return <span className={'status-pill ' + tone}><span className="dot"></span>{children}</span>;
}

function OpDot({ cal }) {
  return <span className="dot-op" style={{ background: WEFLY.opColor(cal) }}></span>;
}

function OpTag({ cal }) {
  return (
    <span className="op-tag">
      <span className="dot" style={{ background: WEFLY.opColor(cal) }}></span>
      {WEFLY.opLabel(cal)}
    </span>
  );
}

function fmtTime(t) {
  if (!t) return '—';
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function clsx(...xs) { return xs.filter(Boolean).join(' '); }

Object.assign(window, { Icon, Pill, OpDot, OpTag, fmtTime, clsx });

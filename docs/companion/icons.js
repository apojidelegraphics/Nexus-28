/* Generated from the Nexus '28 Mac app by scripts/sync-companion.js — edit the original, not this copy. */
// Our own icon set instead of emojis (Apoji Admin 2.6; Nexus '28, N28C and Test Run 3.11). Shared: apoji-admin/icons.js
// = nexus-desktop/renderer/icons.js (keep the two the same). One line style (24 × 24, 1.8 stroke, round ends, currentColor),
// drawn for Apoji Admin. Emojis in the interface (menu, headings, buttons, tags, cards, toasts) are swapped for these as
// pages draw; emojis people type (team chat, notes, reports, reactions, training examples) are left alone.
//   NX.icon(name) → '<svg …>' · NX.iconize(el) · NX.ICONS (the set) · NX.EMOJI_ICONS (emoji → icon)
(function (NX) {          // Apoji Admin has NX; the Nexus apps use window.NexusIcons
  const W = typeof window !== 'undefined' ? window : globalThis;
  const I = {
    // people & roles
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M2.8 19.5c.6-3.3 3.1-5.2 6.2-5.2s5.6 1.9 6.2 5.2"/><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.6 14.6c1.9.6 3.2 2.3 3.6 4.9"/>',
    crown: '<path d="M3.5 8.5 7.5 12 12 5.5l4.5 6.5 4-3.5-1.7 9.5H5.2z"/><path d="M5.5 20.5h13"/>',
    hand: '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7.5c0 4-2.6 7-6.5 7-2.5 0-4-1.3-5.4-3.4L3.3 14.4a1.5 1.5 0 0 1 2.5-1.6L8 15.5"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z"/>',
    // status & feedback
    check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.3 2.6 2.6 5-5.4"/>',
    cross: '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/>',
    stop: '<path d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z"/><path d="M8 12h8"/>',
    warning: '<path d="M12 3.8 21.2 19.5H2.8z"/><path d="M12 9.5v4.5M12 16.8v.2"/>',
    siren: '<path d="M6.5 18v-5.5a5.5 5.5 0 0 1 11 0V18"/><path d="M4.5 18h15v2.5h-15zM12 3v1.8M4.2 6.2l1.3 1.3M19.8 6.2l-1.3 1.3"/>',
    up: '<path d="M7 10h3V5.5a2 2 0 0 1 4 0V10M7 10v10h9.6a2 2 0 0 0 2-1.6l1.2-6a2 2 0 0 0-2-2.4H14"/><path d="M3.5 10H7v10H3.5z"/>',
    down: '<path d="M7 14h3v4.5a2 2 0 0 0 4 0V14M7 14V4h9.6a2 2 0 0 1 2 1.6l1.2 6a2 2 0 0 1-2 2.4H14"/><path d="M3.5 4H7v10H3.5z"/>',
    sparkles: '<path d="M10 3.5 11.7 8.3 16.5 10l-4.8 1.7L10 16.5l-1.7-4.8L3.5 10l4.8-1.7z"/><path d="M17.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    party: '<path d="m4 20 4.5-12 7.5 7.5z"/><path d="M13 4.5c.6 1.6.2 3.1-1 4M19.5 11c-1.6-.6-3.1-.2-4 1M16.5 3.5v.1M20.5 7.5v.1M9.5 3.5v.1"/>',
    flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.8 0-3.1 2.3-4.8 3.4-7.5.6 1.4 1.6 2.3 2.6 2.6C12 6.8 13.4 4.8 15 3c.3 3.4 3 5.5 3 9.6C18 17.6 15.6 21 12 21z"/>',
    // things & places
    flask: '<path d="M9.5 3h5M10.5 3v5.6L5 18.4A1.8 1.8 0 0 0 6.6 21h10.8a1.8 1.8 0 0 0 1.6-2.6l-5.5-9.8V3"/><path d="M7.5 14.5h9"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2"/>',
    unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5M12 14.5v2"/>',
    lockkey: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1.4"/><path d="M12 16.4v1.6"/>',
    key: '<circle cx="8" cy="15.5" r="4"/><path d="m11 12.6 8.5-8.5M16.5 7l2.5 2.5M14 9.5l2 2"/>',
    wrench: '<path d="M15 3.8a5 5 0 0 0-4.6 6.9l-6.6 6.6a1.9 1.9 0 0 0 2.7 2.7l6.6-6.6A5 5 0 0 0 20 8.8l-3 1-2.2-2.2 1-3z"/>',
    toolbox: '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8.5 8V5.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5V8M3 13h18M10 13v2h4v-2"/>',
    rocket: '<path d="M12 15.5 8.5 12C10 6.5 13.5 3.5 20.5 3.5c0 7-3 10.5-8.5 12z"/><path d="M8.5 12 5 11.5l2.8-3.3h4M12 15.5l.5 3.5 3.3-2.8v-4M6 16.5c-1.4.6-2.2 2-2.5 4 2-.3 3.4-1.1 4-2.5"/><circle cx="15.3" cy="8.7" r="1.4"/>',
    brain: '<path d="M9.5 4.5A2.8 2.8 0 0 0 6.7 7a3 3 0 0 0-2.2 4.2 3.2 3.2 0 0 0 1.3 5A3 3 0 0 0 9.5 19.5c1.2 0 2.5-.8 2.5-2V6.6c0-1.2-1.2-2.1-2.5-2.1zM14.5 4.5A2.8 2.8 0 0 1 17.3 7a3 3 0 0 1 2.2 4.2 3.2 3.2 0 0 1-1.3 5 3 3 0 0 1-3.7 3.3c-1.2 0-2.5-.8-2.5-2"/><path d="M9 10.5c1 0 1.8.6 2 1.5M15 10.5c-1 0-1.8.6-2 1.5"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    laptop: '<rect x="4.5" y="5" width="15" height="10" rx="1.5"/><path d="M2.5 19h19l-1.5-4H4z"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="1.8"/><path d="M9 20h6M12 16v4"/>',
    window: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M6.5 6.8h.01M9 6.8h.01"/>',
    terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="m7 9.5 3 2.5-3 2.5M12.5 15h4.5"/>',
    inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z"/><path d="M3.5 13.5h5l1.2 2.5h4.6l1.2-2.5h5"/>',
    scroll: '<path d="M7 3.5h10.5a2 2 0 0 1 2 2V8H17M7 3.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9.5a2 2 0 0 0 2-2V8"/><path d="M8.5 9h6M8.5 12.5h6M8.5 16h4"/>',
    pin: '<path d="M14.5 3.5 20.5 9.5l-2.5 1-4 4 .5 3.5-1.5 1.5-4-4-4.5 4.5M9 14.5l-4-4L6.5 9 10 9.5l4-4z"/>',
    notebook: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18M12 7.5h4M12 11h4"/>',
    broadcast: '<circle cx="12" cy="12" r="1.8"/><path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 18.7a9.5 9.5 0 0 1 0-13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4"/>',
    bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
    chat: '<path d="M4 5.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2H10l-4.5 3.5V17H6a2 2 0 0 1-2-2z"/>',
    flag: '<path d="M5.5 21V3.8M5.5 4c3.5-1.8 6 1.8 9.5 0s3.5 0 3.5 0v8.5s-1-1.8-3.5 0-6-1.8-9.5 0"/>',
    finish: '<path d="M5.5 21V4M5.5 4h13l-2.5 4.5 2.5 4.5h-13"/><path d="M9.5 4v9M13.5 4v9M5.5 8.5h11.5"/>',
    triangle: '<path d="M12 3.5 21 19.5H3z"/><path d="M12 9.5 16.3 17H7.7z"/>',
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    belloff: '<path d="M6 16.5V11a6 6 0 0 1 9.4-4.9M18 11v5.5l1.5 2h-15M10 20.5a2.2 2.2 0 0 0 4 0M3.5 3.5l17 17"/>',
    clip: '<path d="m19.5 11.5-7.4 7.4a4.6 4.6 0 0 1-6.5-6.5l7.8-7.8a3 3 0 0 1 4.3 4.3l-7.6 7.6a1.5 1.5 0 0 1-2.1-2.1l7-7"/>',
    net: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18"/><circle cx="12" cy="12" r="4"/>',
    pen: '<path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5zM14 6.5l3 3"/><path d="M13 20h7"/>',
    pencil: '<path d="M4 20l1-4.5L16 4.5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="m14 6.5 3 3"/>',
    megaphone: '<path d="M3.5 10v4a1.5 1.5 0 0 0 1.5 1.5h2l9 4.5V4L7 8.5H5A1.5 1.5 0 0 0 3.5 10z"/><path d="m7.5 15.5 1.2 4.5h2.5l-1-4M19 9.5a3.5 3.5 0 0 1 0 5"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8v12M9 8a3 3 0 0 1 6 0M3.5 13H7M17 13h3.5M4.5 8.5 7.3 10M19.5 8.5 16.7 10M4.5 18.5l2.8-1.5M19.5 18.5l-2.8-1.5"/>',
    pulse: '<path d="M3 12.5h4l2.2-5.5 3.6 11 2.4-5.5H21"/>',
    chart: '<path d="M4 20.5h16M6.5 17V12M11 17V7M15.5 17v-6.5M20 17V4"/>',
    trend: '<path d="M3.5 17.5 9 12l3.5 3.5 8-8"/><path d="M15 7.5h5.5V13"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.5"/>',
    satellite: '<path d="m10.5 7.5 6 6-3 3-6-6z"/><path d="M7.5 10.5 3.5 6.5 6.5 3.5l4 4M16.5 13.5l4 4-3 3-4-4M15 6a3 3 0 0 1 3 3M16 3a5.5 5.5 0 0 1 5 5"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6.5L20.5 7"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 14h.01M18 14h.01M9 14h6"/>',
    sleep: '<path d="M4 8h5l-5 6h5M13 4h4l-4 5h4M15 13h5l-5 7h5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3.3-3.3a4 4 0 0 0-5.7-5.7L11.8 6.5"/><path d="M14 10a4 4 0 0 0-5.7 0L5 13.3A4 4 0 0 0 10.7 19l1.5-1.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
    alarm: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 1.5M4 5.5 7 3M20 5.5 17 3"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V10M10 2.5h4M18.5 6l1.5-1.5"/>',
    hourglass: '<path d="M6.5 3h11M6.5 21h11M7.5 3c0 5 4.5 6 4.5 9s-4.5 4-4.5 9M16.5 3c0 5-4.5 6-4.5 9s4.5 4 4.5 9"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
    receipt: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
    card: '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19M6 15h4"/>',
    gift: '<rect x="4" y="9" width="16" height="11.5" rx="1.5"/><path d="M3 9h18v3H3zM12 9v11.5M12 9c-1.5-3.5-5.5-4.2-5.5-1.8C6.5 8.4 8.5 9 12 9zM12 9c1.5-3.5 5.5-4.2 5.5-1.8C17.5 8.4 15.5 9 12 9z"/>',
    trash: '<path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14M10 10.5v6M14 10.5v6"/>',
    coffee: '<path d="M4.5 9h12v5.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M16.5 10.5h1.5a2.5 2.5 0 0 1 0 5h-1.6M8 3.5c-.6.8-.6 1.7 0 2.5M11.5 3.5c-.6.8-.6 1.7 0 2.5"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.5 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.5-3.6-8.5S9.5 6.1 12 3.5z"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    bandage: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M10.5 10.5h.01M13.5 13.5h.01M10.5 13.5h.01M13.5 10.5h.01"/>',
    doc: '<path d="M6 2.5h8l4.5 4.5v14.5H6z"/><path d="M14 2.5V7h4.5M9 12h6M9 15.5h6"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    skip: '<path d="M5 5.5 14 12l-9 6.5zM18.5 5.5v13"/>',
    scale: '<path d="M12 3.5v17M6.5 20.5h11M4.5 7.5h15M4.5 7.5 2 13.5a3 3 0 0 0 5 0zM19.5 7.5 17 13.5a3 3 0 0 0 5 0z"/>',
    battery: '<rect x="2.5" y="7.5" width="17" height="9" rx="1.8"/><path d="M21.5 10.5v3M5.5 10.5v3M8.5 10.5v3"/>',
    moon: '<path d="M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z"/>',
    plug: '<path d="M8.5 3v5M15.5 3v5M6 8h12v3.5a6 6 0 0 1-12 0zM12 17.5v3.5"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M4.5 9v10.5h15V9M10 13h4"/>',
    folders: '<path d="M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5H17M6.5 4.5h4l1.5 2h7.5A1.5 1.5 0 0 1 21 8v7a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 15z"/>',
    power: '<path d="M12 3v8.5M7 6.2a7.5 7.5 0 1 0 10 0"/>',
    robot: '<rect x="4.5" y="7.5" width="15" height="11" rx="3"/><path d="M12 3.5v4M9 12.5h.01M15 12.5h.01M9.5 15.5h5M2.5 12v3M21.5 12v3"/>',
    camera: '<path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.5L9 4.5h6L16.5 7H19a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/><circle cx="12" cy="13" r="3.5"/>',
    speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3.5"/>',
    hole: '<ellipse cx="12" cy="13" rx="8.5" ry="4.5"/><path d="M6 11.5a6 6 0 0 1 12 0" stroke-dasharray="2 2.4"/>',
    wind: '<path d="M3 9h10.5a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 17h7"/>',
    tree: '<circle cx="6" cy="12" r="2"/><circle cx="18" cy="5.5" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="18" cy="18.5" r="2"/><path d="M8 12h8M8 11c4-.2 4-5.5 8-5.5M8 13c4 .2 4 5.5 8 5.5"/>',
    books: '<path d="M4.5 4h4v16h-4zM8.5 6h4v14h-4zM13.5 5.5l3.8-1 3.7 14.7-3.8 1z"/>',
    map: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
    clipboard: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5M9 3.5h6M8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
    ruler: '<rect x="2.5" y="8" width="19" height="8" rx="1.5" transform="rotate(-45 12 12)"/><path d="m9 9 1.5 1.5M11.5 6.5 13 8M6.5 11.5 8 13M14 4l1.5 1.5"/>',
    star: '<path d="m12 3.5 2.6 5.5 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.7l6-.7z"/>',
    dot: '<circle cx="12" cy="12" r="5.5" fill="currentColor" stroke="none"/>',
    upload: '<path d="M12 15.5V4M7 8.5 12 3.5l5 5M4.5 15.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3.5"/>',
    download: '<path d="M12 3.5V15M7 10.5l5 5 5-5M4.5 15.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3.5"/>',
    command: '<path d="M9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zm0 0h6m-6 0v6m6-6V6.5A2.5 2.5 0 1 1 17.5 9H15zm0 0v6m0 0h-6m6 0v2.5a2.5 2.5 0 1 0 2.5-2.5H15zm-6 0v2.5A2.5 2.5 0 1 1 6.5 15H9z"/>',
    // 3.11 (Nexus '28, N28C, Test Run): the rest of the emojis the apps used
    cards: '<rect x="3.5" y="6" width="11" height="15" rx="2" transform="rotate(-8 9 13.5)"/><rect x="9.5" y="3.5" width="11" height="15" rx="2"/><path d="M15 8.5v5M12.5 11h5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.6A3.8 3.8 0 0 1 17.5 18.5z"/>',
    rain: '<path d="M7 14.5a4.2 4.2 0 0 1-.6-8.4 5.6 5.6 0 0 1 10.8 1.5 3.5 3.5 0 0 1 .3 6.9z"/><path d="M8 17.5 7 20M12 17.5 11 20M16 17.5 15 20"/>',
    snow: '<path d="M7 13.5a4.2 4.2 0 0 1-.6-8.4 5.6 5.6 0 0 1 10.8 1.5 3.5 3.5 0 0 1 .3 6.9z"/><path d="M8 17v.1M12 18.5v.1M16 17v.1M10 20.5v.1M14 20.5v.1"/>',
    storm: '<path d="M7 13.5a4.2 4.2 0 0 1-.6-8.4 5.6 5.6 0 0 1 10.8 1.5 3.5 3.5 0 0 1 .3 6.9z"/><path d="m12.5 13.5-2.5 4h3.5l-2 4"/>',
    partly: '<path d="M8.5 4.5v1M3.8 6.3l.7.7M2.5 11h1M10.5 8.8a3.5 3.5 0 0 0-5.4 4"/><path d="M9 20a3.8 3.8 0 0 1-.5-7.6 5 5 0 0 1 9.6 1.3A3.2 3.2 0 0 1 17.8 20z"/>',
    fog: '<path d="M4 9h13M7 12.5h13M4 16h12M8 19.5h9"/><path d="M6.5 9a5.5 5.5 0 0 1 10.6-1.8"/>',
    thermo: '<path d="M10 14.2V5a2 2 0 0 1 4 0v9.2a3.8 3.8 0 1 1-4 0z"/><path d="M12 10v6.5"/>',
    incognito: '<path d="M3 12.5h18M5.5 12.5 7.3 6a1.5 1.5 0 0 1 1.9-1l2.8 1 2.8-1a1.5 1.5 0 0 1 1.9 1l1.8 6.5"/><circle cx="7.5" cy="17" r="2.5"/><circle cx="16.5" cy="17" r="2.5"/><path d="M10 17h4"/>',
    note: '<path d="M6 3.5h9l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M15 3.5V8h4M8.5 12h7M8.5 15.5h7M8.5 19h4"/>',
    folder: '<path d="M3 7a1.5 1.5 0 0 1 1.5-1.5h4.3l2 2.2h8.7A1.5 1.5 0 0 1 21 9.2v9.3a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
    bulb: '<path d="M9 17.5h6M9.8 20.5h4.4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    trophy: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5a3 3 0 0 0 3 4M16.5 6h3a3 3 0 0 1-3 4M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
    medal: '<path d="M8 3h3l1.5 5M16 3h-3l-1.5 5"/><circle cx="12" cy="14.5" r="5.5"/><path d="m12 11.8.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3z"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.8 0-1.4-1.2-1.7-1.2-3 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1.1"/><circle cx="10" cy="7.5" r="1.1"/><circle cx="14.5" cy="7.5" r="1.1"/>',
    repeat: '<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19M16 3l3 3-3 3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5M8 21l-3-3 3-3"/>',
    grad: '<path d="m2.5 9 9.5-4.5L21.5 9 12 13.5z"/><path d="M6.5 11v4.5c1.4 1.4 3.4 2 5.5 2s4.1-.6 5.5-2V11M21.5 9v5"/>',
    phoneoff: '<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M3.5 3.5l17 17M11 18.5h2"/>',
    money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v.1M18 14.5v.1"/>',
    smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2M9 9.5v.5M15 9.5v.5"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.7"/><path d="m4 17 5-4.5 3.5 3 3-2.5 4 3.5"/>',
    thread: '<circle cx="12" cy="12" r="5"/><path d="M8.5 8.5c2 1.5 5 1.5 7 0M8 13c2.5 1.5 5.5 1.5 8 0M15.5 15.5c1.5 2 3 4 5 5"/>',
    swords: '<path d="M14.5 4H20v5.5L9 20.5 5.5 20.5v-3.5z"/><path d="M4 4h5.5l3 3M20 20.5h-3.5l-3-3M6 15l3 3M15 15l3 3"/>',
    access: '<circle cx="12" cy="4.5" r="1.8"/><path d="M5 8h14M12 8v6M8.5 21l3.5-7 3.5 7"/>',
    speak: '<circle cx="9" cy="9" r="3.5"/><path d="M2.5 20c.6-3.3 3.2-5.5 6.5-5.5s5.9 2.2 6.5 5.5M16.5 6c1 .8 1.5 1.9 1.5 3s-.5 2.2-1.5 3M19 3.5c1.6 1.4 2.5 3.3 2.5 5.5s-.9 4.1-2.5 5.5"/>',
    pause: '<circle cx="12" cy="12" r="8.5"/><path d="M10 8.8v6.4M14 8.8v6.4"/>',
    play: '<circle cx="12" cy="12" r="8.5"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
    question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 16.8v.2"/>',
    scissors: '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="M8.5 8 20 18.5M8.5 16 20 5.5"/>',
    hat: '<path d="M3 17.5c2.5 1.6 5.5 2.5 9 2.5s6.5-.9 9-2.5"/><path d="M6.5 17V8.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2V17M6.5 13.5h11"/>',
    door: '<path d="M5 21V4a1 1 0 0 1 1-1h9.5a1 1 0 0 1 1 1v17M3 21h18M13.5 12v.1"/>',
    infinity: '<path d="M12 12c-2-2.6-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.4 5.5-4zm0 0c2 2.6 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.4-5.5 4z"/>',
    heart: '<path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>',
    paw: '<ellipse cx="12" cy="16" rx="4" ry="3.5"/><circle cx="6" cy="10.5" r="1.8"/><circle cx="9.5" cy="6.5" r="1.8"/><circle cx="14.5" cy="6.5" r="1.8"/><circle cx="18" cy="10.5" r="1.8"/>',
    abacus: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 8.5h17M3.5 15.5h17"/><circle cx="8" cy="8.5" r="1.3"/><circle cx="12" cy="8.5" r="1.3"/><circle cx="10" cy="15.5" r="1.3"/><circle cx="15.5" cy="15.5" r="1.3"/>',
    plane: '<path d="M10.5 13.5 3 11l1.5-1.5 7.5 1L16.5 6a2 2 0 0 1 3 0 2 2 0 0 1 0 3L15 13.5l1 7.5-1.5 1.5L12 15l-3.5 3.5V21L7 22.5 5.5 19 2 17.5 3.5 16H6z"/>',
    news: '<path d="M4.5 5h12v14a1.5 1.5 0 0 0 1.5 1.5H5.5a1 1 0 0 1-1-1z"/><path d="M16.5 9h3v10a1.5 1.5 0 0 1-3 0M7.5 8.5h6M7.5 12h6M7.5 15.5h4"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    eagle: '<path d="M2.5 9c3 0 5.5 1 7.5 3l2-4c1-2 3-3 5-3l4 2-3 1.5c0 4-3 7.5-7 8.5l-2 4-2-3c-2.5-1-4-3.5-4.5-6z"/><path d="M15.5 6.5v.1"/>',
    telescope: '<path d="m3 13.5 12.5-7 2 3.5L5 17z"/><path d="m15.5 6.5 3-1.7 2 3.5-3 1.7M10.5 14.5 8 21M11.5 14l3.5 7"/>',
    trash2: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13.5h9l1-13.5"/>'
  };
  const DOT = { '🟢': 'var(--online, #3ddc84)', '🔴': 'var(--danger, #ff5a6e)', '🟠': '#ff9f43', '🟡': 'var(--gold, #ffd36b)', '🔵': '#5ca8ff', '⚪': 'var(--muted, #9a92bd)' };
  const E = {
    '🧪': 'flask', '🔒': 'lock', '✅': 'check', '🛠': 'wrench', '🔧': 'wrench', '👍': 'up', '👎': 'down', '⏰': 'alarm', '🚀': 'rocket', '✨': 'sparkles', '📱': 'phone',
    '🔑': 'key', '🗝': 'key', '⛔': 'stop', '🧠': 'brain', '⬆': 'upload', '⬇': 'download', '⚠': 'warning', '📮': 'inbox', '📜': 'scroll', '🎉': 'party', '🥳': 'party',
    '📌': 'pin', '📍': 'pin', '👥': 'users', '📓': 'notebook', '📡': 'broadcast', '⚡': 'bolt', '💬': 'chat', '🚩': 'flag', '⚑': 'flag', '🛡': 'shield', '🔐': 'lockkey',
    '🔺': 'triangle', '🔔': 'bell', '🔕': 'belloff', '📎': 'clip', '💻': 'laptop', '🍎': 'laptop', '🖥': 'monitor', '🪟': 'window', '🐧': 'terminal', '🕸': 'net',
    '🚨': 'siren', '👑': 'crown', '👤': 'user', '✍': 'pen', '📣': 'megaphone', '🐞': 'bug', '🐛': 'bug', '🩺': 'pulse', '📊': 'chart', '📈': 'trend', '⚙': 'gear',
    '🔓': 'unlock', '🛰': 'satellite', '✏': 'pencil', '✉': 'mail', '✋': 'hand', '👋': 'hand', '⌨': 'keyboard', '💤': 'sleep', '🔗': 'link', '⛓': 'link',
    '🕘': 'clock', '🕐': 'clock', '⏱': 'timer', '⏳': 'hourglass', '🧾': 'receipt', '💳': 'card', '🎁': 'gift', '❌': 'cross', '🗑': 'trash', '☕': 'coffee',
    '🌐': 'globe', '🌍': 'globe', '🔎': 'search', '🔍': 'search', '🩹': 'bandage', '🔥': 'flame', '📄': 'doc', '👁': 'eye', '⏭': 'skip', '⚖': 'scale', '📅': 'calendar',
    '🗓': 'calendar', '🔋': 'battery', '🌙': 'moon', '🔌': 'plug', '🗄': 'archive', '🗂': 'folders', '⏻': 'power', '🧰': 'toolbox', '🏁': 'finish', '🤖': 'robot',
    '📷': 'camera', '🔊': 'speaker', '🎙': 'mic', '🕳': 'hole', '💨': 'wind', '🌳': 'tree', '📚': 'books', '🗺': 'map', '📋': 'clipboard', '📏': 'ruler', '★': 'star', '⭐': 'star', '⌘': 'command',
    '🃏': 'cards', '☀': 'sun', '🌞': 'sun', '☼': 'sun', '☾': 'moon', '🌧': 'rain', '🌦': 'rain', '🌨': 'snow', '❄': 'snow', '⛈': 'storm', '🌤': 'partly', '⛅': 'partly', '☁': 'cloud', '🌫': 'fog', '🌡': 'thermo',
    '🕶': 'incognito', '📝': 'note', '📁': 'folder', '💡': 'bulb', '🏆': 'trophy', '🥇': 'medal', '🥈': 'medal', '🥉': 'medal', '🎖': 'medal', '📥': 'inbox', '📤': 'upload', '🎨': 'palette',
    '🔁': 'repeat', '🔄': 'repeat', '🎓': 'grad', '📴': 'phoneoff', '💸': 'money', '🙂': 'smile', '😊': 'smile', '🖼': 'image', '🧵': 'thread', '⚔': 'swords', '♿': 'access', '🗣': 'speak',
    '🗨': 'chat', '⏸': 'pause', '❓': 'question', '✂': 'scissors', '🎩': 'hat', '🚪': 'door', '👀': 'eye', '♾': 'infinity', '💞': 'heart', '♥': 'heart', '❤': 'heart', '🐾': 'paw', '🧮': 'abacus',
    '✈': 'plane', '📰': 'news', '🎯': 'target', '🦅': 'eagle', '🔭': 'telescope', '📐': 'ruler', '⌛': 'hourglass', '✎': 'pencil', '📲': 'phone', '🏠': 'door', '🔖': 'pin', '📦': 'archive', '🎵': 'speaker', '🎶': 'speaker', '📞': 'phone', '⚗': 'flask',
    ...Object.fromEntries(Object.keys(DOT).map(k => [k, 'dot']))
  };
  const RE = new RegExp('(' + Object.keys(E).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?', 'gu');
  const svg = (name, extra = '') => `<svg class="ico ico-${name}" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${I[name]}</svg>`;
  NX.ICONS = I; NX.EMOJI_ICONS = E;
  NX.icon = name => I[name] ? svg(name) : '';
  // where emojis are what people wrote, not the interface: left alone
  const KEEP = '[style*="pre-wrap"],.msg .body,.msg-edit,.bubble,.md-out,[data-user-text],.chat-title-text,.msgs .msg.you,.msgs .msg.user,.msgs .m .tx,.msgs .m .rq,.msgs .m .rx,.msgs .m .tools [data-rx],.msgs .m [data-act="react"],.thread-r .rb,.quote,.emojis,.rx,.mentions,.mdv,.tr-qa,.beta-note,.tp-body,textarea,input,select,option,[contenteditable],pre,code,svg,script,style,.no-icons,[data-user-text]';
  function iconize(root) {
    if (!root || root.nodeType !== 1 || root.closest?.(KEEP)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => {
      if (!n.nodeValue || !RE.test(n.nodeValue)) { RE.lastIndex = 0; return NodeFilter.FILTER_REJECT; }
      RE.lastIndex = 0; return n.parentElement?.closest(KEEP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
    const hits = []; while (walker.nextNode()) hits.push(walker.currentNode);
    for (const t of hits) {
      const frag = document.createElement('span'); frag.innerHTML = t.nodeValue.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
        .replace(RE, (m, e) => { const name = E[e]; return DOT[e] ? svg('dot', `style="color:${DOT[e]}"`) : svg(name); });
      t.replaceWith(...frag.childNodes);
    }
  }
  // a <select>'s options can't draw an icon, so their emojis are just dropped (2.7)
  function stripOptions(root) {
    if (!root || root.nodeType !== 1) return;
    const list = root.tagName === 'OPTION' ? [root] : root.tagName === 'SELECT' || root.querySelector ? [...root.querySelectorAll('option, optgroup')] : [];
    for (const o of list) { const attr = o.tagName === 'OPTGROUP' ? 'label' : null; const t = attr ? o.label : o.textContent; RE.lastIndex = 0; if (t && RE.test(t)) { RE.lastIndex = 0; const c = t.replace(RE, '').replace(/\s{2,}/g, ' ').trim(); if (attr) o.label = c; else o.textContent = c; } RE.lastIndex = 0; }
  }
  const iconizeAll = el => { iconize(el); stripOptions(el); };
  NX.iconize = iconize;
  // for the mind maps (mindtree.js): a label's leading emoji → { inner, rest }
  NX.iconFor = label => { const m = String(label || '').match(/^\s*([^\s\w])\uFE0F?\s*/u) || String(label || '').match(/^\s*(\p{Extended_Pictographic})\uFE0F?\s*/u); const name = m && E[m[1]]; return name && I[name] ? { inner: I[name], rest: label.slice(m[0].length) } : null; };
  // title text (tooltips) and document.title keep their emojis; everything drawn into the page gets icons
  let queued = new Set(), raf = 0;
  const flush = () => { raf = 0; const list = [...queued]; queued.clear(); for (const el of list) if (el.isConnected) iconizeAll(el); };
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') { const p = m.target.parentElement; if (p) queued.add(p); continue; }
      for (const n of m.addedNodes) if (n.nodeType === 1) queued.add(n); else if (n.nodeType === 3 && n.parentElement) queued.add(n.parentElement);
    }
    if (queued.size && !raf) raf = requestAnimationFrame(flush);
  });
  W.NexusIcons = { ICONS: I, EMOJI_ICONS: E, icon: NX.icon, iconize, iconFor: NX.iconFor, strip: t => String(t || '').replace(RE, '').replace(/\s{2,}/g, ' ').trim() };
  if (typeof document !== 'undefined' && document.head?.prepend) { const st = document.createElement('style'); st.id = 'ico-base'; st.textContent = '.ico{display:inline-block;width:1.15em;height:1.15em;vertical-align:-.2em;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}.ico.ico-crown{fill:#ffd36b;stroke:#9a6b00;stroke-width:1.4}'; document.head.prepend(st); }
  const start = () => { iconizeAll(document.body); mo.observe(document.body, { childList: true, subtree: true, characterData: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof NX !== 'undefined' ? NX : (typeof window !== 'undefined' && window.NX) || {});

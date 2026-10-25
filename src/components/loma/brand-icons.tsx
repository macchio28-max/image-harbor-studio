/* Brand logos: official brand colors are intrinsic to the marks, so they are kept as literal fills. */
type P = { className?: string };
const S = (p: P & { children: React.ReactNode; vb?: string }) => (
  <svg viewBox={p.vb ?? "0 0 24 24"} className={p.className} aria-hidden="true">{p.children}</svg>
);

export const ChatGPTIcon = (p: P) => (
  <S {...p}>
    <rect width="24" height="24" rx="6" fill="#10a37f" />
    <path fill="#fff" transform="translate(3.6 3.6) scale(.7)" d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07Zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.8.8 0 0 0 .4-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.5 4.5Zm-9.66-4.13a4.47 4.47 0 0 1-.53-3.01l.14.09 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06l-4.83 2.79a4.5 4.5 0 0 1-6.15-1.65ZM2.34 7.9a4.49 4.49 0 0 1 2.37-1.97v5.68a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.87Zm16.6 3.86-5.84-3.39 2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.4-.66Zm2.01-3.02-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66ZM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.08a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.78 2.76a.8.8 0 0 0-.4.68Zm1.1-2.37 2.6-1.5 2.61 1.5v3l-2.6 1.5-2.6-1.5Z" />
  </S>
);

export const MetaAIIcon = (p: P) => (
  <S {...p}>
    <defs>
      <linearGradient id="metaai" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#0064e0" /><stop offset=".5" stopColor="#6b2cf5" /><stop offset="1" stopColor="#c837ab" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="8.5" fill="none" stroke="url(#metaai)" strokeWidth="4" />
  </S>
);

export const GeminiIcon = (p: P) => (
  <S {...p}>
    <defs>
      <linearGradient id="gem" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#1c7df0" /><stop offset=".55" stopColor="#7e6cf2" /><stop offset="1" stopColor="#d36bb0" />
      </linearGradient>
    </defs>
    <path fill="url(#gem)" d="M12 1c.6 5.7 4.6 9.9 11 11-6.4 1.1-10.4 5.3-11 11-.6-5.7-4.6-9.9-11-11 6.4-1.1 10.4-5.3 11-11Z" />
  </S>
);

export const FlowIcon = (p: P) => (
  <S {...p}>
    <rect x="1.5" y="3.5" width="21" height="17" rx="4" fill="#fbbc04" />
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" fill="#ea4335" />
    <rect x="5.5" y="7.5" width="13" height="9" rx="2" fill="#4285f4" />
    <path d="M10.3 9.6v4.8l4.2-2.4z" fill="#fff" />
  </S>
);

export const TopazPhotoIcon = (p: P) => (
  <S {...p}>
    <defs>
      <linearGradient id="tpz" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#c58bff" /><stop offset="1" stopColor="#6d28d9" />
      </linearGradient>
    </defs>
    <path fill="url(#tpz)" d="M6 3h12l4 6-10 13L2 9z" />
    <path fill="#fff" fillOpacity=".35" d="M2 9h20L12 22zM6 3l3 6h6l3-6z" />
  </S>
);

export const TopazGigapixelIcon = (p: P) => (
  <S {...p}>
    <path fill="#f97316" d="M12 1.5 21.5 7v10L12 22.5 2.5 17V7z" />
    <path fill="#fff" d="M15.8 9.3A4.4 4.4 0 1 0 16.4 13H12v-2h6.6a6.6 6.6 0 1 1-1.2-3.2z" />
  </S>
);

export const DriveIcon = (p: P) => (
  <S {...p} vb="0 0 87.3 78">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
    <path d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.5A9.06 9.06 0 0 0 0 53h27.5z" fill="#00ac47" />
    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.5z" fill="#ea4335" />
    <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
    <path d="M73.4 26.5 60.7 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
  </S>
);

export const OneDriveIcon = (p: P) => (
  <S {...p}>
    <path fill="#0364b8" d="M14.5 15.5 19.4 10.8A7 7 0 0 0 6.9 8.6z" />
    <path fill="#0078d4" d="M9.2 9.3a5.6 5.6 0 0 0-2.3-.7A5.5 5.5 0 0 0 2.3 17l7.2.4 10-6.5-.1-.1A7 7 0 0 0 9.2 9.3z" />
    <path fill="#1490df" d="M19.4 10.8a4.5 4.5 0 0 0-1.5-.1 4.5 4.5 0 0 0-3.4 1.6L9.5 17.4 7 19.2h11.4A4.5 4.5 0 0 0 19.4 10.8z" />
    <path fill="#28a8ea" d="M2.3 17a5.5 5.5 0 0 0 4.6 2.2h11.5a4.5 4.5 0 0 0 4-2.4l-12.9-7.5z" />
  </S>
);

export const ICloudIcon = (p: P) => (
  <S {...p}>
    <defs>
      <linearGradient id="icl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5ac8fa" /><stop offset="1" stopColor="#1e88e5" />
      </linearGradient>
    </defs>
    <rect width="24" height="24" rx="6" fill="url(#icl)" />
    <path fill="#fff" d="M7.2 17.5a3.4 3.4 0 0 1-.4-6.8 4.6 4.6 0 0 1 8.8-1.4 3.2 3.2 0 0 1 4.3 3.3 2.5 2.5 0 0 1-.6 4.9z" />
  </S>
);

export const MailIcon = (p: P) => (
  <S {...p}>
    <path fill="#4285f4" d="M2 6.5v12c0 .8.7 1.5 1.5 1.5H6V10.5z" />
    <path fill="#34a853" d="M18 20h2.5c.8 0 1.5-.7 1.5-1.5v-12l-4 4z" />
    <path fill="#fbbc04" d="M18 5v5.5l4-4V5.8c0-1.6-1.8-2.5-3.1-1.6z" />
    <path fill="#ea4335" d="M6 10.5V5l6 4.5L18 5v5.5l-6 4.5z" />
    <path fill="#c5221f" d="M2 5.8v.7l4 4V5L5.1 4.2C3.8 3.3 2 4.2 2 5.8z" />
  </S>
);

export const WhatsAppIcon = (p: P) => (
  <S {...p}>
    <path fill="#25d366" d="M12 1.5a10.5 10.5 0 0 0-9 15.9L1.5 22.5l5.3-1.4A10.5 10.5 0 1 0 12 1.5z" />
    <path fill="#fff" d="M17.3 14.6c-.3-.1-1.7-.8-2-.9s-.5-.1-.7.1-.8.9-.9 1.1-.4.2-.6.1a7.8 7.8 0 0 1-3.9-3.4c-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.4 13.4 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.1-.3-.2-.6-.3z" />
  </S>
);

export const AirDropIcon = (p: P) => (
  <S {...p}>
    <g fill="none" strokeLinecap="round" strokeWidth="2">
      <path stroke="#0a84ff" d="M5.6 19.4a9 9 0 1 1 12.8 0" />
      <path stroke="#3aa0ff" d="M8.5 16.5a5 5 0 1 1 7 0" />
    </g>
    <path fill="#5ac8fa" d="M12 12.5 15 21H9z" />
  </S>
);

export const LocalSendIcon = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="11" fill="#14b8a6" />
    <circle cx="12" cy="12" r="7" fill="none" stroke="#fff" strokeWidth="1.6" strokeDasharray="3 2.4" />
    <circle cx="12" cy="12" r="3" fill="#fff" />
  </S>
);

const AdobeTile = ({ bg, fg, text, ...p }: P & { bg: string; fg: string; text: string }) => (
  <S {...p}>
    <rect width="24" height="24" rx="5" fill={bg} />
    <text x="12" y="16.2" textAnchor="middle" fontSize={text.length > 2 ? 8.5 : 11} fontWeight="700" fontFamily="Helvetica, Arial, sans-serif" fill={fg}>{text}</text>
  </S>
);
export const PhotoshopIcon = (p: P) => <AdobeTile {...p} bg="#001e36" fg="#31a8ff" text="Ps" />;
export const LightroomIcon = (p: P) => <AdobeTile {...p} bg="#001e36" fg="#31a8ff" text="Lr" />;
export const LightroomClassicIcon = (p: P) => <AdobeTile {...p} bg="#001e36" fg="#31a8ff" text="Lrc" />;

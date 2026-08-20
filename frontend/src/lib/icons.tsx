import React from "react";

type IconProps = React.SVGProps<SVGSVGElement>;

const base = (children: React.ReactNode) => (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    width={16}
    height={16}
    {...props}
  >
    {children}
  </svg>
);

export const IconDashboard = base(<><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>);
export const IconCalendar = base(<><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>);
export const IconTimer = base(<><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></>);
export const IconBook = base(<><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></>);
export const IconChart = base(<><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M7 16v-3M12 16V8M17 16v-6" /></>);
export const IconActivity = base(<><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>);
export const IconHistory = base(<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5M12 7v5l4 2" /></>);
export const IconSend = base(<><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>);
export const IconCloud = base(<><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></>);
export const IconSettings = base(<><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>);
export const IconLock = base(<><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>);
export const IconMusic = base(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>);
export const IconCamera = base(<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></>);
export const IconZap = base(<><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /></>);
export const IconAlert = base(<><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>);
export const IconSun = base(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>);
export const IconMoon = base(<><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></>);
export const IconLogout = base(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>);
export const IconCheck = base(<><path d="M20 6 9 17l-5-5" /></>);
export const IconX = base(<><path d="M18 6 6 18M6 6l12 12" /></>);
export const IconPlay = base(<><polygon points="6 3 20 12 6 21 6 3" /></>);
export const IconPause = base(<><rect width="4" height="16" x="6" y="4" /><rect width="4" height="16" x="14" y="4" /></>);
export const IconRefresh = base(<><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>);
export const IconGithub = base(<><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></>);
export const IconTarget = base(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>);
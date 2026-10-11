"use client";

import {
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

type MobileNavProps = {
  active: "dashboard" | "children" | "attendance" | "members" | "agenda";
  canManageMembers?: boolean;
  isAdmin?: boolean;
};

const baseItems = [
  { id: "dashboard", href: "/", label: "Beranda", icon: LayoutDashboard },
  { id: "children", href: "/anak", label: "Anak", icon: UsersRound },
  { id: "attendance", href: "/absensi", label: "Absensi", icon: ClipboardCheck },
] as const;

export function MobileNav({
  active,
  canManageMembers = false,
  isAdmin = false,
}: MobileNavProps) {
  const items = [
    ...baseItems,
    ...(canManageMembers
      ? [{ id: "members" as const, href: "/anggota", label: "Anggota", icon: UserRound }]
      : []),
    ...(isAdmin
      ? [{ id: "agenda" as const, href: "/admin", label: "Agenda", icon: CalendarDays }]
      : []),
  ];

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e5ebe5] bg-white/95 px-2 pt-2 shadow-[0_-8px_30px_-24px_#233c2c66] backdrop-blur-lg pb-[max(env(safe-area-inset-bottom),0.5rem)] lg:hidden"
    >
      <div className="mx-auto flex max-w-xl items-stretch justify-around gap-1">
        {items.map(({ id, href, label, icon: Icon }) => {
          const selected = active === id;
          return (
            <Link
              key={id}
              href={href}
              aria-current={selected ? "page" : undefined}
              className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-semibold transition ${
                selected
                  ? "bg-[#edf3ed] text-[#31553e]"
                  : "text-[#879187] active:bg-[#f4f6f2]"
              }`}
            >
              <Icon size={19} strokeWidth={selected ? 2.2 : 1.8} />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

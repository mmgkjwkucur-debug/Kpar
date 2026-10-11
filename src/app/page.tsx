"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ClipboardCheck,
  CalendarDays,
  Check,
  ChevronRight,
  Church,
  Clock3,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Plus,
  ShieldCheck,
  UsersRound,
  UserPlus,
  X,
} from "lucide-react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { signInWithUsername } from "@/lib/username-login";

type Access = "checking" | "unconfigured" | "signed-out" | "internal" | "forbidden";

type EventItem = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  location: string;
  category: string;
  published: boolean;
};

function formatDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("id-ID", options).format(date);
}

function getInitials(name: string) {
  return name
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function Home() {
  const [access, setAccess] = useState<Access>(
    auth && db ? "checking" : "unconfigured",
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCoordinator, setIsCoordinator] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [agendaStatus, setAgendaStatus] = useState<
    "loading" | "ready" | "error"
  >(db ? "loading" : "error");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!auth) return;

    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        setAccess("signed-out");
        setUserEmail("");
        setDisplayName("");
        setIsAdmin(false);
        setEvents([]);
        setAgendaStatus("error");
        return;
      }

      setUserEmail(user.email ?? "");
      void user
        .getIdTokenResult()
        .then((token) => {
          const hasAdminAccess = token.claims.admin === true;
          const hasCoordinatorAccess = token.claims.coordinator === true;
          const hasInternalAccess =
            token.claims.internal === true || hasAdminAccess;
          const claimName =
            typeof token.claims.username === "string"
              ? token.claims.username
              : user.displayName ?? user.email?.split("@")[0] ?? "Pengguna";

          setDisplayName(claimName);
          setIsAdmin(hasAdminAccess);
          setIsCoordinator(hasCoordinatorAccess);
          setAgendaStatus(hasInternalAccess ? "loading" : "error");
          setAccess(hasInternalAccess ? "internal" : "forbidden");
        })
        .catch((error: unknown) => {
          console.error("Gagal memverifikasi akses pengguna:", error);
          setAgendaStatus("error");
          setAccess("forbidden");
        });
    });
  }, []);

  useEffect(() => {
    const firestore = db;
    if (!firestore || access !== "internal") return;

    let active = true;
    const loadEvents = async () => {
      try {
        const snapshot = await getDocs(collection(firestore, "events"));
        const loadedEvents = snapshot.docs.map((eventDocument) => {
          const data = eventDocument.data();
          if (
            typeof data.title !== "string" ||
            typeof data.description !== "string" ||
            typeof data.location !== "string" ||
            typeof data.category !== "string" ||
            typeof data.published !== "boolean" ||
            !(data.startsAt instanceof Timestamp)
          ) {
            throw new Error(
              `Dokumen agenda "${eventDocument.id}" memiliki format yang tidak valid.`,
            );
          }

          return {
            id: eventDocument.id,
            title: data.title,
            description: data.description,
            startsAt: data.startsAt.toDate().toISOString(),
            location: data.location,
            category: data.category,
            published: data.published,
          };
        });
        loadedEvents.sort(
          (first, second) =>
            new Date(first.startsAt).getTime() -
            new Date(second.startsAt).getTime(),
        );

        if (active) {
          setEvents(loadedEvents);
          setAgendaStatus("ready");
        }
      } catch (error) {
        console.error("Gagal memuat dashboard KPAR:", error);
        if (active) {
          setEvents([]);
          setAgendaStatus("error");
        }
      }
    };

    void loadEvents();
    return () => {
      active = false;
    };
  }, [access]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setLoginBusy(true);

    try {
      await signInWithUsername(username, password);
      setPassword("");
    } catch (error) {
      console.error("Login pengguna internal gagal:", error);
      setLoginError("Login gagal. Periksa username dan kata sandi.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    if (!auth) return;
    try {
      await signOut(auth);
      setMenuOpen(false);
    } catch (error) {
      console.error("Gagal keluar dari akun:", error);
      setLoginError("Tidak dapat keluar dari akun. Coba lagi.");
    }
  }

  if (access !== "internal") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7f5] px-5 py-10 text-[#26392f]">
        <section className="w-full max-w-md rounded-[2rem] border border-[#e5eae5] bg-white p-7 shadow-[0_24px_80px_-48px_#243e3155] sm:p-9">
          <Link href="/" className="mb-8 inline-flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-[#294d3c] text-white">
              <Church size={22} />
            </span>
            <span>
              <span className="block text-xs font-bold tracking-[0.14em]">KPAR GKJW</span>
              <span className="mt-1 block text-[10px] text-[#7a8579]">Aplikasi internal</span>
            </span>
          </Link>

          {access === "checking" && (
            <p className="text-sm text-[#788178]">Memeriksa sesi masuk…</p>
          )}
          {access === "unconfigured" && (
            <>
              <h1 className="text-xl font-semibold text-[#334a3b]">Aplikasi belum dikonfigurasi</h1>
              <p className="mt-3 text-sm leading-6 text-[#788178]">
                Hubungi pengelola untuk menyiapkan Firebase dan akun internal.
              </p>
            </>
          )}
          {access === "signed-out" && (
            <form onSubmit={handleLogin}>
              <h1 className="font-serif text-2xl text-[#2d4939]">Masuk ke ruang KPAR</h1>
              <p className="mt-2 text-sm leading-6 text-[#788178]">
                Gunakan akun internal yang sudah didaftarkan oleh pengelola.
              </p>
              {loginError && (
                <p className="mt-4 rounded-xl border border-[#f0d5ca] bg-[#fff5f0] px-3 py-2.5 text-xs text-[#87523e]" role="alert">
                  {loginError}
                </p>
              )}
              <label className="mt-6 block text-xs font-semibold text-[#536253]">
                Username
                <input
                  required
                  type="text"
                  autoCapitalize="none"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#e5e5dc] bg-[#fcfbf8] px-4 py-3 text-sm outline-none focus:border-[#91a486]"
                />
              </label>
              <label className="mt-4 block text-xs font-semibold text-[#536253]">
                Kata sandi
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#e5e5dc] bg-[#fcfbf8] px-4 py-3 text-sm outline-none focus:border-[#91a486]"
                />
              </label>
              <button
                disabled={loginBusy}
                type="submit"
                className="mt-6 w-full rounded-full bg-[#294d3c] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#203e30] disabled:cursor-wait disabled:opacity-60"
              >
                {loginBusy ? "Memproses…" : "Masuk"}
              </button>
              <p className="mt-4 text-center text-[11px] leading-5 text-[#92968c]">
                Akun hanya dibuat oleh pengelola. Pendaftaran publik tidak tersedia.
              </p>
            </form>
          )}
          {access === "forbidden" && (
            <>
              <h1 className="text-xl font-semibold text-[#334a3b]">Akun belum memiliki akses.</h1>
              <p className="mt-3 text-sm leading-6 text-[#788178]">
                Hubungi pengelola KPAR untuk memeriksa akun internalmu.
              </p>
              {loginError && <p className="mt-4 text-xs text-[#87523e]" role="alert">{loginError}</p>}
              <button onClick={() => void handleLogout()} className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#e2e3da] px-4 py-2.5 text-xs font-semibold text-[#526457]">
                <LogOut size={14} /> Keluar
              </button>
            </>
          )}
        </section>
      </main>
    );
  }

  const now = new Date();
  const upcomingEvents = events.filter(
    (event) => new Date(event.startsAt).getTime() >= now.getTime(),
  );
  const thisMonthEvents = upcomingEvents.filter((event) => {
    const date = new Date(event.startsAt);
    return (
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  });
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  const thisWeekEvents = upcomingEvents.filter(
    (event) => new Date(event.startsAt).getTime() < weekEnd.getTime(),
  );
  const draftCount = events.filter((event) => !event.published).length;

  return (
    <main className="min-h-screen bg-[#f5f7f5] text-[#26392f]">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-[250px] shrink-0 flex-col border-r border-[#e7ebe6] bg-white px-5 py-7 lg:flex">
          <Link href="/" className="mb-10 flex items-center gap-3 px-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#294d3c] text-white">
              <Church size={21} />
            </span>
            <span>
              <span className="block text-xs font-bold tracking-[0.15em]">KPAR GKJW</span>
              <span className="mt-1 block text-[10px] text-[#99a39a]">Ruang pelayanan</span>
            </span>
          </Link>

          <p className="mb-3 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-[#a4ada5]">
            Menu utama
          </p>
          <nav className="space-y-1">
            <Link href="/" className="flex items-center gap-3 rounded-xl bg-[#edf3ed] px-3 py-3 text-xs font-semibold text-[#31553e]">
              <LayoutDashboard size={17} /> Dashboard
            </Link>
            <Link href="/anak" className="flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-medium text-[#737f75] transition hover:bg-[#f5f7f5] hover:text-[#31553e]">
              <UsersRound size={17} /> Database anak
              <ChevronRight className="ml-auto" size={14} />
            </Link>
            <Link href="/absensi" className="flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-medium text-[#737f75] transition hover:bg-[#f5f7f5] hover:text-[#31553e]">
              <ClipboardCheck size={17} /> Absensi
              <ChevronRight className="ml-auto" size={14} />
            </Link>
            {(isAdmin || isCoordinator) && (
              <Link href="/anggota" className="flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-medium text-[#737f75] transition hover:bg-[#f5f7f5] hover:text-[#31553e]">
                <UserPlus size={17} /> Anggota & peran
                <ChevronRight className="ml-auto" size={14} />
              </Link>
            )}
            {isAdmin ? (
              <Link href="/admin" className="flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-medium text-[#737f75] transition hover:bg-[#f5f7f5] hover:text-[#31553e]">
                <CalendarDays size={17} /> Kelola agenda
                <ChevronRight className="ml-auto" size={14} />
              </Link>
            ) : (
              <a href="#agenda-terdekat" className="flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-medium text-[#737f75] transition hover:bg-[#f5f7f5] hover:text-[#31553e]">
                <CalendarDays size={17} /> Agenda terdekat
              </a>
            )}
          </nav>

          <div className="mt-auto rounded-2xl bg-[#f4f7f1] p-4">
            <span className="flex size-9 items-center justify-center rounded-xl bg-white text-[#66805e]">
              <ShieldCheck size={18} />
            </span>
            <p className="mt-3 text-xs font-semibold text-[#415743]">Akses internal</p>
            <p className="mt-1 text-[10px] leading-4 text-[#859084]">
              {isAdmin ? "Admin dapat mengelola data agenda." : "Anda dapat melihat agenda pelayanan."}
            </p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-[#e7ebe6] bg-white/90 px-5 py-4 backdrop-blur sm:px-8 lg:px-10">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Link href="/" className="flex size-9 items-center justify-center rounded-xl bg-[#294d3c] text-white lg:hidden">
                  <Church size={19} />
                </Link>
                <div>
                  <p className="text-[10px] font-medium text-[#879188]">
                    {formatDate(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-[#405044]">Dashboard KPAR</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <Link href="/admin" className="hidden items-center gap-2 rounded-xl bg-[#294d3c] px-4 py-2.5 text-[11px] font-semibold text-white transition hover:bg-[#203e30] sm:inline-flex">
                    <Plus size={15} /> Buat agenda
                  </Link>
                )}
                <div className="hidden text-right sm:block">
                  <p className="max-w-40 truncate text-[11px] font-semibold text-[#435348]">{displayName}</p>
                  <p className="text-[9px] text-[#99a39a]">{isAdmin ? "Administrator" : isCoordinator ? "Koordinator" : "Pelayan internal"}</p>
                </div>
                <span className="flex size-9 items-center justify-center rounded-full bg-[#e5eee5] text-[11px] font-bold text-[#476347]">
                  {getInitials(displayName || userEmail)}
                </span>
                <button
                  onClick={() => void handleLogout()}
                  aria-label="Keluar"
                  title="Keluar"
                  className="flex size-9 items-center justify-center rounded-xl text-[#7d887e] transition hover:bg-[#f5f7f5] hover:text-[#9a574d]"
                >
                  <LogOut size={17} />
                </button>
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-xl border border-[#e7ebe6] text-[#637167] lg:hidden"
                  aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  {menuOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
              </div>
            </div>
            {menuOpen && (
              <nav className="mt-4 grid gap-1 border-t border-[#edf0eb] pt-3 lg:hidden">
                <Link href="/" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl bg-[#edf3ed] px-3 py-3 text-xs font-semibold text-[#31553e]">
                  <LayoutDashboard size={16} /> Dashboard
                </Link>
                <Link href="/anak" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-medium text-[#737f75] hover:bg-[#f5f7f5]">
                  <UsersRound size={16} /> Database anak
                </Link>
                <Link href="/absensi" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-medium text-[#737f75] hover:bg-[#f5f7f5]">
                  <ClipboardCheck size={16} /> Absensi
                </Link>
                {(isAdmin || isCoordinator) && (
                  <Link href="/anggota" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-medium text-[#737f75] hover:bg-[#f5f7f5]">
                    <UserPlus size={16} /> Anggota & peran
                  </Link>
                )}
                {isAdmin ? (
                  <Link href="/admin" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-medium text-[#737f75] hover:bg-[#f5f7f5]">
                    <CalendarDays size={16} /> Kelola agenda
                  </Link>
                ) : (
                  <a href="#agenda-terdekat" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-xs font-medium text-[#737f75] hover:bg-[#f5f7f5]">
                    <CalendarDays size={16} /> Agenda terdekat
                  </a>
                )}
                {isAdmin && (
                  <Link href="/admin" onClick={() => setMenuOpen(false)} className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#294d3c] px-4 py-3 text-xs font-semibold text-white">
                    <Plus size={15} /> Buat agenda
                  </Link>
                )}
              </nav>
            )}
          </header>

          <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
            <section className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8a9b7d]">Ringkasan pelayanan</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#2f4737] sm:text-[30px]">
                  Sugeng rawuh, {displayName}
                </h1>
                <p className="mt-2 text-sm text-[#7f8a80]">
                  Ini ringkasan agenda dan kegiatan KPAR yang akan datang.
                </p>
              </div>
              {isAdmin && (
                <Link href="/admin" className="inline-flex items-center gap-2 rounded-xl bg-[#294d3c] px-4 py-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#203e30] sm:hidden">
                  <Plus size={15} /> Buat agenda
                </Link>
              )}
            </section>

            {agendaStatus === "error" && (
              <p className="mt-6 rounded-xl border border-[#f0d5ca] bg-[#fff5f0] px-4 py-3 text-xs leading-5 text-[#87523e]" role="alert">
                Agenda tidak dapat dimuat. Periksa koneksi atau hubungi administrator.
              </p>
            )}

            <section aria-label="Statistik agenda" className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={CalendarDays}
                label="Agenda mendatang"
                value={agendaStatus === "ready" ? String(upcomingEvents.length) : "—"}
                note="Semua jadwal berikutnya"
                tint="green"
              />
              <StatCard
                icon={Activity}
                label="Dalam 7 hari"
                value={agendaStatus === "ready" ? String(thisWeekEvents.length) : "—"}
                note="Agenda pekan ini"
                tint="blue"
              />
              <StatCard
                icon={Clock3}
                label="Bulan ini"
                value={agendaStatus === "ready" ? String(thisMonthEvents.length) : "—"}
                note={formatDate(now, { month: "long", year: "numeric" })}
                tint="gold"
              />
              <StatCard
                icon={FileText}
                label={isAdmin ? "Agenda draf" : "Peran Anda"}
                value={isAdmin ? (agendaStatus === "ready" ? String(draftCount) : "—") : "Internal"}
                note={isAdmin ? "Belum dipublikasikan" : "Akses melihat agenda"}
                tint="rose"
              />
            </section>

            <section id="agenda-terdekat" className="mt-8 grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
              <div className="overflow-hidden rounded-2xl border border-[#e6ebe5] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0eb] px-5 py-4 sm:px-6">
                  <div>
                    <h2 className="text-sm font-semibold text-[#3b4d3f]">Agenda terdekat</h2>
                    <p className="mt-1 text-[10px] text-[#929b92]">Jadwal kegiatan mendatang</p>
                  </div>
                  {isAdmin && (
                    <Link href="/admin" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#55704f] hover:text-[#294d3c]">
                      Kelola agenda <ArrowRight size={13} />
                    </Link>
                  )}
                </div>

                {agendaStatus === "loading" && (
                  <div className="space-y-3 p-5 sm:p-6">
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="h-[76px] animate-pulse rounded-xl bg-[#f4f6f2]" />
                    ))}
                  </div>
                )}
                {agendaStatus === "ready" && upcomingEvents.length > 0 && (
                  <div className="divide-y divide-[#f0f2ee]">
                    {upcomingEvents.slice(0, 5).map((event) => (
                      <EventRow key={event.id} event={event} />
                    ))}
                  </div>
                )}
                {agendaStatus === "ready" && upcomingEvents.length === 0 && (
                  <div className="px-6 py-12 text-center">
                    <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-[#f1f5ed] text-[#71876a]">
                      <CalendarDays size={20} />
                    </span>
                    <p className="mt-3 text-xs font-semibold text-[#4e5e50]">Belum ada agenda mendatang</p>
                    <p className="mt-1 text-[10px] text-[#929b92]">
                      {isAdmin ? "Tambahkan jadwal kegiatan pertama." : "Agenda baru akan tampil di sini."}
                    </p>
                    {isAdmin && (
                      <Link href="/admin" className="mt-4 inline-flex items-center gap-1 text-[10px] font-semibold text-[#55704f]">
                        Buat agenda <ArrowRight size={13} />
                      </Link>
                    )}
                  </div>
                )}
                {agendaStatus === "error" && (
                  <div className="px-6 py-10 text-center text-xs text-[#879187]">
                    Data agenda belum tersedia.
                  </div>
                )}
                {agendaStatus === "ready" && upcomingEvents.length > 5 && (
                  <div className="border-t border-[#edf0eb] px-5 py-3 text-center">
                    <span className="text-[10px] text-[#89948a]">
                      +{upcomingEvents.length - 5} agenda lainnya
                    </span>
                  </div>
                )}
              </div>

              <aside className="space-y-5">
                <div className="rounded-2xl border border-[#e6ebe5] bg-white p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-[#edf3ed] text-[#547351]">
                      <UsersRound size={18} />
                    </span>
                    <div>
                      <h2 className="text-xs font-semibold text-[#3b4d3f]">Akses akun</h2>
                      <p className="mt-1 text-[10px] text-[#929b92]">Status pengguna saat ini</p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-[#edf0eb] pt-4">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[#465649]">{displayName}</p>
                      <p className="mt-1 truncate text-[10px] text-[#929b92]">{userEmail}</p>
                    </div>
                    <span className="ml-3 inline-flex shrink-0 items-center gap-1 rounded-full bg-[#eef5e9] px-2.5 py-1.5 text-[9px] font-semibold text-[#59764f]">
                    <Check size={11} /> {isAdmin ? "Admin" : isCoordinator ? "Koordinator" : "Internal"}
                    </span>
                  </div>
                  {isAdmin && (
                    <Link href="/admin" className="mt-4 flex items-center justify-between rounded-xl bg-[#f7f8f5] px-3 py-3 text-[10px] font-medium text-[#667568] transition hover:bg-[#eff3eb]">
                      Kelola agenda dan publikasi <ChevronRight size={14} />
                    </Link>
                  )}
                </div>

                <div className="rounded-2xl bg-[#294d3c] p-5 text-white sm:p-6">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-[#d9e7d3]">
                    <Church size={18} />
                  </span>
                  <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.17em] text-[#c7d6c4]">
                    KPAR GKJW
                  </p>
                  <h2 className="mt-2 text-base font-semibold">Melayani bersama, bertumbuh bersama.</h2>
                  <p className="mt-2 text-[11px] leading-5 text-white/65">
                    Ruang kerja internal untuk mendukung pelayanan anak dan remaja.
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-[9px] text-white/65">
                    <ShieldCheck size={12} /> Data hanya untuk pengguna berwenang
                  </div>
                </div>
              </aside>
            </section>

            <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-[#e6ebe5] pt-4 text-[9px] text-[#9aa39a]">
              <span>KPAR GKJW · Dashboard internal</span>
              <span className="inline-flex items-center gap-1">
                Ringkasan diperbarui saat halaman dibuka <ArrowDownRight size={11} />
              </span>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  note,
  tint,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  note: string;
  tint: "green" | "blue" | "gold" | "rose";
}) {
  const colors = {
    green: "bg-[#edf3ed] text-[#547351]",
    blue: "bg-[#edf2f6] text-[#61788e]",
    gold: "bg-[#f7f1e6] text-[#a07b43]",
    rose: "bg-[#f6efed] text-[#a3776e]",
  };

  return (
    <article className="rounded-2xl border border-[#e6ebe5] bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex size-9 items-center justify-center rounded-xl ${colors[tint]}`}>
          <Icon size={17} />
        </span>
        <ArrowDownRight size={15} className="text-[#c0c8c0]" />
      </div>
      <p className="mt-4 text-[10px] font-medium text-[#879187]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-[#35483a]">{value}</p>
      <p className="mt-1 text-[9px] text-[#a0a8a0]">{note}</p>
    </article>
  );
}

function EventRow({ event }: { event: EventItem }) {
  const date = new Date(event.startsAt);
  const isToday = date.toDateString() === new Date().toDateString();

  return (
    <article className="flex items-start gap-3 px-5 py-4 transition hover:bg-[#fbfcfa] sm:px-6">
      <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-[#f3f6f1] px-2 py-2 text-center">
        <span className="text-[16px] font-semibold leading-5 text-[#405a43]">
          {formatDate(date, { day: "2-digit" })}
        </span>
        <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-[#859182]">
          {formatDate(date, { month: "short" })}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs font-semibold text-[#3e5042]">{event.title}</h3>
          {!event.published && (
            <span className="rounded-full bg-[#f7f1e6] px-2 py-0.5 text-[8px] font-semibold text-[#9a7641]">
              Draf
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-1 text-[10px] text-[#879187]">{event.description}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-[#929b92]">
          <span className="inline-flex items-center gap-1">
            <Clock3 size={11} />
            {isToday ? "Hari ini" : formatDate(date, { weekday: "short" })},{" "}
            {formatDate(date, { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin size={11} /> {event.location}
          </span>
          <span>{event.category}</span>
        </div>
      </div>
    </article>
  );
}

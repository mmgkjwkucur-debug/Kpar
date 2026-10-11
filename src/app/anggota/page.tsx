"use client";

import {
  ArrowLeft,
  LoaderCircle,
  Plus,
  ShieldAlert,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { MobileHeader } from "@/components/mobile-header";
import { MobileNav } from "@/components/mobile-nav";

const classes = ["Balita", "Pratama", "Madya", "Remaja"] as const;
type Role = "anggota" | "wali_kelas" | "coordinator" | "admin";
type Access = "checking" | "unconfigured" | "signed-out" | "manager" | "forbidden";
type Member = {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  roles: Role[];
  status: string;
  className?: string;
};
type FormValues = {
  displayName: string;
  email: string;
  username: string;
  password: string;
  role: Role;
  className: string;
};

const blankForm: FormValues = {
  displayName: "",
  email: "",
  username: "",
  password: "",
  role: "anggota",
  className: "",
};

export default function MembersPage() {
  const [access, setAccess] = useState<Access>(
    auth && db ? "checking" : "unconfigured",
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [occupiedClasses, setOccupiedClasses] = useState<string[]>([]);
  const [form, setForm] = useState(blankForm);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadMembers() {
    if (!db) return;
    setLoading(true);
    try {
      const [usersSnapshot, assignmentsSnapshot] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "classAssignments")),
      ]);
      const loaded = usersSnapshot.docs.map((userDocument) => {
        const data = userDocument.data();
        if (
          typeof data.email !== "string" ||
          typeof data.username !== "string" ||
          typeof data.displayName !== "string" ||
          !Array.isArray(data.roles) ||
          typeof data.status !== "string"
        ) {
          throw new Error(`Profil anggota "${userDocument.id}" memiliki format yang tidak valid.`);
        }
        return {
          uid: userDocument.id,
          email: data.email,
          username: data.username,
          displayName: data.displayName,
          roles: data.roles.filter((role): role is Role =>
            ["anggota", "wali_kelas", "coordinator", "admin"].includes(role),
          ),
          status: data.status,
          ...(typeof data.className === "string" ? { className: data.className } : {}),
        };
      });
      loaded.sort((a, b) => a.displayName.localeCompare(b.displayName, "id"));
      setMembers(loaded);
      setOccupiedClasses(assignmentsSnapshot.docs.map((item) => item.id));
    } catch (loadError) {
      console.error("Gagal memuat daftar anggota KPAR:", loadError);
      setError("Daftar anggota tidak dapat dimuat. Periksa Firestore Rules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        setAccess("signed-out");
        return;
      }
      void user.getIdTokenResult().then(async (token) => {
        const admin = token.claims.admin === true;
        const manager = admin || token.claims.coordinator === true;
        setIsAdmin(admin);
        setAccess(manager ? "manager" : "forbidden");
        if (manager) await loadMembers();
      }).catch((authError: unknown) => {
        console.error("Gagal memeriksa hak pengelola anggota:", authError);
        setAccess("forbidden");
      });
    });
  }, []);

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth?.currentUser) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch("/api/admin/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        cache: "no-store",
        body: JSON.stringify({
          ...form,
          username: form.username.trim().toLowerCase(),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Akun tidak dapat dibuat.";
        throw new Error(message);
      }
      await loadMembers();
      setForm(blankForm);
      setShowForm(false);
      setNotice(
        `Akun ${form.username.trim().toLowerCase()} berhasil dibuat. Sampaikan sandi awal secara aman kepada anggota.`,
      );
    } catch (createError) {
      console.error("Gagal membuat akun anggota:", createError);
      setError(
        createError instanceof Error
          ? createError.message
          : "Akun tidak dapat dibuat. Periksa koneksi dan izin Admin SDK.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (access !== "manager") {
    const message = access === "checking"
      ? "Memeriksa akses…"
      : access === "unconfigured"
        ? "Firebase belum dikonfigurasi."
        : access === "signed-out"
          ? "Silakan masuk untuk melanjutkan."
          : "Menu anggota hanya untuk admin atau koordinator.";
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7f5] p-6">
        <div className="max-w-md rounded-2xl border border-[#e6ebe5] bg-white p-7 text-center">
          <ShieldAlert className="mx-auto text-[#8b9a80]" size={25} />
          <h1 className="mt-4 font-semibold text-[#35483a]">{message}</h1>
          <Link href="/" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[#55704f]"><ArrowLeft size={14} /> Dashboard</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f7f5] px-4 pb-24 pt-5 text-[#26392f] sm:px-8 sm:py-9 sm:pb-24 lg:pb-9">
      <MobileHeader title="Anggota & peran" />
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold text-[#7c897e] hover:text-[#31553e]">
              <ArrowLeft size={14} /> Dashboard
            </Link>
            <h1 className="text-2xl font-semibold text-[#2f4737] sm:text-3xl">Anggota & peran</h1>
            <p className="mt-2 text-sm text-[#7f8a80]">Kelola akun internal dan penugasan wali kelas.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[#e6ebe5] bg-white px-4 py-3 text-xs text-[#667568]">
            <UsersRound size={15} /> {members.length} akun
          </div>
        </header>

        <div className="mb-5 rounded-2xl border border-[#e5ebe2] bg-[#eef4eb] px-4 py-3 text-xs leading-5 text-[#586c55]">
          <span className="font-semibold">Peran:</span> Admin mengelola seluruh data dan dapat menunjuk koordinator. Koordinator dapat membuat akun anggota dan wali kelas. Setiap kelas hanya dapat memiliki satu wali kelas aktif.
        </div>
        {error && <p className="mb-4 rounded-xl border border-[#f0d5ca] bg-[#fff5f0] px-4 py-3 text-xs text-[#87523e]" role="alert">{error}</p>}
        {notice && <p className="mb-4 rounded-xl border border-[#dbe7d4] bg-[#f1f6ec] px-4 py-3 text-xs text-[#496346]" role="status">{notice}</p>}

        <section className="overflow-hidden rounded-2xl border border-[#e6ebe5] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0eb] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-[#3b4d3f]">Daftar akun</h2>
              <p className="mt-1 text-[10px] text-[#929b92]">Akun dibuat oleh pengelola; tidak ada pendaftaran mandiri.</p>
            </div>
            <button onClick={() => { setShowForm(!showForm); setError(""); }} className="inline-flex items-center gap-2 rounded-xl bg-[#294d3c] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#203e30]">
              {showForm ? <X size={15} /> : <UserPlus size={15} />}
              {showForm ? "Tutup" : "Tambah anggota"}
            </button>
          </div>

          {showForm && (
            <form onSubmit={createMember} className="border-b border-[#edf0eb] bg-[#fbfcfa] p-5">
              <h3 className="mb-4 text-xs font-semibold text-[#405344]">Buat akun internal</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Nama lengkap">
                  <input required minLength={2} maxLength={120} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Email akun">
                  <input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Username (3–32 karakter)">
                  <input required minLength={3} maxLength={32} pattern="[A-Za-z0-9._-]+" autoCapitalize="none" autoComplete="off" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Sandi awal (minimal 12 karakter)">
                  <input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className={inputClass} />
                </Field>
                <Field label="Peran">
                  <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role, className: event.target.value === "wali_kelas" ? form.className || classes.find((item) => !occupiedClasses.includes(item)) || "" : "" })} className={inputClass}>
                    <option value="anggota">Anggota</option>
                    <option value="wali_kelas">Wali kelas</option>
                    {isAdmin && <option value="coordinator">Koordinator</option>}
                    {isAdmin && <option value="admin">Admin</option>}
                  </select>
                </Field>
                {form.role === "wali_kelas" && (
                  <Field label="Kelas wali">
                    <select required value={form.className} onChange={(event) => setForm({ ...form, className: event.target.value })} className={inputClass}>
                      <option value="">Pilih kelas…</option>
                      {classes.map((item) => <option key={item} value={item} disabled={occupiedClasses.includes(item)}>{item}{occupiedClasses.includes(item) ? " · sudah ada wali" : ""}</option>)}
                    </select>
                  </Field>
                )}
              </div>
              <p className="mt-3 text-[10px] leading-5 text-[#929b92]">
                Sandi awal hanya diteruskan ke Firebase Authentication, tidak disimpan di profil. Sampaikan kepada anggota melalui kanal yang aman.
              </p>
              <button disabled={busy} type="submit" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#294d3c] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60">
                {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}
                {busy ? "Membuat akun…" : "Buat akun"}
              </button>
            </form>
          )}

          {loading ? (
            <div className="p-12 text-center"><LoaderCircle className="mx-auto animate-spin text-[#76906e]" /></div>
          ) : members.length ? (
            <div className="divide-y divide-[#f0f2ee]">
              {members.map((member) => (
                <article key={member.uid} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="flex size-10 items-center justify-center rounded-full bg-[#edf3ed] text-[11px] font-bold text-[#547351]">
                    {member.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[#3b4d3f]">{member.displayName}</p>
                    <p className="mt-1 truncate text-[10px] text-[#929b92]">@{member.username} · {member.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {member.roles.map((role) => (
                      <span key={role} className="rounded-full bg-[#f1f4ef] px-2.5 py-1 text-[9px] font-semibold text-[#647565]">
                        {role === "wali_kelas" ? `Wali Kelas${member.className ? ` · ${member.className}` : ""}` : role === "coordinator" ? "Koordinator" : role === "admin" ? "Admin" : "Anggota"}
                      </span>
                    ))}
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${member.status === "active" ? "bg-[#eef5e9] text-[#59764f]" : "bg-[#f5efeb] text-[#967569]"}`}>
                      {member.status === "active" ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center text-xs text-[#929b92]">Belum ada profil anggota.</div>
          )}
        </section>
      </div>
      <MobileNav active="members" canManageMembers />
    </main>
  );
}

const inputClass = "mt-1.5 w-full rounded-xl border border-[#e3e8e1] bg-white px-3 py-2.5 text-xs font-normal text-[#415244] outline-none focus:border-[#9bab94]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-[10px] font-semibold text-[#667366]">{label}{children}</label>;
}

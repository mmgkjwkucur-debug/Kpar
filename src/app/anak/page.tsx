"use client";

import {
  ArrowLeft,
  CalendarDays,
  Download,
  LoaderCircle,
  Pencil,
  Plus,
  QrCode,
  Search,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import QRCode from "qrcode";
import { FormEvent, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { MobileHeader } from "@/components/mobile-header";
import { MobileNav } from "@/components/mobile-nav";

const childClasses = ["Balita", "Pratama", "Madya", "Remaja"] as const;
type ChildClass = (typeof childClasses)[number];
type Access = "checking" | "unconfigured" | "signed-out" | "internal" | "forbidden";

type Child = {
  id: string;
  name: string;
  className: ChildClass;
  attendanceCode: string;
  active: boolean;
};

const blankChild = {
  name: "",
  className: "Balita" as ChildClass,
};

function QrCard({ child, onClose }: { child: Child; onClose: () => void }) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(`KPAR1:${child.attendanceCode}`, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#203e30", light: "#ffffff" },
    }).then((dataUrl) => {
      if (active) setImage(dataUrl);
    }).catch((qrError: unknown) => {
      console.error("Gagal membuat QR absensi:", qrError);
      if (active) setError("QR belum dapat dibuat.");
    });
    return () => {
      active = false;
    };
  }, [child.attendanceCode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#16231d]/50 p-4" role="dialog" aria-modal="true" aria-label={`QR absensi ${child.name}`}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h2 className="text-base font-semibold text-[#334a3b]">QR absensi</h2>
            <p className="mt-1 text-xs text-[#829083]">{child.name} · {child.className}</p>
          </div>
          <button type="button" aria-label="Tutup QR" onClick={onClose} className="flex size-9 items-center justify-center rounded-xl text-[#718072] hover:bg-[#f3f5f1]">
            <X size={18} />
          </button>
        </div>
        {image ? (
          <Image src={image} alt={`QR absensi ${child.name}`} width={256} height={256} unoptimized className="mx-auto mt-5 size-64 rounded-xl border border-[#edf0eb] p-2" />
        ) : (
          <div className="mx-auto mt-5 flex size-64 items-center justify-center rounded-xl bg-[#f4f6f2]">
            {error ? <span className="text-xs text-[#a35a4c]">{error}</span> : <LoaderCircle className="animate-spin text-[#58735a]" />}
          </div>
        )}
        <p className="mt-4 text-xs font-semibold text-[#35493a]">{child.name}</p>
        <p className="mt-1 text-[10px] text-[#8c968c]">Simpan kartu ini untuk digunakan saat absensi.</p>
        <button
          type="button"
          disabled={!image}
          onClick={() => {
            const anchor = document.createElement("a");
            anchor.href = image;
            anchor.download = `kpar-qr-${child.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
            anchor.click();
          }}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#294d3c] px-4 py-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Download size={15} /> Unduh QR
        </button>
        <button type="button" onClick={() => window.print()} className="ml-2 mt-5 rounded-xl border border-[#e5e9e3] px-4 py-3 text-xs font-semibold text-[#657366]">
          Cetak
        </button>
      </div>
    </div>
  );
}

export default function ChildrenPage() {
  const [access, setAccess] = useState<Access>(auth && db ? "checking" : "unconfigured");
  const [isAdmin, setIsAdmin] = useState(false);
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("Semua kelas");
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [qrChild, setQrChild] = useState<Child | null>(null);
  const [form, setForm] = useState(blankChild);

  async function loadChildren() {
    if (!db) return;
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, "children"));
      const loaded = snapshot.docs.map((item) => {
        const data = item.data();
        if (
          typeof data.name !== "string" ||
          !childClasses.includes(data.className) ||
          typeof data.attendanceCode !== "string" ||
          typeof data.active !== "boolean"
        ) {
          throw new Error(`Data anak "${item.id}" memiliki format yang tidak valid.`);
        }
        return {
          id: item.id,
          name: data.name,
          className: data.className,
          attendanceCode: data.attendanceCode,
          active: data.active,
        };
      });
      loaded.sort((a, b) => a.name.localeCompare(b.name, "id"));
      setChildren(loaded);
    } catch (loadError) {
      console.error("Gagal memuat database anak:", loadError);
      setError("Data anak tidak dapat dimuat. Periksa Firestore Rules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        setAccess("signed-out");
        setChildren([]);
        return;
      }
      void user.getIdTokenResult().then(async (token) => {
        const admin = token.claims.admin === true;
        const internal = token.claims.internal === true || admin;
        setIsAdmin(admin);
        setCanManageMembers(admin || token.claims.coordinator === true);
        setAccess(internal ? "internal" : "forbidden");
        if (internal) await loadChildren();
      }).catch((authError: unknown) => {
        console.error("Gagal memverifikasi akses database anak:", authError);
        setAccess("forbidden");
      });
    });
  }, []);

  async function saveChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !isAdmin) return;
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const values = {
        name: form.name.trim(),
        className: form.className,
        active: true,
        updatedAt: serverTimestamp(),
      };
      if (editingId) {
        await updateDoc(doc(db, "children", editingId), values);
      } else {
        await addDoc(collection(db, "children"), {
          ...values,
          attendanceCode: crypto.randomUUID(),
          createdAt: serverTimestamp(),
        });
      }
      await loadChildren();
      setShowForm(false);
      setEditingId(null);
      setForm(blankChild);
      setNotice(editingId ? "Data anak berhasil diperbarui." : "Data anak berhasil ditambahkan.");
    } catch (saveError) {
      console.error("Gagal menyimpan data anak:", saveError);
      setError("Data anak tidak dapat disimpan. Pastikan Anda admin dan rules terbaru sudah diterapkan.");
    } finally {
      setSaving(false);
    }
  }

  function editChild(child: Child) {
    setEditingId(child.id);
    setForm({
      name: child.name,
      className: child.className,
    });
    setShowForm(true);
    setError("");
    setNotice("");
  }

  async function toggleActive(child: Child) {
    if (!db || !isAdmin) return;
    setError("");
    try {
      await updateDoc(doc(db, "children", child.id), {
        active: !child.active,
        updatedAt: serverTimestamp(),
      });
      await loadChildren();
      setNotice(child.active ? "Anak dinonaktifkan; QR tetap tersimpan." : "Anak diaktifkan kembali.");
    } catch (updateError) {
      console.error("Gagal memperbarui status anak:", updateError);
      setError("Status anak tidak dapat diperbarui.");
    }
  }

  const visibleChildren = children.filter((child) => {
    const matchesSearch = child.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesClass = classFilter === "Semua kelas" || child.className === classFilter;
    return matchesSearch && matchesClass && (showInactive || child.active);
  });

  if (access !== "internal") {
    return <AccessMessage access={access} />;
  }

  return (
    <main className="min-h-screen bg-[#f5f7f5] px-3 pb-24 pt-5 text-[#26392f] sm:px-8 sm:py-9 sm:pb-24 lg:pb-9">
      <MobileHeader title="Database anak" />
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-8 sm:gap-4">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold text-[#7c897e] hover:text-[#31553e]">
              <ArrowLeft size={14} /> Dashboard
            </Link>
            <h1 className="text-[23px] font-semibold text-[#2f4737] sm:text-3xl">Database anak</h1>
            <p className="mt-1.5 text-xs text-[#7f8a80] sm:mt-2 sm:text-sm">Data dasar dan QR unik untuk absensi pelayanan.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[#e6ebe5] bg-white px-4 py-3 text-xs text-[#788578]">
            <UserRound size={15} /> {children.filter((child) => child.active).length} anak aktif
          </div>
        </header>

        <div className="mb-4 rounded-2xl border border-[#e5ebe2] bg-[#eef4eb] px-3.5 py-3 text-[11px] leading-5 text-[#586c55] sm:mb-5 sm:px-4 sm:text-xs">
          <span className="font-semibold">Privasi:</span> simpan hanya nama yang diperlukan untuk pelayanan. QR berisi kode acak, bukan informasi pribadi.
        </div>
        {error && <p className="mb-4 rounded-xl border border-[#f0d5ca] bg-[#fff5f0] px-4 py-3 text-xs text-[#87523e]" role="alert">{error}</p>}
        {notice && <p className="mb-4 rounded-xl border border-[#dbe7d4] bg-[#f1f6ec] px-4 py-3 text-xs text-[#496346]" role="status">{notice}</p>}

        <section aria-label="Kelas KPAR" className="mb-4 grid grid-cols-2 gap-2.5 sm:mb-5 sm:grid-cols-4 sm:gap-3">
          {childClasses.map((childClass, index) => {
            const count = children.filter(
              (child) => child.className === childClass && child.active,
            ).length;
            const color = [
              "bg-[#f5f0e5] text-[#9b7c4b]",
              "bg-[#edf3ed] text-[#557452]",
              "bg-[#edf2f6] text-[#647b90]",
              "bg-[#f5edeb] text-[#9d7267]",
            ][index];
            return (
              <button
                key={childClass}
                type="button"
                onClick={() =>
                  setClassFilter(
                    classFilter === childClass ? "Semua kelas" : childClass,
                  )
                }
                aria-pressed={classFilter === childClass}
                className={`min-h-28 rounded-2xl border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm sm:p-4 ${
                  classFilter === childClass
                    ? "border-[#8fa287] ring-2 ring-[#e4ece0]"
                    : "border-[#e6ebe5]"
                }`}
              >
                <span className={`flex size-8 items-center justify-center rounded-xl ${color}`}>
                  <UserRound size={15} />
                </span>
                <span className="mt-3 block text-[11px] font-semibold text-[#4b5c4d]">
                  {childClass}
                </span>
                <span className="mt-1 block text-[10px] text-[#929b92]">
                  {count} anak aktif
                </span>
              </button>
            );
          })}
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#e6ebe5] bg-white">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-[#edf0eb] p-3 sm:gap-3 sm:p-5">
            <label className="relative min-w-[calc(100%-1px)] flex-1 sm:min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa39a]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama anak…" className="min-h-11 w-full rounded-xl border border-[#e7ebe5] py-2.5 pl-9 pr-3 text-base outline-none focus:border-[#9bab94] sm:text-xs" />
            </label>
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#e7ebe5] bg-white px-3 py-2.5 text-xs text-[#59685b] outline-none sm:flex-none">
              <option>Semua kelas</option>
              {childClasses.map((childClass) => <option key={childClass}>{childClass}</option>)}
            </select>
            {isAdmin && (
              <button onClick={() => { setEditingId(null); setForm(blankChild); setShowForm(true); }} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#294d3c] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#203e30] sm:flex-none">
                <Plus size={15} /> Tambah anak
              </button>
            )}
            {isAdmin && (
              <label className="flex min-h-11 items-center gap-2 text-[10px] text-[#748075]">
                <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} className="size-4 accent-[#365b48]" />
                Tampilkan nonaktif
              </label>
            )}
          </div>

          {showForm && isAdmin && (
            <form onSubmit={saveChild} className="border-b border-[#edf0eb] bg-[#fbfcfa] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#3b4d3f]">{editingId ? "Ubah data anak" : "Tambah anak baru"}</h2>
                <button type="button" aria-label="Tutup formulir" onClick={() => setShowForm(false)} className="flex size-8 items-center justify-center rounded-lg text-[#79867a] hover:bg-white"><X size={16} /></button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-semibold text-[#667366]">Nama lengkap
                  <input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-[#e3e8e1] bg-white px-3 py-2.5 text-xs font-normal outline-none focus:border-[#9bab94]" />
                </label>
                <label className="text-[10px] font-semibold text-[#667366]">Kelas
                  <select value={form.className} onChange={(event) => setForm({ ...form, className: event.target.value as ChildClass })} className="mt-1.5 w-full rounded-xl border border-[#e3e8e1] bg-white px-3 py-2.5 text-xs font-normal outline-none focus:border-[#9bab94]">
                    {childClasses.map((childClass) => <option key={childClass}>{childClass}</option>)}
                  </select>
                </label>
              </div>
              <button disabled={saving} type="submit" className="mt-4 min-h-11 w-full rounded-xl bg-[#294d3c] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-60 sm:w-auto">
                {saving ? "Menyimpan…" : editingId ? "Simpan perubahan" : "Simpan & buat QR"}
              </button>
            </form>
          )}

          {loading ? (
            <div className="p-12 text-center"><LoaderCircle className="mx-auto animate-spin text-[#76906e]" /></div>
          ) : visibleChildren.length ? (
            <div className="divide-y divide-[#f0f2ee]">
              {visibleChildren.map((child) => (
                <article key={child.id} className="flex flex-wrap items-center gap-2.5 px-3.5 py-3.5 sm:gap-3 sm:px-5 sm:py-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#edf3ed] text-[#547351]"><UserRound size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[#3b4d3f]">{child.name}</p>
                    <p className="mt-1 text-[10px] text-[#8c968c]">
                      <CalendarDays className="mr-1 inline" size={11} />
                      Kelas {child.className}
                    </p>
                  </div>
                  {!child.active && <span className="rounded-full bg-[#f4f0ec] px-2.5 py-1 text-[9px] text-[#9b786d]">Nonaktif</span>}
                  {child.active && (
                    <button onClick={() => setQrChild(child)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[#e5ebe3] px-3 py-2 text-[10px] font-semibold text-[#587252] hover:bg-[#f4f7f1]">
                      <QrCode size={14} /> QR absensi
                    </button>
                  )}
                  {isAdmin && (
                    <>
                      <button aria-label={`Ubah data ${child.name}`} onClick={() => editChild(child)} className="flex size-10 items-center justify-center rounded-lg text-[#7f8b80] hover:bg-[#f2f5f0]"><Pencil size={14} /></button>
                      <button onClick={() => void toggleActive(child)} className="min-h-10 rounded-lg border border-[#e7ebe5] px-2.5 py-2 text-[9px] font-medium text-[#778378] hover:bg-[#f8f9f7]">{child.active ? "Nonaktifkan" : "Aktifkan"}</button>
                    </>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="px-6 py-14 text-center">
              <UserRound className="mx-auto text-[#91a18c]" size={26} />
              <p className="mt-3 text-xs font-semibold text-[#4c5d4e]">{children.length ? "Tidak ada hasil yang cocok." : "Database anak masih kosong."}</p>
              {isAdmin && !children.length && <p className="mt-1 text-[10px] text-[#929b92]">Tambahkan anak untuk membuat kartu QR absensi.</p>}
            </div>
          )}
        </section>
        <p className="mt-4 text-[10px] leading-5 text-[#929b92]">
          Akses baca tersedia bagi pengguna internal. Hanya admin dapat menambah, mengubah, atau menonaktifkan data.
        </p>
        {qrChild && <QrCard child={qrChild} onClose={() => setQrChild(null)} />}
      </div>
      <MobileNav active="children" canManageMembers={canManageMembers} isAdmin={isAdmin} />
    </main>
  );
}

function AccessMessage({ access }: { access: Access }) {
  const content = {
    checking: ["Memeriksa akses…", "Sedang memeriksa sesi akun."],
    unconfigured: ["Firebase belum dikonfigurasi", "Hubungi administrator aplikasi."],
    "signed-out": ["Silakan masuk", "Masuk melalui halaman dashboard untuk melanjutkan."],
    forbidden: ["Akses belum diberikan", "Hubungi admin KPAR untuk meminta akses internal."],
    internal: ["", ""],
  }[access];

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7f5] p-6">
      <div className="max-w-md rounded-2xl border border-[#e6ebe5] bg-white p-7 text-center">
        <ShieldAlert className="mx-auto text-[#8b9a80]" size={25} />
        <h1 className="mt-4 font-semibold text-[#35483a]">{content[0]}</h1>
        <p className="mt-2 text-xs leading-5 text-[#7f8a80]">{content[1]}</p>
        <Link href="/" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[#55704f]"><ArrowLeft size={14} /> Kembali</Link>
      </div>
    </main>
  );
}

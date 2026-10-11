"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  Church,
  LogOut,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { FormEvent, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { signInWithUsername } from "@/lib/username-login";

type EventItem = {
  id: string;
  title: string;
  description: string;
  startsAt: Timestamp;
  location: string;
  category: string;
  published: boolean;
};

type FormValues = {
  title: string;
  description: string;
  startsAt: string;
  location: string;
  category: string;
  published: boolean;
};

const emptyForm: FormValues = {
  title: "",
  description: "",
  startsAt: "",
  location: "",
  category: "Anak",
  published: true,
};

function toLocalDateTime(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export default function AdminPage() {
  const [access, setAccess] = useState<
    "checking" | "unconfigured" | "signed-out" | "admin" | "forbidden"
  >(auth && db ? "checking" : "unconfigured");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadEvents() {
    if (!db) return;
    const snapshot = await getDocs(collection(db, "events"));
    const loadedEvents = snapshot.docs.map((eventDocument) => {
      const data = eventDocument.data();
      if (
        typeof data.title !== "string" ||
        typeof data.description !== "string" ||
        !(data.startsAt instanceof Timestamp) ||
        typeof data.location !== "string" ||
        typeof data.category !== "string" ||
        typeof data.published !== "boolean"
      ) {
        throw new Error(`Dokumen agenda "${eventDocument.id}" memiliki format yang tidak valid.`);
      }

      return {
        id: eventDocument.id,
        title: data.title,
        description: data.description,
        startsAt: data.startsAt,
        location: data.location,
        category: data.category,
        published: data.published,
      };
    });

    loadedEvents.sort((first, second) => first.startsAt.toMillis() - second.startsAt.toMillis());
    setEvents(loadedEvents);
  }

  useEffect(() => {
    if (!auth) return;

    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        setAccess("signed-out");
        setEvents([]);
        return;
      }

      void user
        .getIdTokenResult()
        .then(async (token) => {
          if (token.claims.admin !== true) {
            setAccess("forbidden");
            return;
          }

          setAccess("admin");
          await loadEvents();
        })
        .catch((loadError: unknown) => {
          console.error("Gagal memverifikasi akses atau memuat agenda:", loadError);
          setError("Tidak dapat memuat agenda. Periksa koneksi dan aturan Firebase.");
        });
    });
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) return;
    setError("");
    setBusy(true);

    try {
      await signInWithUsername(username, password);
      setPassword("");
    } catch (loginError) {
      console.error("Login pengelola gagal:", loginError);
      setError("Login gagal. Periksa email dan kata sandi, lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !form.startsAt) return;
    setError("");
    setNotice("");
    setBusy(true);

    try {
      const eventRef = editingId
        ? doc(db, "events", editingId)
        : doc(collection(db, "events"));
      await setDoc(eventRef, {
        title: form.title.trim(),
        description: form.description.trim(),
        startsAt: Timestamp.fromDate(new Date(form.startsAt)),
        location: form.location.trim(),
        category: form.category,
        published: form.published,
      });
      await loadEvents();
      setForm(emptyForm);
      setEditingId(null);
      setNotice(editingId ? "Perubahan agenda berhasil disimpan." : "Agenda baru berhasil ditambahkan.");
    } catch (saveError) {
      console.error("Gagal menyimpan agenda:", saveError);
      setError("Agenda tidak dapat disimpan. Pastikan akun memiliki akses admin.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(eventId: string) {
    if (!db || !window.confirm("Hapus agenda ini? Tindakan ini tidak dapat dibatalkan.")) {
      return;
    }

    setError("");
    setNotice("");
    setBusy(true);
    try {
      await deleteDoc(doc(db, "events", eventId));
      await loadEvents();
      if (editingId === eventId) {
        setEditingId(null);
        setForm(emptyForm);
      }
      setNotice("Agenda berhasil dihapus.");
    } catch (deleteError) {
      console.error("Gagal menghapus agenda:", deleteError);
      setError("Agenda tidak dapat dihapus. Pastikan akun memiliki akses admin.");
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(event: EventItem) {
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description,
      startsAt: toLocalDateTime(event.startsAt.toDate()),
      location: event.location,
      category: event.category,
      published: event.published,
    });
    setNotice("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleLogout() {
    if (!auth) return;
    try {
      await signOut(auth);
      setNotice("");
      setError("");
    } catch (logoutError) {
      console.error("Gagal keluar dari akun pengelola:", logoutError);
      setError("Tidak dapat keluar dari akun. Coba lagi.");
    }
  }

  return (
    <main className="min-h-screen bg-[#faf9f5] px-5 py-8 text-[#26392f] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-[#365b48] text-white">
              <Church size={22} />
            </span>
            <span>
              <span className="block text-xs font-bold tracking-[0.14em]">KPAR GKJW</span>
              <span className="mt-1 block text-[10px] text-[#7a8579]">Ruang pengelola</span>
            </span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-[#718072] hover:text-[#365b48]">
            <ArrowLeft size={15} /> Kembali ke situs
          </Link>
        </header>

        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#b27b42]">Panel pengelola</p>
          <h1 className="mt-2 font-serif text-3xl text-[#2d4939] sm:text-4xl">Kelola agenda KPAR</h1>
          <p className="mt-2 text-sm text-[#788178]">
            Tambahkan dan perbarui informasi kegiatan yang tampil di beranda.
          </p>
        </div>

        {error && (
          <p className="mb-5 rounded-2xl border border-[#f0d5ca] bg-[#fff5f0] px-4 py-3 text-sm text-[#87523e]" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="mb-5 rounded-2xl border border-[#dbe7d4] bg-[#f1f6ec] px-4 py-3 text-sm text-[#496346]" role="status">
            {notice}
          </p>
        )}

        {access === "checking" && (
          <div className="rounded-3xl border border-[#e9e7de] bg-white p-8 text-sm text-[#788178]">
            Memeriksa akses pengelola…
          </div>
        )}

        {access === "unconfigured" && (
          <div className="rounded-3xl border border-[#e9e7de] bg-white p-8">
            <h2 className="font-semibold text-[#334a3b]">Firebase belum dikonfigurasi</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#788178]">
              Isi variabel `NEXT_PUBLIC_FIREBASE_*` di `.env.local` untuk lokal
              atau di pengaturan project Vercel sebelum mengaktifkan pengelolaan.
            </p>
          </div>
        )}

        {access === "signed-out" && (
          <form onSubmit={handleLogin} className="max-w-md rounded-3xl border border-[#e9e7de] bg-white p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-[#334a3b]">Masuk sebagai pengelola</h2>
            <p className="mt-2 text-sm leading-6 text-[#788178]">
              Gunakan akun pelayan yang sudah diberi akses admin oleh pengelola Firebase.
            </p>
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
              disabled={busy}
              type="submit"
              className="mt-6 w-full rounded-full bg-[#365b48] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#284737] disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? "Memproses…" : "Masuk"}
            </button>
          </form>
        )}

        {access === "forbidden" && (
          <div className="rounded-3xl border border-[#e9e7de] bg-white p-8">
            <h2 className="font-semibold text-[#334a3b]">Akun ini belum memiliki akses admin.</h2>
            <p className="mt-2 text-sm leading-6 text-[#788178]">
              Hubungi pengelola Firebase untuk memberi custom claim admin kepada akun pelayan.
            </p>
            <button onClick={() => void handleLogout()} className="mt-5 rounded-full border border-[#e2e3da] px-4 py-2 text-xs font-semibold text-[#526457]">
              Keluar
            </button>
          </div>
        )}

        {access === "admin" && (
          <>
            <div className="mb-6 flex justify-end">
              <button onClick={() => void handleLogout()} className="inline-flex items-center gap-2 rounded-full border border-[#e5e5dc] bg-white px-4 py-2.5 text-xs font-semibold text-[#667367] hover:text-[#365b48]">
                <LogOut size={14} /> Keluar
              </button>
            </div>
            <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr]">
              <form onSubmit={handleSave} className="h-fit rounded-3xl border border-[#e9e7de] bg-white p-6 sm:p-7">
                <div className="mb-6 flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-[#334a3b]">
                    {editingId ? "Ubah agenda" : "Tambah agenda"}
                  </h2>
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setForm(emptyForm); }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#879083]"
                    >
                      <X size={13} /> Batal
                    </button>
                  )}
                </div>
                <label className="mb-4 block text-xs font-semibold text-[#536253]">
                  Nama kegiatan
                  <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2 w-full rounded-xl border border-[#e5e5dc] bg-[#fcfbf8] px-4 py-3 text-sm outline-none focus:border-[#91a486]" />
                </label>
                <label className="mb-4 block text-xs font-semibold text-[#536253]">
                  Deskripsi
                  <textarea required rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-2 w-full resize-y rounded-xl border border-[#e5e5dc] bg-[#fcfbf8] px-4 py-3 text-sm outline-none focus:border-[#91a486]" />
                </label>
                <label className="mb-4 block text-xs font-semibold text-[#536253]">
                  Tanggal dan waktu
                  <input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className="mt-2 w-full rounded-xl border border-[#e5e5dc] bg-[#fcfbf8] px-4 py-3 text-sm outline-none focus:border-[#91a486]" />
                </label>
                <label className="mb-4 block text-xs font-semibold text-[#536253]">
                  Lokasi
                  <input required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="mt-2 w-full rounded-xl border border-[#e5e5dc] bg-[#fcfbf8] px-4 py-3 text-sm outline-none focus:border-[#91a486]" />
                </label>
                <label className="mb-4 block text-xs font-semibold text-[#536253]">
                  Kelompok
                  <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-2 w-full rounded-xl border border-[#e5e5dc] bg-[#fcfbf8] px-4 py-3 text-sm outline-none focus:border-[#91a486]">
                    <option>Anak</option>
                    <option>Remaja</option>
                    <option>Pelayanan</option>
                    <option>Bersama</option>
                  </select>
                </label>
                <label className="mb-5 flex items-center gap-2 text-xs font-medium text-[#536253]">
                  <input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} className="size-4 accent-[#365b48]" />
                  Tampilkan di situs publik
                </label>
                <button disabled={busy} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#365b48] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#284737] disabled:cursor-wait disabled:opacity-60">
                  {editingId ? <Save size={15} /> : <Plus size={16} />}
                  {busy ? "Menyimpan…" : editingId ? "Simpan perubahan" : "Tambah kegiatan"}
                </button>
              </form>

              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold text-[#334a3b]">Semua agenda</h2>
                  <span className="text-[11px] text-[#879083]">{events.length} kegiatan</span>
                </div>
                <div className="space-y-3">
                  {events.map((event) => (
                    <article key={event.id} className="flex items-start gap-4 rounded-2xl border border-[#e9e7de] bg-white p-4 sm:p-5">
                      <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eef2e8] text-[#62704e]">
                        <CalendarDays size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-[#334a3b]">{event.title}</h3>
                          <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${event.published ? "bg-[#edf4e9] text-[#5d7755]" : "bg-[#f2f0e9] text-[#8a897d]"}`}>
                            {event.published ? "Publik" : "Draf"}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-[#7b847a]">
                          {event.startsAt.toDate().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} · {event.location}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button aria-label={`Ubah ${event.title}`} onClick={() => beginEdit(event)} className="flex size-9 items-center justify-center rounded-xl text-[#788178] hover:bg-[#f1f3ec] hover:text-[#365b48]">
                          <Pencil size={15} />
                        </button>
                        <button aria-label={`Hapus ${event.title}`} onClick={() => void handleDelete(event.id)} disabled={busy} className="flex size-9 items-center justify-center rounded-xl text-[#9a7770] hover:bg-[#fff0ec] hover:text-[#a34d3e] disabled:opacity-50">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                  {events.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[#dcded3] px-5 py-10 text-center">
                      <Check className="mx-auto text-[#8a9b82]" size={22} />
                      <p className="mt-2 text-sm font-semibold text-[#425745]">Belum ada agenda.</p>
                      <p className="mt-1 text-xs text-[#828a80]">Tambahkan kegiatan menggunakan formulir.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

"use client";

import {
  ArrowLeft,
  Camera,
  CameraOff,
  Check,
  CircleAlert,
  Clock3,
  LoaderCircle,
  QrCode,
  ScanLine,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { MobileHeader } from "@/components/mobile-header";
import { MobileNav } from "@/components/mobile-nav";

type Access = "checking" | "unconfigured" | "signed-out" | "internal" | "forbidden";
type Activity = { id: string; title: string; startsAt: Timestamp; published: boolean };
type RecordItem = {
  id: string;
  childId: string;
  checkedBy: string;
  checkedAt: Timestamp;
};
type ChildSummary = { name: string; className: string };

export default function AttendancePage() {
  const [access, setAccess] = useState<Access>(auth && db ? "checking" : "unconfigured");
  const [uid, setUid] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState("");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [childSummaries, setChildSummaries] = useState<Record<string, ChildSummary>>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<{ stop: () => void } | null>(null);
  const markAttendanceRef = useRef<(code: string) => Promise<void>>(
    async () => {},
  );

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        setAccess("signed-out");
        setUid("");
        return;
      }
      setUid(user.uid);
      void user.getIdTokenResult().then(async (token) => {
        const internal = token.claims.internal === true || token.claims.admin === true;
        setAccess(internal ? "internal" : "forbidden");
        if (!internal || !db) return;
        const snapshot = await getDocs(
          query(collection(db, "events"), where("published", "==", true)),
        );
        const childrenSnapshot = await getDocs(collection(db, "children"));
        const summaries: Record<string, ChildSummary> = {};
        for (const childDocument of childrenSnapshot.docs) {
          const data = childDocument.data();
          if (typeof data.name === "string" && typeof data.className === "string") {
            summaries[childDocument.id] = {
              name: data.name,
              className: data.className,
            };
          }
        }
        setChildSummaries(summaries);
        const loaded = snapshot.docs.flatMap((eventDocument) => {
          const data = eventDocument.data();
          if (typeof data.title !== "string" || !(data.startsAt instanceof Timestamp)) return [];
          return [{
            id: eventDocument.id,
            title: data.title,
            startsAt: data.startsAt,
            published: data.published === true,
          }];
        }).sort((a, b) => b.startsAt.toMillis() - a.startsAt.toMillis());
        setActivities(loaded);
        if (loaded[0]) setSelectedActivity(loaded[0].id);
      }).catch((authError: unknown) => {
        console.error("Gagal memeriksa akses absensi:", authError);
        setError("Tidak dapat memeriksa akses pengguna.");
        setAccess("forbidden");
      });
    });
  }, []);

  useEffect(() => {
    let active = true;
    async function loadRecords() {
      if (!db || !selectedActivity) {
        setRecords([]);
        return;
      }
      setError("");
      try {
        const snapshot = await getDocs(
          query(collection(db, "attendance"), where("eventId", "==", selectedActivity)),
        );
        const loaded = snapshot.docs.flatMap((item) => {
          const data = item.data();
          if (
            data.eventId !== selectedActivity ||
            typeof data.childId !== "string" ||
            typeof data.checkedBy !== "string" ||
            !(data.checkedAt instanceof Timestamp)
          ) return [];
          return [{
            id: item.id,
            childId: data.childId,
            checkedBy: data.checkedBy,
            checkedAt: data.checkedAt,
          }];
        }).sort((a, b) => b.checkedAt.toMillis() - a.checkedAt.toMillis());
        if (active) setRecords(loaded);
      } catch (loadError) {
        console.error("Gagal memuat catatan absensi:", loadError);
        if (active) setError("Catatan absensi gagal dimuat. Periksa Firestore Rules.");
      }
    }
    if (access === "internal") void loadRecords();
    return () => { active = false; };
  }, [selectedActivity, access]);

  useEffect(() => {
    if (!scannerOpen || !videoRef.current) return;
    let active = true;
    async function startScanner() {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (!active || !videoRef.current) return;
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (!result || !active) return;
            const value = result.getText();
            active = false;
            scannerRef.current?.stop();
            scannerRef.current = null;
            setScannerOpen(false);
            setScannerBusy(false);
            void markAttendanceRef.current(value);
          },
        );
        scannerRef.current = controls;
        if (!active) controls.stop();
      } catch (scanError) {
        console.error("Kamera/QR scanner gagal dijalankan:", scanError);
        if (active) {
          setCameraError(
            scanError instanceof Error && scanError.name === "NotAllowedError"
              ? "Izin kamera ditolak. Aktifkan izin kamera di browser."
              : "Kamera tidak tersedia. Gunakan input kode manual atau periksa koneksi HTTPS.",
          );
          setScannerBusy(false);
        }
      }
    }
    void startScanner();
    return () => {
      active = false;
      scannerRef.current?.stop();
      scannerRef.current = null;
    };
  }, [scannerOpen, selectedActivity]);

  const markAttendance = useCallback(async (rawCode: string) => {
    setError("");
    setNotice("");
    if (!db || !uid) {
      setError("Sesi pengguna tidak tersedia. Silakan masuk kembali.");
      return;
    }
    if (!selectedActivity) {
      setError("Pilih kegiatan sebelum mencatat absensi.");
      return;
    }
    const code = rawCode.trim().replace(/^KPAR1:/i, "").toLowerCase();
    if (!/^[a-f0-9-]{36}$/.test(code)) {
      setError("QR/kode tidak dikenali sebagai kartu absensi KPAR.");
      return;
    }

    setSaving(true);
    try {
      const childSnapshot = await getDocs(
        query(
          collection(db, "children"),
          where("attendanceCode", "==", code),
          where("active", "==", true),
        ),
      );
      if (childSnapshot.empty) {
        setError("Kartu tidak ditemukan atau anak berstatus nonaktif.");
        return;
      }
      if (childSnapshot.size !== 1) {
        setError("Kode QR terduplikasi. Hubungi administrator sebelum melanjutkan.");
        return;
      }
      const childDocument = childSnapshot.docs[0];
      const childData = childDocument.data();
      if (
        typeof childData.name !== "string" ||
        typeof childData.className !== "string"
      ) {
        throw new Error(`Profil anak "${childDocument.id}" memiliki format tidak valid.`);
      }

      const recordId = `${selectedActivity}__${childDocument.id}`;
      await setDoc(doc(db, "attendance", recordId), {
        eventId: selectedActivity,
        childId: childDocument.id,
        checkedAt: serverTimestamp(),
        checkedBy: uid,
        status: "hadir",
      });
      setRecords((current) => [
        {
          id: recordId,
          childId: childDocument.id,
          checkedBy: uid,
          checkedAt: Timestamp.now(),
        },
        ...current.filter((record) => record.id !== recordId),
      ]);
      setNotice(`Absensi ${childData.name} (${childData.className}) berhasil dicatat.`);
      setManualCode("");
    } catch (markError) {
      if (
        typeof markError === "object" &&
        markError !== null &&
        "code" in markError &&
        markError.code === "permission-denied"
      ) {
        setError("Absensi sudah tercatat atau akun belum diizinkan oleh Firestore Rules.");
      } else {
        console.error("Gagal mencatat absensi:", markError);
        setError("Absensi tidak dapat dicatat. Periksa koneksi dan Firestore Rules.");
      }
    } finally {
      setSaving(false);
    }
  }, [selectedActivity, uid]);

  useEffect(() => {
    markAttendanceRef.current = markAttendance;
  }, [markAttendance]);

  function submitManualCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void markAttendance(manualCode);
  }

  if (access !== "internal") {
    const message = access === "checking"
      ? "Memeriksa akses…"
      : access === "unconfigured"
        ? "Firebase belum dikonfigurasi."
        : access === "signed-out"
          ? "Silakan masuk sebelum menggunakan absensi."
          : "Akun ini belum memiliki akses internal.";
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7f5] p-6">
        <div className="max-w-md rounded-2xl border border-[#e6ebe5] bg-white p-7 text-center">
          <ShieldAlert className="mx-auto text-[#8b9a80]" size={25} />
          <h1 className="mt-4 font-semibold text-[#35483a]">{message}</h1>
          <Link href="/" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[#55704f]"><ArrowLeft size={14} /> Kembali ke dashboard</Link>
        </div>
      </main>
    );
  }

  const selected = activities.find((activity) => activity.id === selectedActivity);

  return (
    <main className="min-h-screen bg-[#f5f7f5] px-4 pb-24 pt-5 text-[#26392f] sm:px-8 sm:py-9 sm:pb-24 lg:pb-9">
      <MobileHeader title="Absensi kegiatan" />
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold text-[#7c897e] hover:text-[#31553e]">
              <ArrowLeft size={14} /> Dashboard
            </Link>
            <h1 className="text-2xl font-semibold text-[#2f4737] sm:text-3xl">Absensi kegiatan</h1>
            <p className="mt-2 text-sm text-[#7f8a80]">Pindai QR setiap anak untuk mencatat kehadiran.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[#e6ebe5] bg-white px-4 py-3 text-xs text-[#667568]">
            <Check size={15} className="text-[#66815e]" /> {records.length} hadir
          </div>
        </header>

        {error && <p className="mb-4 flex items-start gap-2 rounded-xl border border-[#f0d5ca] bg-[#fff5f0] px-4 py-3 text-xs leading-5 text-[#87523e]" role="alert"><CircleAlert size={15} className="mt-0.5 shrink-0" />{error}</p>}
        {notice && <p className="mb-4 flex items-start gap-2 rounded-xl border border-[#dbe7d4] bg-[#f1f6ec] px-4 py-3 text-xs leading-5 text-[#496346]" role="status"><Check size={15} className="mt-0.5 shrink-0" />{notice}</p>}

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-[#e6ebe5] bg-white p-5 sm:p-6">
            <label className="block text-[10px] font-semibold text-[#667366]">
              Pilih kegiatan
              <select value={selectedActivity} onChange={(event) => setSelectedActivity(event.target.value)} className="mt-2 w-full rounded-xl border border-[#e4e9e2] bg-white px-3 py-3 text-xs text-[#435348] outline-none focus:border-[#9bab94]">
                <option value="">Pilih kegiatan…</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.title} · {activity.startsAt.toDate().toLocaleDateString("id-ID", { dateStyle: "medium" })}
                  </option>
                ))}
              </select>
            </label>
            {!activities.length && (
              <p className="mt-3 text-[10px] leading-5 text-[#929b92]">
                Belum ada agenda terbit. Admin perlu membuat dan menerbitkan kegiatan terlebih dahulu.
              </p>
            )}

            <div className="mt-5 rounded-2xl bg-[#f2f6f0] p-5 text-center">
              <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-white text-[#577452]"><ScanLine size={22} /></span>
              <h2 className="mt-3 text-sm font-semibold text-[#405344]">Pindai QR anak</h2>
              <p className="mt-1 text-[10px] leading-5 text-[#879187]">
                Arahkan kamera belakang ke QR pada kartu anak.
              </p>
              <button
                disabled={!selectedActivity || scannerBusy || saving}
                onClick={() => {
                  setCameraError("");
                  setScannerBusy(true);
                  setScannerOpen(true);
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#294d3c] px-4 py-3 text-xs font-semibold text-white hover:bg-[#203e30] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Camera size={15} /> Buka kamera
              </button>
            </div>

            {cameraError && <p className="mt-3 flex items-start gap-2 text-[10px] leading-5 text-[#95614e]" role="alert"><CameraOff size={14} className="mt-0.5 shrink-0" />{cameraError}</p>}

            {scannerOpen && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-[#e5ebe3] bg-[#14251b]">
                <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
                <div className="flex items-center justify-between px-3 py-2.5 text-white">
                  <span className="text-[10px]">Arahkan kamera ke QR</span>
                  <button
                    onClick={() => {
                      scannerRef.current?.stop();
                      scannerRef.current = null;
                      setScannerOpen(false);
                      setScannerBusy(false);
                    }}
                    className="inline-flex items-center gap-1 text-[10px] text-white/75"
                  >
                    <X size={13} /> Tutup
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={submitManualCode} className="mt-5 border-t border-[#edf0eb] pt-4">
              <label className="block text-[10px] font-semibold text-[#748075]">
                Atau masukkan kode QR manual
                <div className="mt-2 flex gap-2">
                  <input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="KPAR1:…" className="min-w-0 flex-1 rounded-xl border border-[#e4e9e2] px-3 py-2.5 text-xs outline-none focus:border-[#9bab94]" />
                  <button disabled={!selectedActivity || saving || !manualCode.trim()} type="submit" className="rounded-xl border border-[#dfe6dc] px-3 text-[10px] font-semibold text-[#54704f] disabled:opacity-50">Catat</button>
                </div>
              </label>
            </form>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#e6ebe5] bg-white">
            <div className="flex items-center justify-between border-b border-[#edf0eb] px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-[#3b4d3f]">Kehadiran tercatat</h2>
                <p className="mt-1 max-w-64 truncate text-[10px] text-[#929b92]">{selected?.title ?? "Pilih kegiatan untuk melihat absensi"}</p>
              </div>
              <span className="rounded-full bg-[#eef5e9] px-2.5 py-1.5 text-[9px] font-semibold text-[#59764f]">{records.length} hadir</span>
            </div>
            {!selectedActivity ? (
              <div className="px-5 py-12 text-center text-xs text-[#929b92]">Pilih kegiatan terlebih dahulu.</div>
            ) : records.length ? (
              <div className="divide-y divide-[#f0f2ee]">
                {records.map((record) => (
                  <AttendanceRow key={record.id} record={record} child={childSummaries[record.childId]} />
                ))}
              </div>
            ) : (
              <div className="px-5 py-12 text-center">
                <QrCode className="mx-auto text-[#91a18c]" size={25} />
                <p className="mt-3 text-xs font-semibold text-[#4c5d4e]">Belum ada kehadiran.</p>
                <p className="mt-1 text-[10px] text-[#929b92]">Hasil pemindaian akan tampil di sini.</p>
              </div>
            )}
          </div>
        </section>

        <p className="mt-4 text-[10px] leading-5 text-[#929b92]">
          Riwayat menyimpan UID anak, kegiatan, waktu, dan akun petugas pencatat. Nama/tanggal lahir tidak dimasukkan ke catatan absensi.
        </p>
        {scannerBusy && !scannerOpen && (
          <div className="fixed bottom-5 right-5 inline-flex items-center gap-2 rounded-xl bg-[#294d3c] px-4 py-3 text-xs text-white shadow-lg">
            <LoaderCircle size={14} className="animate-spin" /> Menyiapkan kamera…
          </div>
        )}
      </div>
      <MobileNav active="attendance" />
    </main>
  );
}

function AttendanceRow({
  record,
  child,
}: {
  record: RecordItem;
  child?: ChildSummary;
}) {
  return (
    <article className="flex items-center gap-3 px-5 py-4">
      <span className="flex size-9 items-center justify-center rounded-full bg-[#edf3ed] text-[#547351]"><UserRound size={16} /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[#3b4d3f]">{child?.name ?? "Data anak tidak ditemukan"}</p>
        <p className="mt-1 text-[10px] text-[#929b92]">{child?.className ?? "—"}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-[9px] text-[#788578]">
        <Clock3 size={12} />
        {record.checkedAt.toDate().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </article>
  );
}

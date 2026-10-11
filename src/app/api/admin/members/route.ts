import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

const classes = ["Balita", "Pratama", "Madya", "Remaja"] as const;
const roles = ["anggota", "wali_kelas", "coordinator", "admin"] as const;
type MemberRole = (typeof roles)[number];

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 16_384) return jsonError("Permintaan terlalu besar.", 413);

  const authorization = request.headers.get("authorization");
  const idToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!idToken) return jsonError("Silakan masuk sebagai pengelola.", 401);

  const { adminAuth, adminDb } = await import("@/lib/firebase-admin");
  let manager: Awaited<ReturnType<typeof adminAuth.verifyIdToken>>;
  try {
    manager = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    return jsonError("Sesi tidak valid. Silakan masuk kembali.", 401);
  }

  const isAdmin = manager.admin === true;
  const isCoordinator = manager.coordinator === true;
  if (!isAdmin && !isCoordinator) {
    return jsonError("Akses hanya untuk admin atau koordinator.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Data anggota tidak valid.", 400);
  }
  if (typeof body !== "object" || body === null) {
    return jsonError("Data anggota tidak valid.", 400);
  }

  const input = body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const username = typeof input.username === "string"
    ? input.username.trim().toLowerCase()
    : "";
  const displayName = typeof input.displayName === "string"
    ? input.displayName.trim()
    : "";
  const password = typeof input.password === "string" ? input.password : "";
  const role = input.role;
  const className = input.className;

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !/^[a-z0-9._-]{3,32}$/.test(username) ||
    displayName.length < 2 ||
    displayName.length > 120 ||
    password.length < 12 ||
    password.length > 128 ||
    !roles.includes(role as MemberRole)
  ) {
    return jsonError(
      "Lengkapi nama, email, username; sandi awal minimal 12 karakter.",
      400,
    );
  }

  const memberRole = role as MemberRole;
  if (
    (!isAdmin && (memberRole === "admin" || memberRole === "coordinator")) ||
    (memberRole === "wali_kelas" && !classes.includes(className as (typeof classes)[number])) ||
    (memberRole !== "wali_kelas" && className !== "")
  ) {
    return jsonError("Peran atau penempatan kelas tidak diizinkan.", 403);
  }

  const customClaims = {
    internal: true,
    admin: memberRole === "admin",
    coordinator: memberRole === "coordinator",
    waliKelas: memberRole === "wali_kelas",
    username,
    ...(memberRole === "wali_kelas" ? { className } : {}),
  };

  let createdUser: Awaited<ReturnType<typeof adminAuth.createUser>>;
  try {
    createdUser = await adminAuth.createUser({
      email,
      password,
      displayName,
      disabled: false,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "auth/email-already-exists"
    ) {
      return jsonError("Email sudah terdaftar.", 409);
    }
    console.error("Firebase gagal membuat akun anggota:", error);
    return jsonError("Akun tidak dapat dibuat. Periksa konfigurasi Firebase.", 500);
  }

  const memberRef = adminDb.collection("users").doc(createdUser.uid);
  const usernameRef = adminDb.collection("usernames").doc(username);
  const classRef = memberRole === "wali_kelas"
    ? adminDb.collection("classAssignments").doc(className as string)
    : null;

  try {
    await adminAuth.setCustomUserClaims(createdUser.uid, customClaims);
    await adminDb.runTransaction(async (transaction) => {
      const usernameSnapshot = await transaction.get(usernameRef);
      const classSnapshot = classRef ? await transaction.get(classRef) : null;
      if (usernameSnapshot.exists) {
        throw new Error("USERNAME_TAKEN");
      }
      if (classSnapshot?.exists) {
        throw new Error("CLASS_HAS_WALI");
      }

      transaction.create(usernameRef, {
        uid: createdUser.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.create(memberRef, {
        uid: createdUser.uid,
        email,
        username,
        usernameLower: username,
        displayName,
        roles: ["internal", memberRole],
        status: "active",
        ...(memberRole === "wali_kelas" ? { className } : {}),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (classRef) {
        transaction.create(classRef, {
          className,
          uid: createdUser.uid,
          displayName,
          username,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
  } catch (error) {
    try {
      await adminAuth.deleteUser(createdUser.uid);
    } catch (cleanupError) {
      console.error("Gagal membersihkan akun yang tidak selesai dibuat:", cleanupError);
    }

    if (error instanceof Error && error.message === "USERNAME_TAKEN") {
      return jsonError("Username sudah digunakan.", 409);
    }
    if (error instanceof Error && error.message === "CLASS_HAS_WALI") {
      return jsonError("Kelas tersebut sudah memiliki wali kelas aktif.", 409);
    }
    console.error("Gagal menyimpan profil anggota dan peran:", error);
    return jsonError("Profil anggota tidak dapat disimpan.", 500);
  }

  return NextResponse.json(
    {
      member: { uid: createdUser.uid, email, username, displayName, role: memberRole, className },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

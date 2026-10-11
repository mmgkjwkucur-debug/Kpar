import { NextResponse } from "next/server";

const invalidCredentials = () =>
  NextResponse.json(
    { error: "Username atau sandi tidak cocok." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8_192) {
    return NextResponse.json(
      { error: "Permintaan login terlalu besar." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Permintaan login tidak valid." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("username" in body) ||
    !("password" in body) ||
    typeof body.username !== "string" ||
    typeof body.password !== "string"
  ) {
    return NextResponse.json(
      { error: "Permintaan login tidak valid." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const username = body.username.trim().toLowerCase();
  const password = body.password;
  if (
    !/^[a-z0-9._-]{3,32}$/.test(username) ||
    password.length < 1 ||
    password.length > 1024
  ) {
    return invalidCredentials();
  }

  const { adminAuth, adminDb } = await import("@/lib/firebase-admin");
  let email: string | null = null;
  let uid: string | null = null;
  try {
    const usernameSnapshot = await adminDb
      .collection("usernames")
      .doc(username)
      .get();
    uid =
      usernameSnapshot.exists &&
      typeof usernameSnapshot.data()?.uid === "string"
        ? usernameSnapshot.data()!.uid
        : null;

    if (uid) {
      const profileSnapshot = await adminDb.collection("users").doc(uid).get();
      const profile = profileSnapshot.data();
      if (
        profileSnapshot.exists &&
        profile?.status === "active" &&
        profile.usernameLower === username &&
        typeof profile.email === "string"
      ) {
        email = profile.email;
      }
    }
  } catch (error) {
    console.error("Username lookup gagal di Firestore:", error);
    return NextResponse.json(
      { error: "Layanan login sementara tidak tersedia." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    console.error("NEXT_PUBLIC_FIREBASE_API_KEY belum dikonfigurasi.");
    return NextResponse.json(
      { error: "Layanan login belum dikonfigurasi." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const identityResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          email: email ?? `unknown-${username}@invalid.kpar.local`,
          password,
          returnSecureToken: true,
        }),
      },
    );

    if (!identityResponse.ok) {
      if (identityResponse.status === 429) {
        return NextResponse.json(
          { error: "Terlalu banyak percobaan login. Coba lagi nanti." },
          { status: 429, headers: { "Cache-Control": "no-store" } },
        );
      }
      if (identityResponse.status >= 500) {
        console.error(
          "Firebase Authentication sementara tidak tersedia:",
          identityResponse.status,
        );
        return NextResponse.json(
          { error: "Layanan login sementara tidak tersedia." },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
      return invalidCredentials();
    }

    const identityResult: unknown = await identityResponse.json();
    if (
      typeof identityResult !== "object" ||
      identityResult === null ||
      !("localId" in identityResult) ||
      typeof identityResult.localId !== "string" ||
      identityResult.localId !== uid ||
      !email
    ) {
      return invalidCredentials();
    }

    const user = await adminAuth.getUser(identityResult.localId);
    const claims = user.customClaims ?? {};
    if (
      user.disabled ||
      (claims.internal !== true && claims.admin !== true)
    ) {
      return invalidCredentials();
    }

    const customToken = await adminAuth.createCustomToken(user.uid, claims);
    return NextResponse.json(
      { customToken },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Autentikasi username gagal:", error);
    return NextResponse.json(
      { error: "Layanan login sementara tidak tersedia." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

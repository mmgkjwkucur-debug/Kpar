import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write(prompt);
    return new Promise((resolve, reject) => {
      let value = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        value += chunk;
        const newline = value.indexOf("\n");
        if (newline !== -1) {
          process.stdin.pause();
          resolve(value.slice(0, newline).replace(/\r$/, ""));
        }
      });
      process.stdin.on("error", reject);
      process.stdin.on("end", () => {
        if (value.length > 0) resolve(value.replace(/\r$/, ""));
        else reject(new Error("Sandi tidak diterima."));
      });
      process.stdin.resume();
    });
  }

  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();

    const finish = (error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (character) => {
      if (character === "\u0003") {
        finish(new Error("Pembuatan akun dibatalkan."));
      } else if (character === "\r" || character === "\n") {
        finish();
      } else if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    };

    process.stdin.on("data", onData);
  });
}

const [email, username] = process.argv.slice(2);
if (!email || !username) {
  throw new Error(
    "Gunakan: npm run firebase:create-admin -- <email> <username>",
  );
}
const normalizedUsername = username.trim().toLowerCase();
if (!/^[a-z0-9._-]{3,32}$/.test(normalizedUsername)) {
  throw new Error(
    "Username harus 3–32 karakter dan hanya berisi huruf kecil, angka, titik, garis bawah, atau tanda hubung.",
  );
}

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
  process.env;
if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  throw new Error(
    "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, dan FIREBASE_PRIVATE_KEY wajib diatur.",
  );
}

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
const auth = getAuth(app);
const firestore = getFirestore(app);

let existingUser = false;
try {
  await auth.getUserByEmail(email);
  existingUser = true;
} catch (error) {
  if (error?.code !== "auth/user-not-found") {
    throw error;
  }
}

if (existingUser) {
  throw new Error(
    `Akun ${email} sudah ada. Tidak ada sandi atau claim yang diubah.`,
  );
}

const password = await readHidden("Sandi awal (input tidak ditampilkan): ");
if (password.length < 6) {
  throw new Error("Firebase mensyaratkan sandi minimal 6 karakter.");
}

const user = await auth.createUser({
  email,
  password,
  displayName: normalizedUsername,
});

try {
  await auth.setCustomUserClaims(user.uid, {
    internal: true,
    admin: true,
    username: normalizedUsername,
  });
  const usernameRef = firestore.collection("usernames").doc(normalizedUsername);
  const userRef = firestore.collection("users").doc(user.uid);
  await firestore.runTransaction(async (transaction) => {
    const existingUsername = await transaction.get(usernameRef);
    if (existingUsername.exists) {
      throw new Error(`Username "${normalizedUsername}" sudah digunakan.`);
    }
    transaction.create(usernameRef, {
      uid: user.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(userRef, {
      uid: user.uid,
      email: user.email,
      username: normalizedUsername,
      usernameLower: normalizedUsername,
      displayName: user.displayName,
      roles: ["internal", "admin"],
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
} catch (error) {
  try {
    const userRef = firestore.collection("users").doc(user.uid);
    const profile = await userRef.get();
    const usernameRef = profile.exists && profile.data()?.username
      ? firestore.collection("usernames").doc(profile.data().username)
      : null;
    const batch = firestore.batch();
    batch.delete(userRef);
    if (usernameRef) batch.delete(usernameRef);
    await batch.commit();
    await auth.deleteUser(user.uid);
  } catch (rollbackError) {
    throw new AggregateError(
      [error, rollbackError],
      "Pemberian claim/profil gagal dan akun baru tidak dapat dibersihkan.",
    );
  }
  throw error;
}

console.log(`Akun admin ${email} berhasil dibuat.`);
console.log(`Profil dan peran admin tersimpan di users/${user.uid}.`);
console.log("Claim internal dan admin sudah aktif; keluar-masuk untuk refresh token.");

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

const email = process.argv[2];
if (!email) {
  throw new Error("Gunakan: npm run firebase:sync-admin-profile -- <email>");
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
const user = await auth.getUserByEmail(email);

if (user.customClaims?.admin !== true || user.customClaims?.internal !== true) {
  throw new Error(
    `Akun ${email} tidak memiliki claim admin dan internal; profil tidak disinkronkan.`,
  );
}

if (!user.email) {
  throw new Error(`Akun ${email} tidak memiliki alamat email.`);
}

const profileRef = firestore.collection("users").doc(user.uid);
const username =
  typeof user.customClaims.username === "string"
    ? user.customClaims.username
    : user.displayName ?? user.email.split("@")[0];
const usernameLower = username.trim().toLowerCase();
if (!/^[a-z0-9._-]{3,32}$/.test(usernameLower)) {
  throw new Error(`Username "${username}" tidak memenuhi format yang diizinkan.`);
}
const roles = ["internal", "admin"];

const usernameRef = firestore.collection("usernames").doc(usernameLower);
await firestore.runTransaction(async (transaction) => {
  const [currentProfile, existingUsername] = await Promise.all([
    transaction.get(profileRef),
    transaction.get(usernameRef),
  ]);
  if (
    existingUsername.exists &&
    existingUsername.data()?.uid !== user.uid
  ) {
    throw new Error(`Username "${usernameLower}" sudah digunakan akun lain.`);
  }

  const previousUsername =
    currentProfile.exists && currentProfile.data()?.username
      ? firestore
          .collection("usernames")
          .doc(currentProfile.data().username.toLowerCase())
      : null;
  const previous =
    previousUsername && previousUsername.path !== usernameRef.path
      ? await transaction.get(previousUsername)
      : null;

  transaction.set(
    profileRef,
    {
      uid: user.uid,
      email: user.email,
      username: usernameLower,
      usernameLower,
      displayName: user.displayName ?? usernameLower,
      roles,
      status: "active",
      ...(currentProfile.exists
        ? {}
        : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  transaction.set(usernameRef, { uid: user.uid }, { merge: true });
  if (previousUsername && previous?.exists && previous.data()?.uid === user.uid) {
    transaction.delete(previousUsername);
  }
});

console.log(
  `Profil admin ${email} dan username "${usernameLower}" disinkronkan ke Firestore.`,
);

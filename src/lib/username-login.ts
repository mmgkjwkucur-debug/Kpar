import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

export async function signInWithUsername(username: string, password: string) {
  if (!auth) {
    throw new Error("Firebase Authentication belum dikonfigurasi.");
  }

  const response = await fetch("/api/auth/username", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ username, password }),
  });

  const result: unknown = await response.json();
  if (
    !response.ok ||
    typeof result !== "object" ||
    result === null ||
    !("customToken" in result) ||
    typeof result.customToken !== "string"
  ) {
    const message =
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      typeof result.error === "string"
        ? result.error
        : "Login gagal. Periksa username dan sandi.";
    throw new Error(message);
  }

  await signInWithCustomToken(auth, result.customToken);
}

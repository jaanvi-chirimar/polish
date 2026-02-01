import { db } from "@/firebase/config";
import { doc, getDoc } from "firebase/firestore";

export async function getUser(userId: string) {
  const ref = doc(db, "users", userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("User not found");
  }

  return {
    id: snap.id,
    ...snap.data(),
  };
}

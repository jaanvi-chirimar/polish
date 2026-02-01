import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";


const firebaseConfig = {
  apiKey: "AIzaSyDGArvbdQ8sS13iie7XxtsRR7V3brCYxRY",
  authDomain: "polish-app-5e838.firebaseapp.com",
  projectId: "polish-app-5e838",
  storageBucket: "polish-app-5e838.firebasestorage.app",
  messagingSenderId: "53750585316",
  appId: "1:53750585316:web:5f139d556962a7e117d9f1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);


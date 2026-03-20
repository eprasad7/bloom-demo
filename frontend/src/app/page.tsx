"use client";

import dynamic from "next/dynamic";

const AuthGate = dynamic(() => import("@/components/AuthGate").then(m => ({ default: m.AuthGate })), { ssr: false });
const App = dynamic(() => import("@/components/App"), { ssr: false });

export default function Page() {
  return (
    <AuthGate>
      <App />
    </AuthGate>
  );
}

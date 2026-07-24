"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Falha não tratada na interface", {
      digest: error.digest,
      name: error.name,
    });
  }, [error]);

  return (
    <main className="error-state">
      <h1>Não foi possível carregar o aplicativo.</h1>
      <p>Tente novamente. Nenhuma operação financeira foi confirmada.</p>
      <button type="button" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}

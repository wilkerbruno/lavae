"use client";

import React, { PropsWithChildren, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { obterToken } from "../lib/api";

// Guarda simples de rota client-side: sem token válido, manda pro /login.
// (Numa versão de produção, considere validar o token/expiração no servidor.)
export function AuthGuard({ children }: PropsWithChildren) {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!obterToken()) {
      router.replace("/login");
    } else {
      setPronto(true);
    }
  }, [router]);

  if (!pronto) return null;
  return <>{children}</>;
}

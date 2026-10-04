"use client";

import axios from "axios";

// Normaliza a URL da API: garante que termina em "/api" (prefixo global da
// API NestJS), mesmo que NEXT_PUBLIC_API_URL tenha sido definida sem ele.
function normalizarApiUrl(bruta: string | undefined): string {
  const base = (bruta ?? "http://localhost:3000/api").trim().replace(/\/+$/, "");
  return /\/api$/.test(base) ? base : `${base}/api`;
}

export const API_URL = normalizarApiUrl(process.env.NEXT_PUBLIC_API_URL);

export const api = axios.create({ baseURL: API_URL });

const TOKEN_KEY = "lavajatoos_admin_token";

export function salvarToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function obterToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function limparToken() {
  localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = obterToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== "undefined") {
      limparToken();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

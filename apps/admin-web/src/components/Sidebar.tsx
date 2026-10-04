"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { limparToken } from "../lib/api";

const ITEMS = [
  { href: "/", label: "Visão geral" },
  { href: "/lavajatos", label: "LavaJatos" },
  { href: "/planos", label: "Planos e preços" },
  { href: "/faturamento", label: "Faturamento" },
  { href: "/configuracoes", label: "Configurações" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function sair() {
    limparToken();
    router.replace("/login");
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.brand}>Lava Jato OS</div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            style={{ ...styles.link, ...(pathname === item.href ? styles.linkActive : {}) }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <button onClick={sair} style={styles.logout}>
        Sair
      </button>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 240,
    background: "#171310",
    color: "#EDEAE6",
    display: "flex",
    flexDirection: "column",
    padding: "24px 16px",
    gap: 24,
  },
  brand: { fontWeight: 800, fontSize: 16, padding: "0 8px" },
  link: { padding: "11px 12px", borderRadius: 10, color: "#A79E96", textDecoration: "none", fontSize: 13, fontWeight: 600 },
  linkActive: { background: "#2E2721", color: "#EDEAE6" },
  logout: { background: "none", border: "none", color: "#A79E96", textAlign: "left", padding: "11px 12px", cursor: "pointer", fontSize: 13 },
};

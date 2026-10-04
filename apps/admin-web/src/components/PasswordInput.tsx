"use client";

import React, { useState } from "react";

// Campo de senha com botãozinho de "olho" pra revelar o que foi digitado.
// Reaproveitável em qualquer formulário do painel que peça senha (hoje só o
// login, mas fica pronto pra uma futura tela de "trocar senha", por exemplo).
type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ style, ...rest }: PasswordInputProps) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div style={{ position: "relative", display: "flex" }}>
      <input
        {...rest}
        type={visivel ? "text" : "password"}
        style={{ ...(style as React.CSSProperties), width: "100%", paddingRight: 40, boxSizing: "border-box" }}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        tabIndex={-1}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: 4,
          display: "flex",
          alignItems: "center",
          color: "#837A73",
        }}
      >
        {visivel ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.65 20.65 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.65 20.65 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

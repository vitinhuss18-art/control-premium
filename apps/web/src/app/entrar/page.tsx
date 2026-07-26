"use client";

import { useState, type FormEvent } from "react";
import "../cadastro/cadastro.css";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowserClient";

type Mode = "entrar" | "criar-empresa";

export default function EntrarPage() {
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nomeEmpresaLegal, setNomeEmpresaLegal] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [nomeAdmin, setNomeAdmin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const supabase = getSupabaseBrowserClient();

  async function handleEntrar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    if (!supabase) {
      setError(
        "Supabase não está configurado neste ambiente (faltam as variáveis NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).",
      );
      return;
    }
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });
    setLoading(false);
    if (authError) {
      setError("E-mail ou senha inválidos.");
      return;
    }
    setSuccess("Login realizado com sucesso.");
  }

  async function handleCriarEmpresa(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    if (!supabase) {
      setError(
        "Supabase não está configurado neste ambiente (faltam as variáveis NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).",
      );
      return;
    }
    if (!nomeEmpresaLegal.trim() || !nomeFantasia.trim() || !nomeAdmin.trim()) {
      setError("Preencha o nome da empresa e o seu nome.");
      return;
    }

    setLoading(true);
    try {
      const signUpResult = await supabase.auth.signUp({ email, password: senha });
      if (signUpResult.error) throw signUpResult.error;

      if (!signUpResult.data.session) {
        setSuccess(
          "Conta criada! Confirme seu e-mail e depois volte aqui para entrar — a empresa será criada no primeiro login.",
        );
        setLoading(false);
        return;
      }

      const rpc = await supabase.rpc("bootstrap_tenant", {
        tenant_legal_name: nomeEmpresaLegal.trim(),
        tenant_display_name: nomeFantasia.trim(),
        administrator_full_name: nomeAdmin.trim(),
      });
      if (rpc.error) throw rpc.error;

      setSuccess("Empresa criada com sucesso! Você já está logado como administrador.");
    } catch (erro) {
      setError(
        erro instanceof Error
          ? erro.message
          : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main className="cp-page">
        <div className="cp-card cp-card-glow">
          <div className="cp-success-icon">✓</div>
          <h1 className="cp-h1" style={{ textAlign: "center" }}>
            Tudo certo
          </h1>
          <p className="cp-sub" style={{ textAlign: "center" }}>{success}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="cp-page">
      <div className="cp-card">
        <div className="cp-brand">
          <span className="cp-brand-mark">Control$</span>
          <span className="cp-brand-premium">Premium</span>
        </div>
        <h1 className="cp-h1">
          {mode === "entrar" ? "Entrar" : "Criar minha empresa"}
        </h1>
        <p className="cp-sub">
          {mode === "entrar"
            ? "Acesse sua conta de administrador."
            : "Primeiro acesso? Crie sua empresa para começar a usar o Control$ Premium."}
        </p>

        {error && <div className="cp-error">{error}</div>}

        {mode === "entrar" ? (
          <form className="cp-form" onSubmit={handleEntrar}>
            <div className="cp-field">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="cp-field">
              <label htmlFor="senha">Senha</label>
              <input
                id="senha"
                type="password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <button className="cp-btn-primary" type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        ) : (
          <form className="cp-form" onSubmit={handleCriarEmpresa}>
            <div className="cp-field">
              <label htmlFor="nomeEmpresaLegal">Razão social</label>
              <input
                id="nomeEmpresaLegal"
                type="text"
                required
                value={nomeEmpresaLegal}
                onChange={(e) => setNomeEmpresaLegal(e.target.value)}
              />
            </div>
            <div className="cp-field">
              <label htmlFor="nomeFantasia">Nome fantasia</label>
              <input
                id="nomeFantasia"
                type="text"
                required
                value={nomeFantasia}
                onChange={(e) => setNomeFantasia(e.target.value)}
              />
            </div>
            <div className="cp-field">
              <label htmlFor="nomeAdmin">Seu nome completo</label>
              <input
                id="nomeAdmin"
                type="text"
                required
                value={nomeAdmin}
                onChange={(e) => setNomeAdmin(e.target.value)}
              />
            </div>
            <div className="cp-field">
              <label htmlFor="emailCriar">E-mail</label>
              <input
                id="emailCriar"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="cp-field">
              <label htmlFor="senhaCriar">Crie uma senha</label>
              <input
                id="senhaCriar"
                type="password"
                required
                minLength={8}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>
            <button className="cp-btn-primary" type="submit" disabled={loading}>
              {loading ? "Criando..." : "Criar empresa"}
            </button>
          </form>
        )}

        <p className="cp-sub" style={{ marginTop: 18, marginBottom: 0 }}>
          {mode === "entrar" ? (
            <>
              Ainda não tem empresa cadastrada?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("criar-empresa");
                  setError(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffd700",
                  cursor: "pointer",
                  padding: 0,
                  font: "inherit",
                }}
              >
                Criar agora
              </button>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("entrar");
                  setError(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffd700",
                  cursor: "pointer",
                  padding: 0,
                  font: "inherit",
                }}
              >
                Entrar
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}

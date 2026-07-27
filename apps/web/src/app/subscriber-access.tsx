"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

type Screen = "login" | "register";
const digits = (value: string, length: number) =>
  value.replace(/\D/g, "").slice(0, length);
const maskCpf = (value: string) =>
  digits(value, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");

function validCpf(value: string) {
  const cpf = digits(value, 11);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const check = (size: number) => {
    const sum = cpf
      .slice(0, size)
      .split("")
      .reduce(
        (total, number, index) => total + Number(number) * (size + 1 - index),
        0,
      );
    const result = (sum * 10) % 11;
    return (result === 10 ? 0 : result) === Number(cpf[size]);
  };
  return check(9) && check(10);
}

export function SubscriberAccess() {
  const [screen, setScreen] = useState<Screen>("login");
  const [showSplash, setShowSplash] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    companyName: "",
    email: "",
    cpf: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => setShowSplash(false),
      reducedMotion ? 350 : 2200,
    );
    return () => window.clearTimeout(timer);
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!validCpf(cpf) || password.length < 8) {
      setMessage({
        kind: "error",
        text: "Informe um CPF válido e sua senha.",
      });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/subscriber-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cpf: digits(cpf, 11), password }),
      });
      const body = (await response.json()) as {
        message?: string;
        accessToken?: string;
        refreshToken?: string;
      };
      if (
        !response.ok ||
        !body.accessToken ||
        !body.refreshToken ||
        !supabase
      ) {
        throw new Error(body.message ?? "Não foi possível entrar.");
      }
      const { error } = await supabase.auth.setSession({
        access_token: body.accessToken,
        refresh_token: body.refreshToken,
      });
      if (error) throw error;
      window.location.assign("/painel");
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error ? error.message : "Não foi possível entrar.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (
      !form.fullName.trim() ||
      !form.companyName.trim() ||
      !form.email.trim() ||
      !validCpf(form.cpf) ||
      form.password.length < 8
    ) {
      setMessage({
        kind: "error",
        text: "Preencha os dados, use um CPF válido e uma senha com 8 caracteres.",
      });
      return;
    }
    if (!supabase) {
      setMessage({
        kind: "error",
        text: "Cadastro indisponível no momento.",
      });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/?email-confirmado=1`,
          data: {
            account_type: "subscriber",
            cpf: digits(form.cpf, 11),
            full_name: form.fullName.trim(),
            company_name: form.companyName.trim(),
          },
        },
      });
      if (error) throw error;
      setMessage({
        kind: "success",
        text: "Cadastro recebido. Confirme o e-mail e depois entre usando seu CPF.",
      });
    } catch {
      setMessage({
        kind: "error",
        text: "Não foi possível concluir o cadastro. Confira os dados ou tente novamente.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {showSplash && (
        <div className="app-splash" aria-label="Abrindo Control Premium">
          <div className="splash-glow" />
          <div className="splash-content">
            <div className="splash-mark" aria-hidden="true">
              <span>C$</span>
              <i />
            </div>
            <div className="splash-name">
              <strong>Control$</strong>
              <span>Premium</span>
            </div>
            <p>Gestão segura. Crescimento inteligente.</p>
            <div className="splash-progress" aria-hidden="true">
              <i />
            </div>
          </div>
        </div>
      )}
      <main className="access-shell">
        <section className="access-hero">
          <a className="access-brand" href="/" aria-label="Control Premium">
            <span>Control$</span> Premium
          </a>
          <div className="hero-copy">
            <div className="secure-pill">
              <span aria-hidden="true">◇</span> Acesso seguro
            </div>
            <span className="eyebrow">Gestão de crédito simples e segura</span>
            <h1>Controle sua operação. Cresça no seu ritmo.</h1>
            <p>
              Clientes, propostas, parcelas e cobranças em um único painel.
              Comece gratuitamente e faça upgrade quando precisar.
            </p>
            <div className="trust-row">
              <span>✓ 7 dias de experiência</span>
              <span>✓ Até 15 clientes grátis</span>
              <span>✓ Sem cartão para começar</span>
            </div>
          </div>
          <div className="hero-foot">
            Seus dados protegidos e separados por empresa.
          </div>
        </section>

        <section className="access-panel">
          {screen === "login" && (
            <div className="access-card framed-card">
              <span className="eyebrow">Área do assinante</span>
              <h2>Bem-vindo de volta</h2>
              <p className="muted">
                Use o CPF cadastrado e sua senha para continuar.
              </p>
              <form onSubmit={login}>
                <label>
                  CPF
                  <input
                    value={cpf}
                    onChange={(event) => setCpf(maskCpf(event.target.value))}
                    inputMode="numeric"
                    autoComplete="username"
                    placeholder="000.000.000-00"
                  />
                </label>
                <label>
                  Senha
                  <span className="password-field">
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Sua senha"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={
                        showPassword ? "Ocultar senha" : "Mostrar senha"
                      }
                    >
                      {showPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  </span>
                </label>
                {message && (
                  <div className={`form-message ${message.kind}`}>
                    {message.text}
                  </div>
                )}
                <button className="primary-button" disabled={busy}>
                  {busy ? "Entrando..." : "Entrar e continuar"}
                </button>
              </form>
              <div className="security-badges" aria-label="Proteções do acesso">
                <span>◇ Conexão criptografada</span>
                <span>✓ Dados protegidos</span>
              </div>
              <div className="signup-prompt">
                Ainda não tem conta?{" "}
                <button
                  onClick={() => {
                    setMessage(null);
                    setScreen("register");
                  }}
                >
                  Cadastre-se
                </button>
              </div>
              <a className="client-link" href="/prototype.html">
                Sou cliente de uma empresa
              </a>
            </div>
          )}

          {screen === "register" && (
            <div className="access-card framed-card register-card">
              <button
                className="back-button"
                onClick={() => {
                  setMessage(null);
                  setScreen("login");
                }}
              >
                ← Voltar para entrar
              </button>
              <span className="eyebrow">Plano gratuito</span>
              <h2>Crie sua conta</h2>
              <div className="plan-summary">
                <strong>Grátis para começar</strong>
                <span>
                  7 dias de experiência • até 15 clientes • operação manual
                </span>
              </div>
              <div className="plan-options" aria-label="Planos disponíveis">
                <div className="plan-option selected">
                  <span>Plano atual</span>
                  <strong>Free</strong>
                  <small>15 clientes, lançamentos e cobranças manuais.</small>
                </div>
                <div className="plan-option">
                  <span>Upgrade</span>
                  <strong>Premium recorrente</strong>
                  <small>
                    Mais clientes e automações. Cartão pelo checkout seguro do
                    provedor.
                  </small>
                </div>
              </div>
              <form onSubmit={register}>
                <div className="field-grid">
                  <label>
                    Seu nome
                    <input
                      value={form.fullName}
                      onChange={(event) =>
                        setForm({ ...form, fullName: event.target.value })
                      }
                      autoComplete="name"
                      placeholder="Nome completo"
                    />
                  </label>
                  <label>
                    Empresa
                    <input
                      value={form.companyName}
                      onChange={(event) =>
                        setForm({ ...form, companyName: event.target.value })
                      }
                      autoComplete="organization"
                      placeholder="Nome da empresa"
                    />
                  </label>
                </div>
                <label>
                  E-mail de confirmação
                  <input
                    value={form.email}
                    onChange={(event) =>
                      setForm({ ...form, email: event.target.value })
                    }
                    type="email"
                    autoComplete="email"
                    placeholder="voce@empresa.com"
                  />
                </label>
                <div className="field-grid">
                  <label>
                    CPF do assinante
                    <input
                      value={form.cpf}
                      onChange={(event) =>
                        setForm({ ...form, cpf: maskCpf(event.target.value) })
                      }
                      inputMode="numeric"
                      autoComplete="username"
                      placeholder="000.000.000-00"
                    />
                  </label>
                  <label>
                    Senha
                    <input
                      value={form.password}
                      onChange={(event) =>
                        setForm({ ...form, password: event.target.value })
                      }
                      type="password"
                      autoComplete="new-password"
                      placeholder="Mínimo 8 caracteres"
                    />
                  </label>
                </div>
                {message && (
                  <div className={`form-message ${message.kind}`}>
                    {message.text}
                  </div>
                )}
                <button className="primary-button" disabled={busy}>
                  {busy ? "Criando..." : "Criar conta grátis"}
                </button>
                <small>
                  Ao continuar, você aceita os termos do serviço. Nenhuma
                  cobrança será feita agora.
                </small>
              </form>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

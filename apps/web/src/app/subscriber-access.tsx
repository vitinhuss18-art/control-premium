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
const maskPhone = (value: string) =>
  digits(value, 11)
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
const validEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

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
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registerAttempted, setRegisterAttempted] = useState(false);
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    companyName: "",
    email: "",
    confirmEmail: "",
    phone: "",
    cpf: "",
    password: "",
    confirmPassword: "",
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

  function goToScreen(nextScreen: Screen) {
    setMessage(null);
    setRegisterAttempted(false);
    setScreen(nextScreen);
    window.requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "auto" }),
    );
  }

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
    setRegisterAttempted(true);
    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedConfirmEmail = form.confirmEmail.trim().toLowerCase();
    const phoneDigits = digits(form.phone, 11);
    if (
      !form.fullName.trim() ||
      !form.companyName.trim() ||
      !validEmail(normalizedEmail) ||
      normalizedEmail !== normalizedConfirmEmail ||
      phoneDigits.length !== 11 ||
      !validCpf(form.cpf) ||
      form.password.length < 8 ||
      !/[A-Za-z]/.test(form.password) ||
      !/\d/.test(form.password) ||
      form.password !== form.confirmPassword
    ) {
      setMessage({
        kind: "error",
        text: "Revise os campos destacados para concluir seu cadastro.",
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
        email: normalizedEmail,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/?email-confirmado=1`,
          data: {
            account_type: "subscriber",
            cpf: digits(form.cpf, 11),
            full_name: form.fullName.trim(),
            company_name: form.companyName.trim(),
            phone: phoneDigits,
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
      <main
        className={`access-shell ${screen === "register" ? "register-mode" : ""}`}
      >
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
                <button onClick={() => goToScreen("register")}>
                  Cadastre-se
                </button>
              </div>
              <a className="client-link" href="/prototype.html">
                Sou cliente de uma empresa
              </a>
            </div>
          )}

          {screen === "register" && (
            <div className="registration-flow">
              <div className="register-heading">
                <div className="secure-pill">
                  <span aria-hidden="true">◇</span> Novo acesso seguro
                </div>
                <span className="eyebrow">Control$ Premium</span>
                <h2>Crie sua conta</h2>
                <p>
                  Cadastre-se para centralizar clientes, contratos e recebíveis.
                </p>
              </div>

              <div className="access-card framed-card register-card">
                <button
                  className="back-button"
                  onClick={() => goToScreen("login")}
                >
                  ← Voltar para entrar
                </button>
                <h3>Dados de acesso</h3>
                <p className="muted">
                  Preencha as informações abaixo para abrir sua conta.
                </p>
                <form onSubmit={register} noValidate>
                  <label>
                    Nome completo
                    <input
                      className={
                        registerAttempted && !form.fullName.trim()
                          ? "invalid"
                          : ""
                      }
                      value={form.fullName}
                      onChange={(event) =>
                        setForm({ ...form, fullName: event.target.value })
                      }
                      autoComplete="name"
                      placeholder="Nome completo"
                    />
                    {registerAttempted && !form.fullName.trim() && (
                      <span className="field-error">
                        Informe seu nome completo.
                      </span>
                    )}
                  </label>
                  <label>
                    Nome da empresa
                    <input
                      className={
                        registerAttempted && !form.companyName.trim()
                          ? "invalid"
                          : ""
                      }
                      value={form.companyName}
                      onChange={(event) =>
                        setForm({ ...form, companyName: event.target.value })
                      }
                      autoComplete="organization"
                      placeholder="Nome da empresa"
                    />
                    {registerAttempted && !form.companyName.trim() && (
                      <span className="field-error">
                        Informe o nome da empresa.
                      </span>
                    )}
                  </label>
                  <label>
                    E-mail
                    <input
                      className={
                        registerAttempted && !validEmail(form.email)
                          ? "invalid"
                          : ""
                      }
                      value={form.email}
                      onChange={(event) =>
                        setForm({ ...form, email: event.target.value })
                      }
                      type="email"
                      autoComplete="email"
                      placeholder="voce@empresa.com"
                    />
                    {registerAttempted && !validEmail(form.email) && (
                      <span className="field-error">
                        Informe um e-mail válido.
                      </span>
                    )}
                  </label>
                  <label>
                    Confirme seu e-mail
                    <input
                      className={
                        registerAttempted &&
                        (!form.confirmEmail.trim() ||
                          form.email.trim().toLowerCase() !==
                            form.confirmEmail.trim().toLowerCase())
                          ? "invalid"
                          : ""
                      }
                      value={form.confirmEmail}
                      onChange={(event) =>
                        setForm({ ...form, confirmEmail: event.target.value })
                      }
                      type="email"
                      autoComplete="email"
                      placeholder="Digite novamente seu e-mail"
                    />
                    {registerAttempted &&
                      (!form.confirmEmail.trim() ||
                        form.email.trim().toLowerCase() !==
                          form.confirmEmail.trim().toLowerCase()) && (
                        <span className="field-error">
                          Os e-mails precisam ser iguais.
                        </span>
                      )}
                  </label>
                  <label>
                    Telefone
                    <input
                      className={
                        registerAttempted &&
                        digits(form.phone, 11).length !== 11
                          ? "invalid"
                          : ""
                      }
                      value={form.phone}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          phone: maskPhone(event.target.value),
                        })
                      }
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(00) 00000-0000"
                    />
                    {registerAttempted &&
                      digits(form.phone, 11).length !== 11 && (
                        <span className="field-error">
                          O telefone deve ter 11 dígitos, incluindo o DDD.
                        </span>
                      )}
                  </label>
                  <label>
                    CPF do assinante
                    <input
                      className={
                        registerAttempted && !validCpf(form.cpf)
                          ? "invalid"
                          : ""
                      }
                      value={form.cpf}
                      onChange={(event) =>
                        setForm({ ...form, cpf: maskCpf(event.target.value) })
                      }
                      inputMode="numeric"
                      autoComplete="username"
                      placeholder="000.000.000-00"
                    />
                    {registerAttempted && !validCpf(form.cpf) && (
                      <span className="field-error">
                        Informe um CPF válido.
                      </span>
                    )}
                  </label>
                  <label>
                    Senha
                    <span className="password-field">
                      <input
                        className={
                          registerAttempted &&
                          (form.password.length < 8 ||
                            !/[A-Za-z]/.test(form.password) ||
                            !/\d/.test(form.password))
                            ? "invalid"
                            : ""
                        }
                        value={form.password}
                        onChange={(event) =>
                          setForm({ ...form, password: event.target.value })
                        }
                        type={showRegisterPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Crie uma senha"
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() =>
                          setShowRegisterPassword((visible) => !visible)
                        }
                        aria-label={
                          showRegisterPassword
                            ? "Ocultar senha do cadastro"
                            : "Mostrar senha do cadastro"
                        }
                      >
                        {showRegisterPassword ? "Ocultar" : "Mostrar"}
                      </button>
                    </span>
                  </label>
                  <div
                    className="password-rules"
                    aria-label="Requisitos da senha"
                  >
                    <span className={form.password.length >= 8 ? "met" : ""}>
                      {form.password.length >= 8 ? "✓" : "○"} Mínimo de 8
                      caracteres
                    </span>
                    <span
                      className={
                        /[A-Za-z]/.test(form.password) &&
                        /\d/.test(form.password)
                          ? "met"
                          : ""
                      }
                    >
                      {/[A-Za-z]/.test(form.password) &&
                      /\d/.test(form.password)
                        ? "✓"
                        : "○"}{" "}
                      Use letras e números
                    </span>
                  </div>
                  <label>
                    Confirmar senha
                    <span className="password-field">
                      <input
                        className={
                          registerAttempted &&
                          (!form.confirmPassword ||
                            form.password !== form.confirmPassword)
                            ? "invalid"
                            : ""
                        }
                        value={form.confirmPassword}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            confirmPassword: event.target.value,
                          })
                        }
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Digite novamente sua senha"
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() =>
                          setShowConfirmPassword((visible) => !visible)
                        }
                        aria-label={
                          showConfirmPassword
                            ? "Ocultar confirmação de senha"
                            : "Mostrar confirmação de senha"
                        }
                      >
                        {showConfirmPassword ? "Ocultar" : "Mostrar"}
                      </button>
                    </span>
                    {registerAttempted &&
                      (!form.confirmPassword ||
                        form.password !== form.confirmPassword) && (
                        <span className="field-error">
                          As senhas precisam ser iguais.
                        </span>
                      )}
                  </label>

                  <div className="plan-summary">
                    <strong>Plano Free para começar</strong>
                    <span>
                      7 dias de experiência • até 15 clientes • sem cartão agora
                    </span>
                  </div>
                  <div className="plan-options" aria-label="Planos disponíveis">
                    <div className="plan-option selected">
                      <span>Plano inicial</span>
                      <strong>Free</strong>
                      <small>15 clientes e operação manual.</small>
                    </div>
                    <div className="plan-option">
                      <span>Upgrade</span>
                      <strong>Premium recorrente</strong>
                      <small>Mais clientes, automações e cartão seguro.</small>
                    </div>
                  </div>

                  {message && (
                    <div className={`form-message ${message.kind}`}>
                      {message.text}
                    </div>
                  )}
                  <small className="terms-note">
                    Ao finalizar, você confirma que os dados informados são
                    verdadeiros. Nenhuma cobrança será feita agora.
                  </small>
                  <button className="primary-button" disabled={busy}>
                    {busy ? "Criando..." : "Criar conta e continuar"}
                  </button>
                </form>
                <div
                  className="security-badges"
                  aria-label="Benefícios do cadastro"
                >
                  <span>◇ Dados protegidos</span>
                  <span>⚡ Ativação rápida</span>
                </div>
                <div className="signup-prompt">
                  Já tem conta?{" "}
                  <button onClick={() => goToScreen("login")}>Entrar</button>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

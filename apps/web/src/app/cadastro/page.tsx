"use client";

import { useState } from "react";
import "./cadastro.css";

type PhotoKey = "foto" | "docFrente" | "docVerso" | "fachada";

type PhotoState = {
  file: File | null;
  preview: string | null;
};

const EMPTY_PHOTO: PhotoState = { file: null, preview: null };

function maskCpf(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (!d) return "";
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (d.length <= 2) return `(${ddd}`;
  if (d.length <= 6) return `(${ddd}) ${rest}`;
  if (d.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

function maskCurrency(value: string): string {
  const d = value.replace(/\D/g, "");
  if (!d) return "";
  const n = Number(d) / 100;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function CadastroPage() {
  const [form, setForm] = useState({
    fullName: "",
    cpf: "",
    instagram: "",
    pixKey: "",
    whatsapp: "",
    sms: "",
    address: "",
    region: "",
    loanAmount: "",
  });
  const [photos, setPhotos] = useState<Record<PhotoKey, PhotoState>>({
    foto: EMPTY_PHOTO,
    docFrente: EMPTY_PHOTO,
    docVerso: EMPTY_PHOTO,
    fachada: EMPTY_PHOTO,
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("token"),
  );

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onPhoto(key: PhotoKey, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setPhotos((prev) => ({ ...prev, [key]: EMPTY_PHOTO }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Cada foto deve ter no máximo 10 MB.");
      e.target.value = "";
      return;
    }
    const preview = URL.createObjectURL(file);
    setPhotos((prev) => ({ ...prev, [key]: { file, preview } }));
  }

  function validate(): string | null {
    if (!form.fullName.trim() || form.fullName.trim().length < 3)
      return "Informe seu nome completo.";
    const cpfDigits = form.cpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11) return "CPF inválido.";
    if (!form.whatsapp.replace(/\D/g, "")) return "Informe seu WhatsApp.";
    if (!form.address.trim()) return "Informe seu endereço.";
    if (!form.region.trim()) return "Informe sua região.";
    if (!form.loanAmount.replace(/\D/g, "")) return "Informe o valor desejado.";
    for (const key of Object.keys(photos) as PhotoKey[]) {
      if (!photos[key].file) return "Envie todas as 4 fotos obrigatórias.";
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("token", token ?? "");
      fd.append("fullName", form.fullName.trim());
      fd.append("cpf", form.cpf.replace(/\D/g, ""));
      fd.append("instagram", form.instagram.trim());
      fd.append("pixKey", form.pixKey.trim());
      fd.append("whatsapp", form.whatsapp.replace(/\D/g, ""));
      fd.append("sms", form.sms.replace(/\D/g, ""));
      fd.append("address", form.address.trim());
      fd.append("region", form.region.trim());
      fd.append("loanAmountCents", form.loanAmount.replace(/\D/g, ""));
      (Object.keys(photos) as PhotoKey[]).forEach((key) => {
        const f = photos[key].file;
        if (f) fd.append(key, f);
      });

      const res = await fetch("/api/cadastro", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.message ?? "Não foi possível enviar sua proposta.",
        );
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="cp-page">
        <div className="cp-card cp-card-glow">
          <div className="cp-success-icon">✓</div>
          <h1 className="cp-h1">Proposta enviada!</h1>
          <p className="cp-sub">
            Recebemos seus dados e fotos. Sua proposta está aguardando análise.
            Você receberá o resultado no WhatsApp informado.
          </p>
        </div>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="cp-page">
        <div className="cp-card">
          <h1 className="cp-h1">Link inválido</h1>
          <p className="cp-sub">
            Este link de cadastro não é válido ou já expirou. Peça um novo link
            a quem te convidou.
          </p>
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
        <h1 className="cp-h1">Proposta de empréstimo</h1>
        <p className="cp-sub">
          Preencha seus dados e envie as fotos. Sua proposta será analisada e
          você receberá o resultado no WhatsApp.
        </p>

        <form className="cp-form" onSubmit={onSubmit}>
          <div className="cp-field">
            <label htmlFor="fullName">Nome completo *</label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              placeholder="Ex: Mariana Santos"
            />
          </div>

          <div className="cp-row">
            <div className="cp-field">
              <label htmlFor="cpf">CPF *</label>
              <input
                id="cpf"
                type="text"
                inputMode="numeric"
                value={form.cpf}
                onChange={(e) => update("cpf", maskCpf(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
              />
            </div>
            <div className="cp-field">
              <label htmlFor="instagram">@ Instagram</label>
              <input
                id="instagram"
                type="text"
                value={form.instagram}
                onChange={(e) => update("instagram", e.target.value)}
                placeholder="@usuario"
              />
            </div>
          </div>

          <div className="cp-field">
            <label htmlFor="pixKey">Chave PIX</label>
            <input
              id="pixKey"
              type="text"
              value={form.pixKey}
              onChange={(e) => update("pixKey", e.target.value)}
              placeholder="CPF, e-mail, telefone ou chave"
            />
          </div>

          <div className="cp-row">
            <div className="cp-field">
              <label htmlFor="whatsapp">WhatsApp *</label>
              <input
                id="whatsapp"
                type="tel"
                inputMode="tel"
                value={form.whatsapp}
                onChange={(e) => update("whatsapp", maskPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                maxLength={15}
              />
            </div>
            <div className="cp-field">
              <label htmlFor="sms">SMS</label>
              <input
                id="sms"
                type="tel"
                inputMode="tel"
                value={form.sms}
                onChange={(e) => update("sms", maskPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                maxLength={15}
              />
            </div>
          </div>

          <div className="cp-row">
            <div className="cp-field">
              <label htmlFor="address">Endereço *</label>
              <input
                id="address"
                type="text"
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                placeholder="Rua, número, bairro"
              />
            </div>
            <div className="cp-field">
              <label htmlFor="region">Região *</label>
              <input
                id="region"
                type="text"
                value={form.region}
                onChange={(e) => update("region", e.target.value)}
                placeholder="Ex: Zona Sul"
              />
            </div>
          </div>

          <div className="cp-field">
            <label htmlFor="loanAmount">Valor do empréstimo desejado *</label>
            <input
              id="loanAmount"
              type="text"
              inputMode="numeric"
              value={form.loanAmount}
              onChange={(e) =>
                update("loanAmount", maskCurrency(e.target.value))
              }
              placeholder="R$ 0,00"
            />
          </div>

          <div className="cp-section-title">Documentos obrigatórios</div>

          <PhotoUpload
            label="Foto do cliente *"
            capture="user"
            state={photos.foto}
            onChange={(e) => onPhoto("foto", e)}
          />

          <div className="cp-row">
            <PhotoUpload
              label="RG ou CNH (frente) *"
              state={photos.docFrente}
              onChange={(e) => onPhoto("docFrente", e)}
            />
            <PhotoUpload
              label="RG ou CNH (verso) *"
              state={photos.docVerso}
              onChange={(e) => onPhoto("docVerso", e)}
            />
          </div>

          <PhotoUpload
            label="Foto da casa ou comércio *"
            state={photos.fachada}
            onChange={(e) => onPhoto("fachada", e)}
          />

          {error && <div className="cp-error">{error}</div>}

          <button
            type="submit"
            className="cp-btn-primary"
            disabled={submitting}
          >
            {submitting ? "Enviando..." : "Enviar proposta"}
          </button>
        </form>
      </div>
    </main>
  );
}

function PhotoUpload({
  label,
  capture,
  state,
  onChange,
}: {
  label: string;
  capture?: "user" | "environment";
  state: PhotoState;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const id = label.replace(/\W/g, "");
  return (
    <div className="cp-photo-field">
      <label htmlFor={id}>{label}</label>
      <div className="cp-photo-box">
        {state.preview ? (
          <img src={state.preview} alt={label} className="cp-photo-preview" />
        ) : (
          <span className="cp-photo-placeholder">📷</span>
        )}
        <input
          id={id}
          type="file"
          accept="image/*"
          capture={capture}
          onChange={onChange}
          className="cp-photo-input"
        />
      </div>
    </div>
  );
}

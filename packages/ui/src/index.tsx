import type { CSSProperties, PropsWithChildren } from "react";

export const controlTokens = {
  background: "#050607",
  surface: "#101214",
  primary: "#d7b35a",
  text: "#f8f8f8",
  muted: "#9ea1a6",
  danger: "#ff5252",
} as const;

const viewportStyle: CSSProperties = {
  width: "100vw",
  height: "100dvh",
  border: 0,
  display: "block",
  background: controlTokens.background,
};

export function PrototypeFrame({ src, title }: { src: string; title: string }) {
  return (
    <main
      style={{
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
        background: controlTokens.background,
      }}
    >
      <iframe
        src={src}
        title={title}
        style={viewportStyle}
        allow="clipboard-write; geolocation"
      />
    </main>
  );
}

export function PremiumCard({ children }: PropsWithChildren) {
  return (
    <section
      style={{
        padding: 16,
        border: "1px solid rgba(215, 179, 90, 0.22)",
        borderRadius: 16,
        color: controlTokens.text,
        background: controlTokens.surface,
      }}
    >
      {children}
    </section>
  );
}

export function PrimaryButton({
  children,
  ...props
}: PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button
      {...props}
      style={{
        minHeight: 44,
        padding: "0 18px",
        border: 0,
        borderRadius: 12,
        color: "#050607",
        fontWeight: 800,
        background: controlTokens.primary,
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

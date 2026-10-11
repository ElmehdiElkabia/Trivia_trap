"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
let initialized = false;
let activeCredentialHandler: ((credential: string) => void) | null = null;

type GoogleIdentity = {
  initialize: (options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode: "popup";
    auto_select: boolean;
    use_fedcm_for_button: boolean;
  }) => void;
  renderButton: (element: HTMLElement, options: {
    theme: "outline";
    size: "large";
    text: "continue_with";
    shape: "pill";
    width: number;
  }) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

export function GoogleSignIn({ disabled, onCredential }: {
  disabled: boolean;
  onCredential: (credential: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = container.current;
    const identity = window.google?.accounts.id;
    if (!ready || !clientId || !element || !identity) return;

    activeCredentialHandler = onCredential;
    if (!initialized) {
      identity.initialize({
        client_id: clientId,
        callback: ({ credential }) => activeCredentialHandler?.(credential),
        ux_mode: "popup",
        auto_select: false,
        use_fedcm_for_button: true,
      });
      initialized = true;
    }
    identity.renderButton(element, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
      width: Math.min(element.clientWidth, 400),
    });
    return () => {
      if (activeCredentialHandler === onCredential) activeCredentialHandler = null;
      element.replaceChildren();
    };
  }, [ready, onCredential]);

  if (!clientId) {
    return <p role="status" className="text-center text-sm text-trap-text-dim">Google sign-in is not configured yet. Please use email.</p>;
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        onReady={() => setReady(true)}
        onError={() => setFailed(true)}
      />
      <div inert={disabled} aria-busy={disabled} className={disabled ? "opacity-50" : undefined}>
        <div ref={container} className="flex min-h-10 w-full justify-center overflow-hidden rounded-full" />
      </div>
      {(!ready || failed) && <p role="status" className="text-center text-sm text-trap-text-dim">
        {failed ? "Could not load Google sign-in. Reload the page or use email." : "Loading Google sign-in…"}
      </p>}
    </>
  );
}

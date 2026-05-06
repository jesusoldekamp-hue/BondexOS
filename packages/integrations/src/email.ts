import type { ExternalAdapter, IntegrationHealth, IntegrationMode } from "./base.js";

// ────────────────────────────────────────────────────────────
// Email Adapter
// ────────────────────────────────────────────────────────────

export interface EmailMessage {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}

export interface EmailSendResult {
  messageId: string;
  sentAt: string;
  provider: string;
}

export interface EmailAdapter extends ExternalAdapter {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface EmailAdapterOptions {
  mode?: IntegrationMode;
  fromAddress?: string;
  apiKey?: string;
  apiBaseUrl?: string;
}

export function createEmailAdapter(options: EmailAdapterOptions = {}): EmailAdapter {
  const mode = options.mode ?? "sandbox";

  return {
    provider: "Email",
    mode,

    async health(): Promise<IntegrationHealth> {
      return {
        provider: "Email",
        mode,
        ok: mode === "sandbox" || !!options.apiKey,
        checkedAt: new Date().toISOString(),
        detail: mode === "sandbox" ? "Email sandbox activo (logs a consola)." : "Email real configurado."
      };
    },

    async send(message: EmailMessage): Promise<EmailSendResult> {
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      if (mode === "sandbox") {
        console.log(`[EMAIL SANDBOX] Para: ${message.to}`);
        console.log(`[EMAIL SANDBOX] Asunto: ${message.subject}`);
        console.log(`[EMAIL SANDBOX] Cuerpo: ${message.bodyText ?? message.bodyHtml.slice(0, 200)}`);
        return {
          messageId,
          sentAt: new Date().toISOString(),
          provider: "sandbox"
        };
      }

      if (!options.apiBaseUrl || !options.apiKey) {
        throw new Error("Email real requiere EMAIL_API_BASE_URL y EMAIL_API_KEY.");
      }

      const res = await fetch(`${options.apiBaseUrl}/api/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`
        },
        body: JSON.stringify({
          from: options.fromAddress ?? "noreply@bondexos.mx",
          ...message
        })
      });

      if (!res.ok) {
        throw new Error(`Email API respondio ${res.status}.`);
      }

      const data = (await res.json()) as { id?: string };
      return {
        messageId: data.id ?? messageId,
        sentAt: new Date().toISOString(),
        provider: "real"
      };
    }
  };
}

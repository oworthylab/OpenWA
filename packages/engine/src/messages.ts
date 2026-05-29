/**
 * Engine-facing message types. These are the wire-shape the engine accepts
 * from callers (e.g. the API Worker). They are intentionally smaller than the
 * full Baileys content surface — we expose only what the platform needs.
 */

export interface SendTextInput {
  to: string;
  text: string;
  /** Optional ID of a message to quote. */
  quotedMessageId?: string;
  /** Optional caller-supplied idempotency key. */
  externalId?: string;
}

export type SendMediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

export interface SendMediaInput {
  to: string;
  kind: SendMediaKind;
  /** One of these MUST be present. Validated upstream by @openwa/validators. */
  url?: string;
  base64?: string;
  /** Optional caption (image/video/document only). */
  caption?: string;
  /** Optional filename (document only). */
  filename?: string;
  /** Optional MIME hint when a URL omits it. */
  mimeType?: string;
  /** Voice-note flag for audio. */
  ptt?: boolean;
  quotedMessageId?: string;
  externalId?: string;
}

export interface SendResult {
  /** WhatsApp message ID assigned by the server (or the engine for local IDs). */
  id: string;
  to: string;
  timestamp: number;
}

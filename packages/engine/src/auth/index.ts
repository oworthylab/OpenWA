/**
 * Authentication strategy types for the engine.
 *
 * The engine itself does not implement any cryptography — it composes Baileys
 * (via the Node adapter) which already implements Noise_XX, Signal Protocol,
 * and key serialisation. The CF adapter shares the same `IAuthState` shape so
 * credentials produced on a Node host can be portable.
 */

export type AuthStrategy = { type: 'qr' } | { type: 'pairing-code'; phoneNumber: string };

export interface AuthState {
  /** Whether credentials are present and ready for a connection attempt. */
  isAuthenticated: boolean;
  /** Bare JID once authenticated (e.g. `6281234567890@s.whatsapp.net`). */
  jid?: string;
  /** Push name advertised to the server, if any. */
  pushName?: string;
}

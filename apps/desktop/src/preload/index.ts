/**
 * Preload script — exposes a typed `window.openwa` bridge to the
 * renderer using `contextBridge`. The renderer never touches Node APIs
 * directly; everything goes through the channels defined in
 * `@openwa/shared/desktop`.
 *
 * Type safety:
 *  - `invoke<C>(channel, request)` is constrained by {@link IpcInvokeMap}.
 *  - `on<C>(channel, listener)` returns a `dispose` fn so renderer
 *    effects can unsubscribe cleanly on unmount.
 */

import type {
  IpcEventChannel,
  IpcEventPayload,
  IpcInvokeChannel,
  IpcRequest,
  IpcResponse,
} from '@openwa/shared/desktop';
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

export interface OpenWADesktopBridge {
  invoke<C extends IpcInvokeChannel>(channel: C, request: IpcRequest<C>): Promise<IpcResponse<C>>;
  on<C extends IpcEventChannel>(
    channel: C,
    listener: (payload: IpcEventPayload<C>) => void,
  ): () => void;
}

const bridge: OpenWADesktopBridge = {
  invoke: <C extends IpcInvokeChannel>(
    channel: C,
    request: IpcRequest<C>,
  ): Promise<IpcResponse<C>> => ipcRenderer.invoke(channel, request) as Promise<IpcResponse<C>>,

  on: <C extends IpcEventChannel>(
    channel: C,
    listener: (payload: IpcEventPayload<C>) => void,
  ): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, ...args: unknown[]): void => {
      listener(args[0] as IpcEventPayload<C>);
    };
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('openwa', bridge);

declare global {
  interface Window {
    openwa: OpenWADesktopBridge;
  }
}

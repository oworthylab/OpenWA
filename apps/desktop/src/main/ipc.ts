/**
 * IPC handler registration — wires every channel in {@link IpcInvokeMap}
 * to its owning service. The wrapper enforces the typed request/response
 * contract so a drift between renderer + main fails at compile time.
 */

import type {
  IpcInvokeChannel,
  IpcInvokeMap,
  IpcRequest,
  IpcResponse,
} from '@openwa/shared/desktop';
import { app, ipcMain } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import type { EngineManager } from './engine-manager.js';
import type { SettingsStore } from './settings.js';
import type { UpdaterController } from './updater.js';

export interface IpcHandlerDeps {
  window: BrowserWindow;
  manager: EngineManager;
  settings: SettingsStore;
  updater: UpdaterController;
}

type Handler<C extends IpcInvokeChannel> = (
  req: IpcRequest<C>,
  ctx: { event: IpcMainInvokeEvent },
) => Promise<IpcResponse<C>> | IpcResponse<C>;

type HandlerMap = { [C in IpcInvokeChannel]: Handler<C> };

export function registerIpcHandlers(deps: IpcHandlerDeps): () => void {
  const handlers = buildHandlers(deps);
  const channels = Object.keys(handlers) as IpcInvokeChannel[];
  for (const channel of channels) {
    ipcMain.handle(channel, (event, ...args) => {
      const handler = handlers[channel] as Handler<IpcInvokeChannel>;
      const req = (args[0] ?? undefined) as IpcRequest<IpcInvokeChannel>;
      return Promise.resolve(handler(req, { event }));
    });
  }
  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
  };
}

function buildHandlers(deps: IpcHandlerDeps): HandlerMap {
  const { manager, settings, updater, window } = deps;
  return {
    'app:getInfo': () => ({
      version: app.getVersion(),
      channel: resolveChannel(),
      platform: process.platform,
      userDataPath: app.getPath('userData'),
    }),
    'app:getSettings': () => settings.get(),
    'app:updateSettings': (patch) => settings.update(patch),
    'app:quit': () => {
      window.hide();
      app.quit();
    },

    'session:list': () => manager.list(),
    'session:create': (req) => manager.create(req),
    'session:start': (req) => manager.start(req.id),
    'session:stop': (req) => manager.stop(req.id),
    'session:restart': (req) => manager.restart(req.id),
    'session:remove': (req) => manager.remove(req.id),
    'session:logout': (req) => manager.logout(req.id),
    'session:requestQr': (req) => manager.requestQr(req.id),

    'updater:check': () => updater.checkNow(),
    'updater:installNow': () => updater.installNow(),
  };
}

function resolveChannel(): IpcInvokeMap['app:getInfo']['response']['channel'] {
  const v = app.getVersion();
  if (v.includes('beta')) return 'beta';
  if (v.includes('dev') || v.includes('alpha')) return 'dev';
  return 'stable';
}

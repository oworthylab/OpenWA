// OpenWA desktop — Tauri 2 entry point.
//
// On startup:
//  1. Pick a free localhost port for the wa-bridge sidecar.
//  2. Spawn `node bridge.cjs` from app resources, pointing its auth dir
//     at `<app local data>/wa-auth/`.
//  3. Wait until `.bridge-config.json` appears, read `bridgeToken`.
//  4. Expose `bridge_info()` to the frontend so the UI knows where to
//     talk and which bearer token to send.
//  5. On window close, SIGTERM the child so we don't leave Node behind.
//
// We deliberately do not try to reimplement any of the bridge's logic
// in Rust — the bridge already speaks a tiny HTTP API the UI can call
// directly with `fetch`.

use std::{
    net::TcpListener,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use once_cell::sync::OnceCell;
use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent, State};

#[derive(Default, Clone)]
struct BridgeProcess(Arc<Mutex<Option<Child>>>);

#[derive(Clone, Serialize)]
struct BridgeInfo {
    base_url: String,
    token: String,
}

static BRIDGE_INFO: OnceCell<BridgeInfo> = OnceCell::new();

fn pick_free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    drop(listener);
    Ok(port)
}

fn resource_path(app: &AppHandle, rel: &str) -> Result<PathBuf, String> {
    app.path()
        .resolve(rel, tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("resource {rel}: {e}"))
}

fn node_binary(app: &AppHandle) -> Result<PathBuf, String> {
    // We ship a portable Node binary alongside the app. fetch-node.mjs
    // places it under `resources/node/<platform>/node[.exe]`.
    #[cfg(target_os = "windows")]
    let rel = "resources/node/node.exe";
    #[cfg(not(target_os = "windows"))]
    let rel = "resources/node/node";

    let path = resource_path(app, rel)?;
    if !path.exists() {
        return Err(format!(
            "bundled Node binary missing at {} — run `npm run prepare:node`",
            path.display()
        ));
    }
    Ok(path)
}

fn auth_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("wa-auth");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn spawn_bridge(app: &AppHandle) -> Result<(Child, BridgeInfo), String> {
    let port = pick_free_port()?;
    let node = node_binary(app)?;
    let bridge_js = resource_path(app, "resources/bridge.cjs")?;
    if !bridge_js.exists() {
        return Err(format!(
            "bundled bridge missing at {} — run `npm run prepare:bridge`",
            bridge_js.display()
        ));
    }
    let auth = auth_dir(app)?;
    let log_file = auth.join("bridge.log");

    let logs_out = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .map_err(|e| format!("open log {}: {e}", log_file.display()))?;
    let logs_err = logs_out.try_clone().map_err(|e| e.to_string())?;

    eprintln!(
        "[openwa] spawning bridge: {} {} (port={port}, auth={})",
        node.display(),
        bridge_js.display(),
        auth.display()
    );

    let child = Command::new(&node)
        .arg(&bridge_js)
        .env("BRIDGE_HOST", "127.0.0.1")
        .env("BRIDGE_PORT", port.to_string())
        .env("BRIDGE_AUTH_DIR", &auth)
        .env("LOG_LEVEL", "info")
        // No webhook in desktop mode — UI subscribes via polling.
        .env_remove("BRIDGE_WEBHOOK_URL")
        .stdin(Stdio::null())
        .stdout(Stdio::from(logs_out))
        .stderr(Stdio::from(logs_err))
        .spawn()
        .map_err(|e| format!("spawn bridge: {e}"))?;

    // Wait up to 15s for the bridge to write its config file and start
    // accepting connections.
    let cfg_path = auth.join(".bridge-config.json");
    let started = Instant::now();
    let mut token = None;
    while started.elapsed() < Duration::from_secs(15) {
        if cfg_path.exists() {
            if let Ok(bytes) = std::fs::read(&cfg_path) {
                if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                    if let Some(t) = json.get("bridgeToken").and_then(|v| v.as_str()) {
                        token = Some(t.to_string());
                        break;
                    }
                }
            }
        }
        thread::sleep(Duration::from_millis(150));
    }

    let token = token.ok_or_else(|| {
        format!(
            "bridge did not produce {} within 15s — see {}",
            cfg_path.display(),
            log_file.display()
        )
    })?;

    Ok((
        child,
        BridgeInfo {
            base_url: format!("http://127.0.0.1:{port}"),
            token,
        },
    ))
}

#[tauri::command]
fn bridge_info() -> Result<BridgeInfo, String> {
    BRIDGE_INFO
        .get()
        .cloned()
        .ok_or_else(|| "bridge not started yet".into())
}

#[tauri::command]
fn open_log_dir(app: AppHandle) -> Result<String, String> {
    let dir = auth_dir(&app)?;
    Ok(dir.display().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .manage(BridgeProcess::default())
        .invoke_handler(tauri::generate_handler![bridge_info, open_log_dir])
        .setup(|app| {
            let handle = app.handle().clone();
            // Spawn on a background thread so the window opens fast even
            // if Node takes a moment to come up. The frontend polls
            // `bridge_info()` until it succeeds.
            let proc_state: State<BridgeProcess> = app.state();
            let proc_handle = proc_state.0.clone();
            thread::spawn(move || match spawn_bridge(&handle) {
                Ok((child, info)) => {
                    if let Ok(mut guard) = proc_handle.lock() {
                        *guard = Some(child);
                    }
                    let _ = BRIDGE_INFO.set(info);
                }
                Err(e) => {
                    eprintln!("[openwa] bridge failed to start: {e}");
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri app")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                let state: State<BridgeProcess> = app.state();
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        });
}

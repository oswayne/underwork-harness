// UICP desktop shell (M0): hosts the dsh local web UI in a Tauri window and
// manages the dsh sidecar process. Process lifecycle (readiness probe, crash
// restart, exit linkage) lands incrementally per IMPLEMENTATION.md 11.2.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::{WebviewUrl, WebviewWindowBuilder};

struct DshProcess(Mutex<Option<Child>>);

/// Start the dsh sidecar (`pnpm dsh web`) once; no-op when already running.
#[tauri::command]
fn start_dsh(state: tauri::State<DshProcess>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(())
    }
    let child = Command::new("pnpm")
        .args(["dsh", "web"])
        .spawn()
        .map_err(|e| format!("spawn dsh: {e}"))?;
    *guard = Some(child);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(DshProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![start_dsh])
        .setup(|app| {
            let url = std::env::var("DSH_WEB_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:3080".into());
            let parsed: tauri::Url = url
                .parse()
                .map_err(|e| format!("invalid DSH_WEB_URL {url}: {e}"))?;
            let _window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
                .title("UICP Desktop")
                .inner_size(1280.0, 800.0)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// UICP desktop shell (M0): hosts the dsh local web UI in a Tauri window and
// manages the dsh sidecar process. Process lifecycle (readiness probe, crash
// restart, exit linkage) lands incrementally per IMPLEMENTATION.md 11.2.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/** dsh sidecar handle: current child plus the guardian shutdown flag. */
struct DshProcess {
    child: Mutex<Option<Child>>,
    shutdown: AtomicBool,
}
struct Token(Mutex<Option<String>>);

fn spawn_dsh() -> std::io::Result<Child> {
    Command::new("pnpm").args(["dsh", "web"]).spawn()
}

/// Read the stored platform token (keychain lands in a later milestone).
#[tauri::command]
fn get_token(state: tauri::State<Token>) -> Option<String> {
    state.0.lock().ok()?.clone()
}

/// Store the platform token.
#[tauri::command]
fn set_token(state: tauri::State<Token>, token: String) {
    if let Ok(mut guard) = state.0.lock() {
        *guard = Some(token);
    }
}

/// Clear the stored platform token.
#[tauri::command]
fn clear_token(state: tauri::State<Token>) {
    if let Ok(mut guard) = state.0.lock() {
        *guard = None;
    }
}

/// Absolute root of app-package directories (dev: the current working dir).
#[tauri::command]
fn app_packages_root() -> Result<String, String> {
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    Ok(cwd.join("app-packages").to_string_lossy().into_owned())
}

fn main() {
    tauri::Builder::default()
        .manage(DshProcess {
            child: Mutex::new(None),
            shutdown: AtomicBool::new(false),
        })
        .manage(Token(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![get_token, set_token, clear_token, app_packages_root])
        .setup(|app| {
            // Guardian thread: spawn the dsh sidecar, restart on crash with
            // exponential backoff, and stop on the exit flag.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let state = handle.state::<DshProcess>();
                let mut backoff: u64 = 500;
                loop {
                    if state.shutdown.load(Ordering::SeqCst) {
                        return
                    }
                    let child = match spawn_dsh() {
                        Ok(child) => child,
                        Err(_) => {
                            std::thread::sleep(Duration::from_millis(backoff));
                            continue
                        }
                    };
                    {
                        let mut guard = match state.child.lock() {
                            Ok(guard) => guard,
                            Err(_) => return,
                        };
                        *guard = Some(child);
                    }
                    let status = {
                        let mut guard = match state.child.lock() {
                            Ok(guard) => guard,
                            Err(_) => return,
                        };
                        match guard.as_mut() {
                            Some(child) => child.wait(),
                            None => continue,
                        }
                    };
                    if status.is_err() {
                        return
                    }
                    std::thread::sleep(Duration::from_millis(backoff));
                    backoff = (backoff * 2).min(16_000);
                }
            });
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Exit linkage: stop the guardian and best-effort kill the child.
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<DshProcess>();
                state.shutdown.store(true, Ordering::SeqCst);
                if let Ok(mut guard) = state.child.try_lock() {
                    if let Some(child) = guard.as_mut() {
                        let _ = child.kill();
                    }
                }
            }
        });
}

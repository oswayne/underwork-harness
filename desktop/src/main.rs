// UICP desktop shell (M0): hosts the dsh local web UI in a Tauri window and
// manages the dsh sidecar process. Process lifecycle (readiness probe, crash
// restart, exit linkage) lands incrementally per IMPLEMENTATION.md 11.2.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/** dsh sidecar handle: current child plus the guardian shutdown flag. */
struct DshProcess {
    child: Mutex<Option<Child>>,
    shutdown: AtomicBool,
}

/// Platform token persisted to the app data directory (keychain lands in a
/// later milestone): the value survives restarts so the web UI can validate
/// it against the platform instead of asking for a new one.
struct Token {
    value: Mutex<Option<String>>,
    file: PathBuf,
}

impl Token {
    /// Load the persisted token; a missing or blank file means signed out.
    fn new(file: PathBuf) -> Self {
        let value = fs::read_to_string(&file)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        Self { value: Mutex::new(value), file }
    }

    /// Store the token and persist it to disk.
    fn set(&self, token: String) {
        if let Some(parent) = self.file.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(mut guard) = self.value.lock() {
            *guard = Some(token.clone());
            let _ = fs::write(&self.file, token);
        }
    }

    /// Clear the token and remove its persisted file.
    fn clear(&self) {
        if let Ok(mut guard) = self.value.lock() {
            *guard = None;
        }
        let _ = fs::remove_file(&self.file);
    }
}

fn spawn_dsh() -> std::io::Result<Child> {
    // Port 0 lets the OS assign a free port; the sidecar prints the actual
    // URL (`dsh web: http://127.0.0.1:<port>`) as its readiness line.
    Command::new("pnpm")
        .args(["dsh", "web", "--port", "0"])
        .stdout(Stdio::piped())
        .spawn()
}

/// True when the dsh sidecar accepts HTTP requests at the given URL.
fn server_ready(url: &tauri::Url) -> bool {
    let Some(addr) = url.socket_addrs(|| None).ok().and_then(|addrs| addrs.into_iter().next()) else {
        return false
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
        return false
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let request = format!("GET / HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n", url.authority());
    if stream.write_all(request.as_bytes()).is_err() {
        return false
    }
    let mut buf = [0u8; 128];
    let Ok(n) = stream.read(&mut buf) else { return false };
    String::from_utf8_lossy(&buf[..n]).starts_with("HTTP/1.1 200")
}

/// Read the stored platform token (keychain lands in a later milestone).
#[tauri::command]
fn get_token(state: tauri::State<Token>) -> Option<String> {
    state.value.lock().ok()?.clone()
}

/// Store the platform token.
#[tauri::command]
fn set_token(state: tauri::State<Token>, token: String) {
    state.set(token)
}

/// Clear the stored platform token.
#[tauri::command]
fn clear_token(state: tauri::State<Token>) {
    state.clear()
}

/// Absolute root of app-package directories. Dev resolution: the nearest
/// `app-packages` directory walking up from both the launch cwd and the
/// executable's own directory (Finder launches run with a root cwd, but the
/// binary lives inside the repo), overridable with `UICP_APP_PACKAGES_ROOT`.
fn resolve_app_packages_root() -> String {
    if let Ok(env) = std::env::var("UICP_APP_PACKAGES_ROOT") {
        if !env.is_empty() {
            return env
        }
    }
    let mut starts = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        starts.push(cwd)
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            starts.push(dir.to_path_buf())
        }
    }
    for start in starts {
        for ancestor in start.ancestors() {
            let candidate = ancestor.join("app-packages");
            if candidate.is_dir() {
                return candidate.to_string_lossy().into_owned()
            }
        }
    }
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    cwd.join("app-packages").to_string_lossy().into_owned()
}

#[tauri::command]
fn app_packages_root() -> Result<String, String> {
    Ok(resolve_app_packages_root())
}

/// Percent-encode a path for use as one URL query value (unreserved + `/`).
fn encode_query(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b'-' | b'_' | b'.' => out.push(byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn main() {
    tauri::Builder::default()
        .manage(DshProcess {
            child: Mutex::new(None),
            shutdown: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![get_token, set_token, clear_token, app_packages_root])
        .setup(|app| {
            // Persistent token file under the app data directory.
            let token_file = app.path().app_data_dir()
                .map_err(|e| format!("app data dir: {e}"))?
                .join("platform.token");
            app.manage(Token::new(token_file));
            // Guardian thread: spawn the dsh sidecar, restart on crash with
            // exponential backoff, navigate the window once the service is
            // ready, and stop on the exit flag.
            let handle = app.handle().clone();
            let explicit_url = std::env::var("DSH_WEB_URL").is_ok();
            let url = std::env::var("DSH_WEB_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:3080".into());
            let parsed: tauri::Url = url
                .parse()
                .map_err(|e| format!("invalid DSH_WEB_URL {url}: {e}"))?;
            let discovered = Arc::new(Mutex::new(None::<String>));
            let _window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Underwork Harness")
                .inner_size(1280.0, 800.0)
                .build()?;
            std::thread::spawn(move || {
                let state = handle.state::<DshProcess>();
                let mut backoff: u64 = 500;
                loop {
                    if state.shutdown.load(Ordering::SeqCst) {
                        return
                    }
                    let mut child = match spawn_dsh() {
                        Ok(child) => child,
                        Err(_) => {
                            std::thread::sleep(Duration::from_millis(backoff));
                            continue
                        }
                    };
                    let stdout = child.stdout.take();
                    {
                        let mut guard = match state.child.lock() {
                            Ok(guard) => guard,
                            Err(_) => return,
                        };
                        *guard = Some(child);
                    }
                    // Read the sidecar's readiness line to learn the
                    // OS-assigned port.
                    if let Some(stdout) = stdout {
                        let discovered = discovered.clone();
                        std::thread::spawn(move || {
                            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                                if let Some(url) = line.strip_prefix("dsh web: ") {
                                    if let Some(host) = url.split_whitespace().next() {
                                        if let Ok(mut guard) = discovered.lock() {
                                            *guard = Some(host.to_string());
                                        }
                                    }
                                }
                            }
                        });
                    }
                    // Wait for the sidecar to accept requests, then point the
                    // window at it; re-navigate after every restart.
                    let mut target = parsed.clone();
                    let mut ready = false;
                    for _ in 0..240 {
                        if state.shutdown.load(Ordering::SeqCst) {
                            return
                        }
                        if !explicit_url {
                            if let Ok(guard) = discovered.lock() {
                                if let Some(url) = guard.as_ref() {
                                    if let Ok(actual) = url.parse::<tauri::Url>() {
                                        target = actual;
                                    }
                                }
                            }
                        }
                        if server_ready(&target) {
                            ready = true;
                            break
                        }
                        std::thread::sleep(Duration::from_millis(500));
                    }
                    if ready {
                        // Hand the resolved app-packages root to the web UI
                        // through the page URL: the sidecar origin has no
                        // reliable IPC channel otherwise.
                        let root = encode_query(&resolve_app_packages_root());
                        let target = format!("{}?uicp-app-packages-root={root}", target.as_str());
                        let target = tauri::Url::parse(&target).unwrap_or(parsed.clone());
                        if let Some(window) = handle.get_webview_window("main") {
                            let _ = window.navigate(target);
                        }
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

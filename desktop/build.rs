fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "get_token",
                "set_token",
                "clear_token",
                "app_packages_root",
                "open_editor_window",
            ]),
        ),
    )
    .unwrap()
}

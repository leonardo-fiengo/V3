fn main() {
    #[cfg(feature = "desktop")]
    {
        let mut attributes = tauri_build::Attributes::new();
        if let Ok(alias) = std::env::var("MM_BUILD_ALIAS") {
            attributes = attributes.windows_attributes(
                tauri_build::WindowsAttributes::new()
                    .window_icon_path(format!("{alias}/src-tauri/icons/icon.ico")),
            );
        }
        tauri_build::try_build(attributes).expect("Could not prepare native resources");
    }
}

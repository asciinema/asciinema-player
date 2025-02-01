{
  description = "asciinema player";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    rust-overlay.url = "github:oxalica/rust-overlay";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      rust-overlay,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs { inherit system overlays; };
      in
      {
        devShells.default = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            nodejs_18
            typescript-language-server
            (rust-bin.stable."1.78.0".default.override { targets = [ "wasm32-unknown-unknown" ]; })
            binaryen
            python3
          ];

          shellHook = ''
            alias build='npm run build'
            alias serve='cd public && python -m http.server 5000'
          '';
        };
      }
    );
}

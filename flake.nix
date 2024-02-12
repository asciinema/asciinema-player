{
  description = "asciinema player";

  inputs = {
    nixpkgs.url = github:nixos/nixpkgs/nixpkgs-unstable;
    flake-utils.url = github:numtide/flake-utils;
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem
      (system:
        let pkgs = nixpkgs.legacyPackages.${system}; in
        {
          devShells.default = pkgs.mkShell {
            nativeBuildInputs = [
              pkgs.rustup
              pkgs.nodejs_18
              pkgs.python3
            ];

            shellHook = ''
              alias build='npm run build && npm run bundle'
              alias serve='cd public && python -m http.server 5000'
            '';
          };
        }
      );
}

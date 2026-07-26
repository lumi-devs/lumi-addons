{
  description = "Lumi Addons — Official modules, plugins, and command extensions for Lumi";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            nodejs_22
            git
            gh
            jq
            coreutils
          ];

          shellHook = ''
            echo "========================================="
            echo "  Lumi Addons Dev Shell (Flake)          "
            echo "========================================="
            echo "  Bun:        $(bun --version 2>/dev/null || echo 'N/A')"
            echo "  Node:       $(node --version 2>/dev/null || echo 'N/A')"
            echo "  Git:        $(git --version 2>/dev/null || echo 'N/A')"
            echo "  GitHub CLI: $(gh --version 2>/dev/null | head -n1 || echo 'N/A')"
            echo "========================================="
          '';
        };
      });

      formatter = forEachSystem (pkgs: pkgs.nixpkgs-fmt);
    };
}

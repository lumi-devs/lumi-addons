{
  description = "Lumi v2 addons dev shell";

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
            nodejs
            git
            jq
            biome
            stdenv.cc.cc.lib
          ];

          env = {
            BIOME_BINARY = "${pkgs.biome}/bin/biome";
          };

          shellHook = ''
            export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib:$LD_LIBRARY_PATH"
            echo "lumi addons · bun $(bun --version) · node $(node --version)"
            echo "Link a Lumi v2 checkout with: bun run setup"
          '';
        };
      });

      formatter = forEachSystem (pkgs: pkgs.nixpkgs-fmt);
    };
}

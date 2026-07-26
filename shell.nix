{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    bun
    nodejs_22
    gh
    git
  ];

  shellHook = ''
    echo "⚡ Lumi Addons Development Shell (Nix) initialized"
    echo "Bun $(bun --version) | Node $(node --version)"
  '';
}

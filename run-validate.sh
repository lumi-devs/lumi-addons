#!/usr/bin/env sh
cd /home/rebiz/opt/workdir/lumi-addons
nix develop --command bun run validate 2>&1
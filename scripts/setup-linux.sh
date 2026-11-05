#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
exec bash "$root/deployment/linux/install.sh" "$@"

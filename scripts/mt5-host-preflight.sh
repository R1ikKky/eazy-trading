#!/usr/bin/env bash
# Run on the VPS host. Default: read-only capacity report.
# --create-swap: add a dedicated 2 GiB swap file only if no swap is active.
set -euo pipefail
if [[ -f /.dockerenv ]]; then
  echo 'Run this on the VPS host, outside Docker.' >&2
  exit 1
fi
if [[ ${1:-} != '' && ${1:-} != --create-swap ]]; then
  echo 'Usage: bash scripts/mt5-host-preflight.sh [--create-swap]' >&2
  exit 1
fi
if [[ ${1:-} == --create-swap ]]; then
  if [[ $EUID -ne 0 ]]; then
    echo '--create-swap requires root on the VPS host.' >&2
    exit 1
  fi
  active_swap=$(awk 'NR>1 {total+=$3} END {print total+0}' /proc/swaps)
  if (( active_swap > 0 )); then
    echo 'Existing swap is active; keeping it without adding another file.'
  else
    swap_file=/swapfile-eazy
    if [[ -L $swap_file || ( -e $swap_file && ! -f $swap_file ) ]]; then
      echo "$swap_file is not a regular file. No changes made." >&2
      exit 1
    fi
    if [[ -e $swap_file ]]; then
      if [[ $(blkid -p -s TYPE -o value "$swap_file" 2>/dev/null || true) != swap ]]; then
        echo "$swap_file already exists and is not a swap file. No changes made." >&2
        exit 1
      fi
    else
      available_bytes=$(df -PB1 / | awk 'NR==2 {print $4}')
      if (( available_bytes < 5 * 1024 * 1024 * 1024 )); then
        echo 'Less than 5 GiB disk space is free; not creating a swap file.' >&2
        exit 1
      fi
      (umask 077; fallocate -l 2G "$swap_file")
      chmod 600 "$swap_file"
      mkswap "$swap_file" >/dev/null
    fi
    chmod 600 "$swap_file"
    swapon "$swap_file"
    if ! awk -v path="$swap_file" '$1==path {found=1} END {exit !found}' /etc/fstab; then
      cp -p /etc/fstab "/etc/fstab.eazy-backup-$(date +%Y%m%d%H%M%S)"
      printf '\n%s none swap sw 0 0\n' "$swap_file" >> /etc/fstab
    fi
    echo 'Dedicated 2 GiB swap enabled. Existing services were not restarted.'
  fi
fi
free -h
df -h /
echo 'Do not run the MT5 setup desktop and sync worker at the same time.'

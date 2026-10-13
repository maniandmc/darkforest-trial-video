#!/usr/bin/env bash
# encode.sh <frameDir> <out.mp4> [maxrate e.g. 30M] [fps]  — H.264 with the edited music
set -euo pipefail
DIR="$1"; OUT="$2"; RATE="${3:-30M}"; FPS="${4:-30}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BUF="$(( ${RATE%M} * 2 ))M"
ffmpeg -hide_banner -loglevel error -y -framerate "$FPS" -i "$DIR/f_%05d.png" -i "$HERE/audio/music_edit.wav" \
  -c:v libx264 -preset slow -crf 17 -maxrate "$RATE" -bufsize "$BUF" -profile:v high -pix_fmt yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 320k -ar 48000 -shortest -movflags +faststart "$OUT"
ffprobe -hide_banner -v error -show_entries format=duration,size,bit_rate -of default=nw=1 "$OUT"

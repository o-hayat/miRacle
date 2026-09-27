#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SCRATCH="$ROOT/artifacts/tmp"
SDK="${EMSDK:-$SCRATCH/emsdk}"
VERSION=2.7.2
EMSDK_VERSION=4.0.20
SHA=1ab5f4a4f76fc85a2243546088e45f5d85f2d7a56cc656e969b005cce9bfab5f
mkdir -p "$SCRATCH" "$ROOT/web/public/wasm"
if [ ! -f "$SDK/emsdk_env.sh" ]; then
  git clone --depth 1 https://github.com/emscripten-core/emsdk.git "$SDK"
fi
if [ ! -f "$SDK/upstream/emscripten/emcc" ]; then
  "$SDK/emsdk" install "$EMSDK_VERSION"
  "$SDK/emsdk" activate "$EMSDK_VERSION"
fi
source "$SDK/emsdk_env.sh"
emcc --version | head -1 | grep -F "$EMSDK_VERSION"
ARCHIVE="$SCRATCH/ViennaRNA-$VERSION.tar.gz"
if [ ! -f "$ARCHIVE" ]; then
  curl -fLsS "https://www.tbi.univie.ac.at/RNA/download/sourcecode/2_7_x/ViennaRNA-$VERSION.tar.gz" -o "$ARCHIVE"
fi
printf '%s  %s\n' "$SHA" "$ARCHIVE" | shasum -a 256 -c -
SOURCE="$SCRATCH/ViennaRNA-$VERSION"
if [ ! -d "$SOURCE" ]; then tar -xzf "$ARCHIVE" -C "$SCRATCH"; fi
cd "$SOURCE"
if [ ! -f Makefile ]; then
  emconfigure ./configure --host=wasm32-unknown-emscripten \
    --disable-shared --enable-static --disable-openmp --disable-pthreads \
    --disable-simd --disable-vectorize --disable-lto --disable-mpfr \
    --without-svm --without-gsl --without-swig --without-perl --without-python \
    --without-doc --without-cla --without-check --without-kinfold \
    --without-forester --without-rnalocmin --without-rnaxplorer \
    CFLAGS='-O3' CXXFLAGS='-O3'
fi
emmake make -C src/ViennaRNA -j "${BUILD_JOBS:-4}"
emcc -O3 -I. -Isrc "$ROOT/wasm/bridge.c" src/ViennaRNA/.libs/libRNA.a \
  -o "$ROOT/web/public/wasm/vienna-2.7.2.mjs" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=536870912 \
  -sFILESYSTEM=0 -sNO_EXIT_RUNTIME=1 \
  '-sEXPORTED_FUNCTIONS=["_miracle_fold","_miracle_layout","_malloc","_free"]' \
  '-sEXPORTED_RUNTIME_METHODS=["ccall","UTF8ToString","HEAPF32","HEAPU8"]'
cp COPYING "$ROOT/web/public/wasm/ViennaRNA-LICENSE.txt"
sed -n '1,/^\*\//p' src/ViennaRNA/plotting/naview/naview.c > "$ROOT/web/public/wasm/NAVIEW-LICENSE.txt"
printf 'ViennaRNA %s; Emscripten %s; source SHA256 %s\n' "$VERSION" "$EMSDK_VERSION" "$SHA" > "$ROOT/web/public/wasm/BUILD.txt"

// Baseed on VPMPackageAutoInstaller by anatawa12 - License: https://github.com/anatawa12/VPMPackageAutoInstaller/blob/master/LICENSE
/**
 * Browser-only bare-bones creator module.
 *
 * Usage:
 *   import { createUnityPackage, downloadUnityPackage } from './creator.web.mjs';
 */
let binary;

/**
 * @param {string|object} config
 * @return {Uint8Array}
 */
export async function createUnityPackage(config) {
  if (!binary) binary = (await wasmBinary()).instance.exports;
  return decodeWasmResult(createPackageWasm(encodeWasmInput(config)));
}

async function wasmBinary() {
  const wasmData = fetch(new URL('./vpai_creator.wasm', import.meta.url));
  return await (WebAssembly.instantiateStreaming ?
    WebAssembly.instantiateStreaming(wasmData) :
    WebAssembly.instantiate(new Uint8Array(await (await wasmData).arrayBuffer())));
}

function encodeWasmInput(config) {
  return new TextEncoder().encode(typeof config === 'string' ? config : JSON.stringify(config));
}

function createPackageWasm(jsonBin) {
  if (!binary) throw new Error('WASM binary not initialized.');
  const { memory, alloc_memory, free_memory, create_unitypackage_wasm } = binary;
  const ptr = alloc_memory(jsonBin.byteLength);
  try {
    const jsonBuf = new Uint8Array(memory.buffer, ptr, jsonBin.byteLength);
    jsonBuf.set(jsonBin);
    return create_unitypackage_wasm(ptr, jsonBin.byteLength);
  } finally {
    free_memory(ptr);
  }
}

function decodeWasmResult(resultPtr) {
  if (!binary) throw new Error('WASM binary not initialized.');
  const { memory, free_memory } = binary;
  const [msgPtr, msgLen] = new Uint32Array(memory.buffer, resultPtr, 2);
  try {
    const msg = new Uint8Array(memory.buffer, msgPtr, msgLen);
    if (!!(new Uint8Array(memory.buffer, resultPtr + 8, 1)[0]))
      throw new Error(new TextDecoder().decode(msg));
    // Copy the result out of wasm memory so it stays valid after future allocations.
    const output = new Uint8Array(msgLen);
    output.set(msg);
    return output;
  } finally {
    free_memory(msgPtr);
  }
}

/**
 * @param {string} fileName
 * @return {string}
 */
export function normalizeUnityPackageFileName(fileName = 'installer.unitypackage') {
  const trimmed = String(fileName ?? '').trim();
  const fallback = trimmed || 'installer.unitypackage';
  return fallback.endsWith('.unitypackage') ? fallback : `${fallback}.unitypackage`;
}

/**
 * @param {Uint8Array|ArrayBuffer|number[]} content
 * @param {string} fileName
 * @return {string} normalized file name
 */
export function downloadUnityPackage(content, fileName = 'installer.unitypackage') {
  const normalizedFileName = normalizeUnityPackageFileName(fileName);
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);

  const url = URL.createObjectURL(new Blob([bytes]));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = normalizedFileName;
  anchor.click();

  // Revoke asynchronously so the click navigation can consume the blob URL first.
  setTimeout(URL.revokeObjectURL, 0, url);
  return normalizedFileName;
}

const objects = new Map<string, Uint8Array>();

export async function putBundleObject(key: string, body: ArrayBuffer | Uint8Array) {
  objects.set(key, body instanceof Uint8Array ? body : new Uint8Array(body));
  return { key };
}

export async function getBundleObject(key: string) {
  return objects.get(key) ?? null;
}

export async function deleteBundleObject(key: string) {
  return objects.delete(key);
}

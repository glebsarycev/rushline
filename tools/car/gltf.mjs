// Minimal, dependency-free writers used by the car build script:
//  - encodePNG: RGBA8 image -> PNG bytes
//  - GLTFBuilder: meshes, PBR materials, embedded textures, node tree -> .glb

import zlib from 'node:zlib';

// ---- PNG ---------------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- glTF 2.0 binary ----------------------------------------------------------------------
const FLOAT = 5126, UINT16 = 5123, UINT32 = 5125;
const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963;

export class GLTFBuilder {
  constructor(generator) {
    this.json = {
      asset: { version: '2.0', generator },
      scene: 0,
      scenes: [{ name: 'Scene', nodes: [] }],
      nodes: [], meshes: [], materials: [], textures: [], images: [], samplers: [],
      accessors: [], bufferViews: [], buffers: [],
    };
    this.parts = [];
    this.length = 0;
    this.extensions = new Set();
  }

  _view(bytes, target) {
    const pad = (4 - (this.length % 4)) % 4;
    if (pad) { this.parts.push(Buffer.alloc(pad)); this.length += pad; }
    const view = { buffer: 0, byteOffset: this.length, byteLength: bytes.byteLength };
    if (target) view.target = target;
    this.parts.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    this.length += bytes.byteLength;
    this.json.bufferViews.push(view);
    return this.json.bufferViews.length - 1;
  }

  _accessor(array, type, componentType, target, withBounds = false) {
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type];
    const acc = { bufferView: this._view(array, target), componentType, count: array.length / size, type };
    if (withBounds) {
      const min = new Array(size).fill(Infinity), max = new Array(size).fill(-Infinity);
      for (let i = 0; i < array.length; i += size) {
        for (let k = 0; k < size; k++) { min[k] = Math.min(min[k], array[i + k]); max[k] = Math.max(max[k], array[i + k]); }
      }
      acc.min = min.map((v) => Math.fround(v));
      acc.max = max.map((v) => Math.fround(v));
    }
    this.json.accessors.push(acc);
    return this.json.accessors.length - 1;
  }

  addSampler(s = {}) {
    this.json.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497, ...s });
    return this.json.samplers.length - 1;
  }

  addTexture(png, name, sampler = 0) {
    const bufferView = this._view(new Uint8Array(png), null);
    this.json.images.push({ name, bufferView, mimeType: 'image/png' });
    this.json.textures.push({ name, sampler, source: this.json.images.length - 1 });
    return this.json.textures.length - 1;
  }

  addMaterial(m) {
    const mat = {
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: m.color || [1, 1, 1, 1],
        metallicFactor: m.metallic ?? 0,
        roughnessFactor: m.roughness ?? 1,
      },
    };
    if (m.baseColorTexture != null) mat.pbrMetallicRoughness.baseColorTexture = { index: m.baseColorTexture };
    if (m.metallicRoughnessTexture != null) mat.pbrMetallicRoughness.metallicRoughnessTexture = { index: m.metallicRoughnessTexture };
    if (m.emissive) mat.emissiveFactor = m.emissive;
    if (m.alphaMode) mat.alphaMode = m.alphaMode;
    if (m.doubleSided) mat.doubleSided = true;
    const ext = {};
    if (m.clearcoat) {
      ext.KHR_materials_clearcoat = { clearcoatFactor: m.clearcoat, clearcoatRoughnessFactor: m.clearcoatRoughness ?? 0.05 };
      this.extensions.add('KHR_materials_clearcoat');
    }
    if (m.emissiveStrength) {
      ext.KHR_materials_emissive_strength = { emissiveStrength: m.emissiveStrength };
      this.extensions.add('KHR_materials_emissive_strength');
    }
    if (Object.keys(ext).length) mat.extensions = ext;
    this.json.materials.push(mat);
    return this.json.materials.length - 1;
  }

  // prims: [{ position: Float32Array, normal, uv, index: Uint32Array, material }]
  addMesh(name, prims) {
    const primitives = prims.map((p) => {
      const attributes = {
        POSITION: this._accessor(p.position, 'VEC3', FLOAT, ARRAY_BUFFER, true),
        NORMAL: this._accessor(p.normal, 'VEC3', FLOAT, ARRAY_BUFFER),
      };
      if (p.uv) attributes.TEXCOORD_0 = this._accessor(p.uv, 'VEC2', FLOAT, ARRAY_BUFFER);
      const vertexCount = p.position.length / 3;
      const idx = vertexCount < 65536 ? Uint16Array.from(p.index) : Uint32Array.from(p.index);
      return {
        attributes,
        indices: this._accessor(idx, 'SCALAR', vertexCount < 65536 ? UINT16 : UINT32, ELEMENT_ARRAY_BUFFER),
        material: p.material,
      };
    });
    this.json.meshes.push({ name, primitives });
    return this.json.meshes.length - 1;
  }

  addNode(n) {
    const node = { name: n.name };
    if (n.mesh != null) node.mesh = n.mesh;
    if (n.translation) node.translation = n.translation;
    if (n.rotation) node.rotation = n.rotation;
    if (n.scale) node.scale = n.scale;
    if (n.extras) node.extras = n.extras;
    this.json.nodes.push(node);
    const i = this.json.nodes.length - 1;
    if (n.children) node.children = n.children;
    return i;
  }

  setRoots(indices) { this.json.scenes[0].nodes = indices; }

  // same asset as plain glTF JSON with the binary buffer embedded as a data URI
  // (for hosts that can't serve .glb files)
  toEmbeddedJSON() {
    const json = JSON.parse(JSON.stringify(this.json));
    let bin = Buffer.concat(this.parts);
    const pad = (4 - (bin.length % 4)) % 4;
    if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
    json.buffers = [{ byteLength: bin.length, uri: 'data:application/octet-stream;base64,' + bin.toString('base64') }];
    if (this.extensions.size) json.extensionsUsed = [...this.extensions];
    for (const k of ['textures', 'images', 'samplers']) if (!json[k].length) delete json[k];
    return JSON.stringify(json);
  }

  toGLB() {
    const json = this.json;
    json.buffers = [{ byteLength: this.length }];
    if (this.extensions.size) json.extensionsUsed = [...this.extensions];
    for (const k of ['textures', 'images', 'samplers']) if (!json[k].length) delete json[k];
    let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
    const jpad = (4 - (jsonBuf.length % 4)) % 4;
    if (jpad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
    let bin = Buffer.concat(this.parts);
    const bpad = (4 - (bin.length % 4)) % 4;
    if (bpad) bin = Buffer.concat([bin, Buffer.alloc(bpad)]);
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); // 'glTF'
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
    const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4); // JSON
    const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4); // BIN
    return Buffer.concat([header, jh, jsonBuf, bh, bin]);
  }
}

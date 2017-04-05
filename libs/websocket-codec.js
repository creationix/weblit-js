let { hexToB64, binToStr, uint16, uint64, flatten } = require("./bintools");
let { sha1 } = require("./sha1");
let { assert } = require("./assert");

let websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

exports.acceptKey = acceptKey;
function acceptKey(key) {
  return hexToB64(sha1(key + websocketGuid));
}

function rand4() {
  // Generate 32 bits of pseudo random data
  let num = Math.floor(Math.random() * 0x100000000);
  // Return as a 4-bytes
  return new Uint8Array([
    num >> 24,
    (num >> 16) & 0xff,
    (num >> 8) & 0xff,
    num & 0xff
  ]);
}

function applyMask(data, mask) {
  let length = data.length;
  let masked = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    masked[i] = data[i] ^ mask[i % 4];
  }
  return masked;
}

exports.decode = decode;
function decode(chunk) {
  let out;
  while ((out = decodeRaw(chunk))) {
    let [frame, extra] = out;
    if (frame.opcode === 1 || frame.opcode === 2) return [frame.payload, extra];
    if (!extra) return;
    chunk = extra;
  }
}

exports.decodeRaw = decodeRaw;
function decodeRaw(chunk) {
  if (!chunk) return;
  if (chunk.length < 2) return;
  let len = chunk[1] & 0x7f;
  let offset;
  if (len === 126) {
    if (chunk.length < 4) return;
    len = (chunk[2] << 8) | chunk[3];
    offset = 4;
  }
  else if (len === 127) {
    if (chunk.length < 10) return;
    len = ((
      (chunk[2] << 24) |
      (chunk[3] << 16) |
      (chunk[4] << 8) |
      chunk[5]
    ) >>> 0) * 0x100000000 +
    ((
      (chunk[6] << 24) |
      (chunk[7] << 16) |
      (chunk[8] << 8) |
      chunk[9]
    ) >>> 0);
    offset = 10;
  }
  else {
    offset = 2;
  }
  let mask = (chunk[1] & 0x80) > 0;
  if (mask) {
    offset += 4;
  }
  if (chunk.length < offset + len) return;

  let payload = chunk.slice(offset, offset + len);
  assert(payload.length === len, "Length mismatch");
  if (mask) payload = applyMask(payload, chunk.slice(offset - 4, offset));
  let opcode = (chunk[0] & 0xf);
  if (opcode === 1) {
    payload = binToStr(payload);
  }

  return [{
    fin: (chunk[0] & 0x80) > 0,
    opcode: opcode,
    mask: !!mask,
    len: len,
    payload: payload
  }, chunk.slice(offset + len)];
}

exports.encode = encode;
function encode(item) {
  if (item === undefined) return;
  if (typeof item === "string") {
    return encodeRaw({
      opcode: 1,
      payload: item
    });
  }
  if (item instanceof Uint8Array) {
    return encodeRaw({
      opcode: 2,
      payload: item
    });
  }
  throw new TypeError("Simple Websocket encoder only accepts string and Uint8Array buffers");
}

exports.encodeRaw = encodeRaw;
function encodeRaw(item) {
  if (typeof item === "string") {
    item = { opcode: 1, payload: item };
  }
  else if (item.constructor !== Object) {
    item = { opcode: 2, payload: item };
  }
  assert(item.hasOwnProperty('payload'),
    "payload is required in websocket message");

  let payload = flatten(item.payload);
  let len = payload.length;
  let head = [
    ((item.hasOwnProperty("fin") ? item.fin : true) ? 0x80 : 0) |
    (item.hasOwnProperty("opcode") ? item.opcode & 0xf : 2),
    (item.mask ? 0x80 : 0) |
    (len < 126 ? len : len < 0x10000 ? 126 : 127)
  ];
  if (len >= 0x10000) {
    head.push(uint64(len));
  }
  else if (len >= 126) {
    head.push(uint16(len));
  }
  if (item.mask) {
    let key = rand4();
    head.push(key);
    payload = applyMask(payload, key);
  }
  head.push(payload);
  return flatten(head);
}

// Tiny stack VM, make.fun tiny-stack-vm-01, ISA v1. Written from ISA.md alone.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Run one program; returns [outputBytes, exitCode].
function run(p, inp) {
  const s = new Int32Array(256), c = new Int32Array(64), m = new Int32Array(256), o = [];
  let sp = 0, cp = 0, pc = 0, st = 0, ip = 0, ol = 0;
  const n = p.length;
  for (;;) {
    if (st >= 1000000) return [o, 10];
    if (pc < 0 || pc >= n) return [o, 9];
    const op = p[pc];
    st++;
    switch (op) {
      case 0x00: return [o, 0];
      case 0x01: {
        if (pc + 1 >= n) return [o, 9];
        if (sp >= 256) return [o, 3];
        s[sp++] = (p[pc + 1] << 24) >> 24;
        pc += 2;
        break;
      }
      case 0x02: {
        if (pc + 4 >= n) return [o, 9];
        if (sp >= 256) return [o, 3];
        s[sp++] = p[pc + 1] | (p[pc + 2] << 8) | (p[pc + 3] << 16) | (p[pc + 4] << 24);
        pc += 5;
        break;
      }
      case 0x03: if (sp < 1) return [o, 2]; sp--; pc++; break; // POP
      case 0x04: if (sp < 1) return [o, 2]; if (sp >= 256) return [o, 3]; s[sp] = s[sp - 1]; sp++; pc++; break; // DUP
      case 0x05: if (sp < 2) return [o, 2]; { const t = s[sp - 1]; s[sp - 1] = s[sp - 2]; s[sp - 2] = t; } pc++; break; // SWAP
      case 0x06: if (sp < 2) return [o, 2]; if (sp >= 256) return [o, 3]; s[sp] = s[sp - 2]; sp++; pc++; break; // OVER
      case 0x07: if (sp < 3) return [o, 2]; { const a = s[sp - 3]; s[sp - 3] = s[sp - 2]; s[sp - 2] = s[sp - 1]; s[sp - 1] = a; } pc++; break; // ROT
      case 0x10: if (sp < 2) return [o, 2]; { const b = s[--sp]; s[sp - 1] = (s[sp - 1] + b) | 0; } pc++; break; // ADD
      case 0x11: if (sp < 2) return [o, 2]; { const b = s[--sp]; s[sp - 1] = (s[sp - 1] - b) | 0; } pc++; break; // SUB
      case 0x12: if (sp < 2) return [o, 2]; { const b = s[--sp]; s[sp - 1] = Math.imul(s[sp - 1], b); } pc++; break; // MUL
      case 0x13: if (sp < 2) return [o, 2]; { const b = s[--sp]; if (b === 0) return [o, 4]; s[sp - 1] = Math.trunc(s[sp - 1] / b) | 0; } pc++; break; // DIV
      case 0x14: if (sp < 2) return [o, 2]; { const b = s[--sp]; if (b === 0) return [o, 4]; s[sp - 1] = (s[sp - 1] % b) | 0; } pc++; break; // MOD
      case 0x15: if (sp < 2) return [o, 2]; { const b = s[--sp]; if (b === 0) return [o, 4]; s[sp - 1] = Math.trunc((s[sp - 1] >>> 0) / (b >>> 0)) | 0; } pc++; break; // DIVU
      case 0x16: if (sp < 2) return [o, 2]; { const b = s[--sp]; if (b === 0) return [o, 4]; s[sp - 1] = ((s[sp - 1] >>> 0) % (b >>> 0)) | 0; } pc++; break; // MODU
      case 0x17: if (sp < 1) return [o, 2]; s[sp - 1] = (-s[sp - 1]) | 0; pc++; break; // NEG
      case 0x18: if (sp < 2) return [o, 2]; { const b = s[--sp]; s[sp - 1] &= b; } pc++; break; // AND
      case 0x19: if (sp < 2) return [o, 2]; { const b = s[--sp]; s[sp - 1] |= b; } pc++; break; // OR
      case 0x1a: if (sp < 2) return [o, 2]; { const b = s[--sp]; s[sp - 1] ^= b; } pc++; break; // XOR
      case 0x1b: if (sp < 1) return [o, 2]; s[sp - 1] = ~s[sp - 1]; pc++; break; // NOT
      case 0x1c: if (sp < 2) return [o, 2]; { const b = s[--sp]; s[sp - 1] <<= (b & 31); } pc++; break; // SHL
      case 0x1d: if (sp < 2) return [o, 2]; { const b = s[--sp]; s[sp - 1] >>= (b & 31); } pc++; break; // SHR
      case 0x1e: if (sp < 2) return [o, 2]; { const b = s[--sp]; s[sp - 1] = (s[sp - 1] >>> (b & 31)) | 0; } pc++; break; // SHRU
      case 0x20: if (sp < 2) return [o, 2]; { const b = s[--sp]; s[sp - 1] = s[sp - 1] === b ? 1 : 0; } pc++; break; // EQ
      case 0x21: if (sp < 2) return [o, 2]; { const b = s[--sp]; s[sp - 1] = s[sp - 1] < b ? 1 : 0; } pc++; break; // LT
      case 0x22: if (sp < 2) return [o, 2]; { const b = s[--sp]; s[sp - 1] = (s[sp - 1] >>> 0) < (b >>> 0) ? 1 : 0; } pc++; break; // LTU
      case 0x30: { // JMP, 2-byte signed offset from the next instruction
        if (pc + 2 >= n) return [o, 9];
        const off = ((p[pc + 1] | (p[pc + 2] << 8)) << 16) >> 16;
        pc = pc + 3 + off;
        break;
      }
      case 0x31: { // JZ
        if (pc + 2 >= n) return [o, 9];
        if (sp < 1) return [o, 2];
        const off = ((p[pc + 1] | (p[pc + 2] << 8)) << 16) >> 16;
        const v = s[--sp];
        pc = v === 0 ? pc + 3 + off : pc + 3;
        break;
      }
      case 0x32: { // JNZ
        if (pc + 2 >= n) return [o, 9];
        if (sp < 1) return [o, 2];
        const off = ((p[pc + 1] | (p[pc + 2] << 8)) << 16) >> 16;
        const v = s[--sp];
        pc = v !== 0 ? pc + 3 + off : pc + 3;
        break;
      }
      case 0x33: { // CALL, 2-byte unsigned target
        if (pc + 2 >= n) return [o, 9];
        if (cp >= 64) return [o, 7];
        const t = p[pc + 1] | (p[pc + 2] << 8);
        c[cp++] = pc + 3;
        pc = t;
        break;
      }
      case 0x34: // RET
        if (cp === 0) return [o, 8];
        pc = c[--cp];
        break;
      case 0x40: // LOAD (addr -- v)
        if (sp < 1) return [o, 2];
        { const a = s[sp - 1];
          if (a < 0 || a > 255) return [o, 6];
          s[sp - 1] = m[a]; }
        pc++;
        break;
      case 0x41: // STORE (v addr --)
        if (sp < 2) return [o, 2];
        { const a = s[--sp]; const v = s[--sp];
          if (a < 0 || a > 255) return [o, 6];
          m[a] = v; }
        pc++;
        break;
      case 0x50: { // PRINT, decimal ASCII, no newline
        if (sp < 1) return [o, 2];
        const v = s[--sp];
        const t = String(v);
        if (ol + t.length > 65536) return [o, 11];
        for (let i = 0; i < t.length; i++) o.push(t.charCodeAt(i));
        ol += t.length;
        pc++;
        break;
      }
      case 0x51: // PUTC, one byte
        if (sp < 1) return [o, 2];
        { const v = s[--sp];
          if (ol >= 65536) return [o, 11];
          o.push(v & 255);
          ol++; }
        pc++;
        break;
      case 0x52: // IN, next input byte or -1 once used up
        if (sp >= 256) return [o, 3];
        s[sp++] = ip < inp.length ? inp[ip++] : -1;
        pc++;
        break;
      case 0x53: // EXIT, code is v AND 255
        if (sp < 1) return [o, 2];
        return [o, s[--sp] & 255];
      default: return [o, 5]; // unknown opcode
    }
  }
}

for (const id of readdirSync(I).sort()) {
  const prog = readFileSync(join(I, id, 'program.bin'));
  const inp = readFileSync(join(I, id, 'input.bin'));
  const [o, code] = run(prog, inp);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), Buffer.from(o));
  writeFileSync(join(O, id, 'exit.txt'), code + '\n');
}

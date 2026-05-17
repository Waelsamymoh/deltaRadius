import { workerData, parentPort } from 'worker_threads';

const CHARSETS = {
  numbers: '0123456789',
  letters: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  alphanumeric: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
};

function randomCode(format: 'numbers' | 'letters' | 'alphanumeric', length: number): string {
  const charset = CHARSETS[format];
  let code = '';
  for (let i = 0; i < length; i++) {
    code += charset[Math.floor(Math.random() * charset.length)];
  }
  return code;
}

const { quantity, codeFormat, codeLength, existing } = workerData as {
  quantity: number;
  codeFormat: 'numbers' | 'letters' | 'alphanumeric';
  codeLength: number;
  existing: string[];
};

const taken = new Set<string>(existing);
const codes: string[] = [];

while (codes.length < quantity) {
  const code = randomCode(codeFormat, codeLength);
  if (!taken.has(code)) {
    taken.add(code);
    codes.push(code);
  }
}

parentPort!.postMessage(codes);

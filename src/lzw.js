const MAX_DICT_SIZE = 4096;
const RESET_CODE = 256;

export default class LzwDecompressor {
  constructor() {
    this.resetDictionary();
  }

  resetDictionary() {
    this.dictionary = new Map();
    this.nextCode = RESET_CODE + 1;

    for (let b = 0; b < 256; b++) {
      this.dictionary.set(b, [b]);
    }
  }

  decompress(input) {
    let inputOffset = 0;
    let outputLength = 0;
    let seqs = [];
    let lastSeq = [];

    while (inputOffset < input.byteLength) {
      const code = input.getUint16(inputOffset, true);
      inputOffset += 2;

      if (code === RESET_CODE) {
        this.resetDictionary();
        lastSeq = [];
        continue;
      }

      let seq = this.dictionary.get(code);

      if (seq !== undefined) {
        seqs.push(seq);
        outputLength += seq.length;

        if (this.nextCode < MAX_DICT_SIZE && lastSeq.length > 0) {
          this.dictionary.set(this.nextCode, lastSeq.concat([seq[0]]));
          this.nextCode++;
        }
      } else if (code == this.nextCode) {
        if (lastSeq.length > 0) {
          seq = lastSeq.concat([lastSeq[0]])
          seqs.push(seq);
          outputLength += seq.length;

          if (this.nextCode < MAX_DICT_SIZE) {
            this.dictionary.set(this.nextCode, seq);
            this.nextCode++;
          }
        }
      } else {
        throw `invalid code ${code} (dict size: ${this.dictionary.size})`;
      }

      lastSeq = seq;
    }

    const output = new Uint8Array(new ArrayBuffer(outputLength));
    let outputOffset = 0;

    for (const seq of seqs) {
      output.set(seq, outputOffset);
      outputOffset += seq.length;
    }

    return output;
  }
}

const MAX_DICT_SIZE = 4096;

export default class LzwDecompressor {
  constructor() {
    this.resetDictionary();
  }

  resetDictionary() {
    this.dictionary = new Map();

    for (let b = 0; b < 256; b++) {
      this.dictionary.set(b, [b]);
    }
  }

  decompress(input) {
    const code = input.getUint16(0, true);
    let lastSeq = this.dictionary.get(code);
    let seqs = [lastSeq];
    let outputLength = lastSeq.length;
    let inputOffset = 2;

    while (inputOffset < input.byteLength) {
      const code = input.getUint16(inputOffset, true);
      let seq = this.dictionary.get(code);

      if (seq !== undefined) {
        seqs.push(seq);
        outputLength += seq.length;

        if (this.dictionary.size < MAX_DICT_SIZE) {
            this.dictionary.set(this.dictionary.size, lastSeq.concat([seq[0]]));
        }
      } else if (code == this.dictionary.size) {
        seq = lastSeq.concat([lastSeq[0]])
        seqs.push(seq);
        outputLength += seq.length;

        if (this.dictionary.size < MAX_DICT_SIZE) {
            this.dictionary.set(this.dictionary.size, seq);
        }
      } else {
        throw `invalid code ${code} (dict size: ${this.dictionary.size})`;
      }

      lastSeq = seq;
      inputOffset += 2;
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

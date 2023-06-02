const RESET_CODE = 256;
const STATS_SIZE = 1024;

export default class LzwDecompressor {
  constructor(codeSize) {
    this.maxDictSize = 1 << codeSize;
    this.resetDictionary();
    this.inputStats = new Array(STATS_SIZE);
    this.inputStats.fill(0);
    this.outputStats = new Array(STATS_SIZE);
    this.outputStats.fill(0);
    this.statsIndex = 0;
    this.inputLen = 0;
    this.outputLen = 0;
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
    let nextCodeHighHalf;

    while (inputOffset < input.byteLength) {
      let code;

      // decode next 12-bit integer from Uint8Array input
      if (nextCodeHighHalf === undefined) {
        const byte1 = input[inputOffset];
        const byte2 = input[inputOffset + 1];
        code = (byte1 << 4) | (byte2 >> 4);
        nextCodeHighHalf = byte2 & 15;
        inputOffset += 2;
      } else {
        code = (nextCodeHighHalf << 8) | input[inputOffset];
        nextCodeHighHalf = undefined;
        inputOffset += 1;
      }

      if (code === RESET_CODE) {
        this.resetDictionary();
        lastSeq = [];
        continue;
      }

      let seq = this.dictionary.get(code);

      if (seq !== undefined) {
        seqs.push(seq);
        outputLength += seq.length;

        if (this.nextCode < this.maxDictSize && lastSeq.length > 0) {
          this.dictionary.set(this.nextCode, lastSeq.concat([seq[0]]));
          this.nextCode++;
        }
      } else if (code == this.nextCode) {
        if (lastSeq.length > 0) {
          seq = lastSeq.concat([lastSeq[0]])
          seqs.push(seq);
          outputLength += seq.length;

          if (this.nextCode < this.maxDictSize) {
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

    this.inputStats[this.statsIndex] = input.byteLength;
    this.outputStats[this.statsIndex] = outputLength;
    this.statsIndex = (this.statsIndex + 1) % STATS_SIZE;
    this.inputLen += input.byteLength;
    this.outputLen += outputLength;

    return output;
  }

  stats() {
    const compressed = this.inputStats.slice(this.statsIndex).concat(this.inputStats.slice(0, this.statsIndex));
    const decompressed = this.outputStats.slice(this.statsIndex).concat(this.outputStats.slice(0, this.statsIndex));
    const totalRatio = this.inputLen / this.outputLen;

    return { compressed, decompressed, totalRatio };
  }
}

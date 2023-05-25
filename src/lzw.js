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

  decompress(view) {
    const k = view.getUint16(0, true);
    let last_entry = this.dictionary.get(k);
    let result = [last_entry];
    let resultLength = last_entry.length;
    let i = 2;

    while (i < view.byteLength) {
      const k = view.getUint16(i, true);
      let entry = this.dictionary.get(k);

      if (entry !== undefined) {
        result.push(entry);
        resultLength += entry.length;

        if (this.dictionary.size < MAX_DICT_SIZE) {
            this.dictionary.set(this.dictionary.size, last_entry.concat([entry[0]]));
        }
      } else if (k == this.dictionary.size) {
        entry = last_entry.concat([last_entry[0]])
        result.push(entry);
        resultLength += entry.length;

        if (this.dictionary.size < MAX_DICT_SIZE) {
            this.dictionary.set(this.dictionary.size, entry);
        }
      } else {
        throw `invalid code ${k} (dict size: ${this.dictionary.size})`;
      }

      last_entry = entry;
      i += 2;
    }

    const buffer = new ArrayBuffer(resultLength);
    const array = new Uint8Array(buffer);
    let offset = 0;

    for (const seq of result) {
        array.set(seq, offset);
        offset += seq.length;
    }

    return array;
  }
}

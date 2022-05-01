// Efficient array transformations without intermediate array objects.
// Inspired by Clojure's transducers and Elixir's streams.

class Stream {
  constructor(input, xfs) {
    this.input = input;
    this.xfs = xfs ?? [];
  }

  map(f) {
    return this.transform(Map(f));
  }

  flatMap(f) {
    return this.transform(FlatMap(f));
  }

  filter(f) {
    return this.transform(Filter(f));
  }

  take(n) {
    return this.transform(Take(n));
  }

  drop(n) {
    return this.transform(Drop(n));
  }

  transform(f) {
    return new Stream(this.input, this.xfs.concat([f]));
  }

  toArray() {
    return Array.from(this);
  }

  [Symbol.iterator]() {
    let i = 0;
    let v = 0;
    let values = [];
    let flushed = false;
    const xf = compose(this.xfs, val => values.push(val));

    return {
      next: () => {
        if (v === values.length) {
          values = [];
          v = 0;
        }

        while (values.length === 0 && i < this.input.length) {
          xf.step(this.input[i++]);
        }

        if (values.length === 0 && !flushed) {
          xf.flush();
          flushed = true;
        }

        if (values.length > 0) {
          return { done: false, value: values[v++] };
        } else {
          return { done: true };
        }
      }
    }
  }
}

function Map(f) {
  return emit => {
    return input => {
      emit(f(input));
    }
  }
}

function FlatMap(f) {
  return emit => {
    return input => {
      f(input).forEach(emit);
    }
  }
}

function Filter(f) {
  return emit => {
    return input => {
      if (f(input)) { emit(input) }
    }
  }
}

function Take(n) {
  let c = 0;

  return emit => {
    return input => {
      if (c < n) { emit(input) }
      c += 1;
    }
  }
}

function Drop(n) {
  let c = 0;

  return emit => {
    return input => {
      c += 1;
      if (c > n) { emit(input) }
    }
  }
}

function compose(xfs, push) {
  return xfs.reverse().reduce((next, curr) => {
    const xf = toXf(curr(next.step));

    return {
      step: xf.step,
      flush: () => {
        xf.flush();
        next.flush();
      }
    }
  }, toXf(push));
}

function toXf(xf) {
  if (typeof xf === 'function') {
    return { step: xf, flush: () => {} };
  } else {
    return xf;
  }
}

export default Stream;

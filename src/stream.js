// Efficient array transformations without intermediate array objects.
// Inspired by Elixir's streams and Rust's iterator adapters.

class Stream {
  constructor(input, xfs) {
    this.input = typeof input.next === 'function' ? input : input[Symbol.iterator]();
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

  multiplex(other, comparator) {
    return new Stream(
      new Multiplexer(this[Symbol.iterator](), other[Symbol.iterator](), comparator)
    );
  }

  toArray() {
    return Array.from(this);
  }

  [Symbol.iterator]() {
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

        while (values.length === 0) {
          const next = this.input.next();

          if (next.done) {
            break;
          } else {
            xf.step(next.value);
          }
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

class Multiplexer {
  constructor(left, right, comparator) {
    this.left = left;
    this.right = right;
    this.comparator = comparator;
  }

  [Symbol.iterator]() {
    let leftItem;
    let rightItem;

    return {
      next: () => {
        if (leftItem === undefined && this.left !== undefined) {
          const result = this.left.next();

          if (result.done) {
            this.left = undefined;
          } else {
            leftItem = result.value;
          }
        }

        if (rightItem === undefined && this.right !== undefined) {
          const result = this.right.next();

          if (result.done) {
            this.right = undefined;
          } else {
            rightItem = result.value;
          }
        }

        if (leftItem === undefined && rightItem === undefined) {
          return { done: true };
        } else if (leftItem === undefined) {
          const value = rightItem;
          rightItem = undefined;
          return { done: false, value: value };
        } else if (rightItem === undefined) {
          const value = leftItem;
          leftItem = undefined;
          return { done: false, value: value };
        } else if (this.comparator(leftItem, rightItem)) {
          const value = leftItem;
          leftItem = undefined;
          return { done: false, value: value };
        } else {
          const value = rightItem;
          rightItem = undefined;
          return { done: false, value: value };
        }
      }
    }
  }
}

export default Stream;

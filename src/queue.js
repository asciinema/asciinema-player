class Queue {
  constructor() {
    this.items = [];
    this.onPush = undefined;
  }

  push(item) {
    this.items.push(item);

    if (this.onPush !== undefined) {
      this.onPush(this.popAll());
      this.onPush = undefined;
    }
  }

  popAll() {
    if (this.items.length > 0) {
      const items = this.items;
      this.items = [];
      return items;
    } else {
      const thiz = this;

      return new Promise(resolve => {
        thiz.onPush = resolve;
      });
    }
  }
}

export default Queue;

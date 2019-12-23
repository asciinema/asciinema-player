const rust = import('./vt-js/pkg/vt_js');


class AsciinemaPlayerCore {
    constructor(url, opts) {
        this.url = url;
        this.loop = opts && !!opts.loop;

        this.lines = [];
        this.changedLines = {};

        this.runFrame = this.runFrame.bind(this);

        for (let i = 0; i < 24; i++) {
            this.lines = this.lines.concat(this.newLine());
        }


        rust.then(m => {
            // m.greet();
            console.log('wasm loaded');
        })
    }

    newLine() {
        return {
            id: Math.random(),
            segments: [['' + Math.random() + ' ', this.newAttrs()], ['' + Math.random() + ' ', this.newAttrs()], ['' + Math.random(), this.newAttrs()]]
        }
    }

    newAttrs() {
        return {
            fg: Math.floor(Math.random() * 8),
            bg: Math.floor(Math.random() * 8),
            bold: (Math.random() > 0.7),
            italic: (Math.random() > 0.8),
            underline: (Math.random() > 0.8)
        }
    }

    load() {
        return fetch(this.url)
            .then(res => res.json())
            .then(asciicast => {
                // console.log(asciicast);
                this.width = asciicast['width'];
                this.height = asciicast['height'];
                this.frames = asciicast['stdout'];

                return {
                    width: this.width,
                    height: this.height
                };
        })
    }

    start() {
        this.nextFrameIndex = 0;
        this.virtualElapsedTime = 0;
        this.startedTime = (new Date()).getTime();
        this.lastFrameTime = this.startedTime;
        this.scheduleNextFrame();
        // this.interval = setInterval(this.tick.bind(this), 10);
    }

    scheduleNextFrame() {
        const nextFrame = this.frames[this.nextFrameIndex];

        if (nextFrame) {
            const delay = nextFrame[0] * 1000;
            this.virtualElapsedTime += delay;
            const actualElapsedTime = (new Date()).getTime() - this.startedTime;
            let timeout = this.virtualElapsedTime - actualElapsedTime;

            if (timeout < 0) {
                timeout = 0;
            }

            setTimeout(this.runFrame, timeout);
            console.log(`${delay} => ${timeout}`);
        } else {
            console.log('done');

            if (this.loop) {
                this.start();
            }
        }
    }

    runFrame() {
        this.tick();
        this.nextFrameIndex++;
        this.scheduleNextFrame();
    }

    stop() {
        // clearInterval(this.interval);
        // clearTimeout(...);
    }

    tick() {
        if (Math.random() > 0.95) {
            this.lines = this.lines.slice(1).concat(this.newLine());
        } else {
            this.changedLines[Math.floor(Math.random() * 24)] = true;
            this.changedLines[Math.floor(Math.random() * 24)] = true;
        }
    }

    getLines() {
        for (let index in this.changedLines) {
            if (this.changedLines.hasOwnProperty(index)) {
                this.lines[index] = this.getLine(index);
            }
        }

        this.changedLines = {};

        return this.lines;
    }

    getLine(index) {
        return {
            id: this.lines[index].id,
            segments: [this.lines[index].segments[0], this.lines[index].segments[1], ['' + Math.random(), this.newAttrs()]]
        };
    }
}

export default AsciinemaPlayerCore;
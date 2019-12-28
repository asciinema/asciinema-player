const vt_module = import('./vt-js/pkg/vt_js');


class AsciinemaPlayerCore {
    constructor(url, opts) {
        this.url = url;
        this.loop = opts && !!opts.loop;

        this.lines = [];
        this.changedLines = {};

        this.runFrame = this.runFrame.bind(this);

        vt_module.then(vt => {
            // m.greet();
            console.log('wasm loaded');
        })
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
        console.log('starting');

        vt_module.then(vt => {
            console.log('actually starting');
            this.vt = vt.create(this.width, this.height);
            this.nextFrameIndex = 0;
            this.virtualElapsedTime = 0;
            this.startedTime = (new Date()).getTime();
            this.lastFrameTime = this.startedTime;
            this.scheduleNextFrame();
        })
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
            // console.log(`${delay} => ${timeout}`);
        } else {
            console.log('done');

            if (this.loop) {
                this.start();
            }
        }
    }

    runFrame() {
        this.vt.feed(this.frames[this.nextFrameIndex][1]);
        // this.tick();
        this.nextFrameIndex++;
        this.scheduleNextFrame();
    }

    stop() {
        // clearInterval(this.interval);
        // clearTimeout(...);
    }

    getLines() {
        if (this.vt) {
            // let lines = this.vt.dump();

            // for (let i in this.changedLines) {
            //     if (this.changedLines.hasOwnProperty(i)) {
            for (let i = 0; i < this.height; i++) {
                let segments = this.vt.get_line(i);
                // if (i == 21) {

                    // console.log(segments);
                // }
                this.lines[i] = {id: i, segments: segments};
            }
        }

        return this.lines;
    }
}

export default AsciinemaPlayerCore;
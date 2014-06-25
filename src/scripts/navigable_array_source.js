(function(exports) {

  function now() {
    return (new Date).getTime() / 1000;
  }

  function play(frames, speed, onFrame, onFinish) {
    var frameNo = 0;
    var startedAt = new Date;
    var timeoutId;

    function generate() {
      var frame = frames[frameNo];

      if (!frame) {
        return;
      }

      onFrame(frame[0], frame[1]);

      frameNo += 1;
      scheduleNextFrame();
    }

    function scheduleNextFrame() {
      var frame = frames[frameNo];

      if (frame) {
        timeoutId = setTimeout(generate, frames[frameNo][0] * 1000 / speed);
      } else {
        onFinish();

        if (window.console) {
          window.console.log('finished in ' + ((new Date).getTime() - startedAt.getTime()));
        }
      }
    }

    function stop() {
      clearTimeout(timeoutId);
    }

    scheduleNextFrame();

    return stop;
  }

  function NavigableArraySource(frames, speed) {
    this.frames = frames;
    this.speed  = speed || 1;
  }

  NavigableArraySource.prototype.start = function(onFrame, onFinish, setLoading) {
    var elapsedTime = 0;
    var currentFramePauseTime;
    var lastFrameTime;
    var paused = false;
    var finished = false;
    var stop;

    var playFrom = function(time) {
      lastFrameTime = now();
      elapsedTime = time;

      return play(this.framesFrom(time), this.speed, function(delay, changes) {
        lastFrameTime = now();
        elapsedTime += delay;
        onFrame(changes);
      }, function() {
        finished = true;
        onFinish();
      });
    }.bind(this);

    var currentFrameTime = function() {
      return (now() - lastFrameTime) * this.speed;
    }.bind(this);

    stop = playFrom(0);

    return {
      pause: function() {
        if (finished) {
          return false;
        }

        paused = true;
        stop();
        currentFramePauseTime = currentFrameTime();

        return true;
      }.bind(this),

      resume: function() {
        if (finished) {
          return false;
        }

        paused = false;
        stop = playFrom(elapsedTime + currentFramePauseTime);

        return true;
      }.bind(this),

      seek: function(seconds) {
        if (finished) {
          return false;
        }

        paused = false;
        stop();
        stop = playFrom(seconds);

        return true;
      }.bind(this),

      time: function() {
        if (finished) {
          return elapsedTime;
        } else if (paused) {
          return elapsedTime + currentFramePauseTime;
        } else {
          return elapsedTime + currentFrameTime();
        }
      }.bind(this),
    }
  }

  NavigableArraySource.prototype.framesFrom = function(fromTime) {
    var frameNo = 0;
    var currentTime = 0;
    var changes = {};

    while (currentTime + this.frames[frameNo][0] < fromTime) {
      var frame = this.frames[frameNo];
      currentTime += frame[0];
      asciinema.mergeChanges(changes, frame[1]);
      frameNo += 1;
    }

    var frames = [[0, changes]];

    var nextFrame = this.frames[frameNo];
    var delay = nextFrame[0] - (fromTime - currentTime);
    frames = frames.concat([[delay, nextFrame[1]]]);

    frames = frames.concat(this.frames.slice(frameNo + 1));

    return frames;
  }

  exports.NavigableArraySource = NavigableArraySource;

})(window.asciinema = window.asciinema || {});

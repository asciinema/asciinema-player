(function(exports) {

  function Movie(width, height, source, snapshot, totalTime) {
    this.width     = width;
    this.height    = height;
    this.source    = source;
    this.snapshot  = snapshot;
    this.totalTime = totalTime;
  }

  Movie.prototype.start = function(onFrame, onFinish, setTime, setLoading, loop) {
    var timeIntervalId;

    var controller = {};

    function onSourceFinish() {
      if (loop) {
        start();
      } else {
        clearInterval(timeIntervalId);
        onFinish();
      }
    }

    function start() {
      var ctrl = this.source.start(onFrame, onSourceFinish, setLoading);

      for (prop in ctrl) {
        controller[prop] = ctrl[prop];
      }
    }

    start();

    timeIntervalId = setInterval(function() {
      setTime(controller.time());
    }, 300);

    return controller;
  }

  exports.Movie = Movie;

})(window.asciinema = window.asciinema || {});

// var source = new ArraySource([]);
// var source = new CamSource(80, 24);
// var source = new WebsocketSource(url);

// var movie = new Movie(80, 24, source, [], 123.456);

// var controller = source.start(onFrame, onFinish, setLoading);
// controller.pause();

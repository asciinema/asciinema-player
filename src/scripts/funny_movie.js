(function(exports) {

  function FunnyMovie() {
    // this.onFrame = onFrame;
    this.n = 0;
    this.direction = 1
  }

  FunnyMovie.prototype.start = function(onFrame) {
    setInterval(function() {
      this.generateFrame(onFrame);
    }.bind(this), 100);
  }

  FunnyMovie.prototype.generateFrame = function(onFrame) {
    var lines = {};
    lines[this.n] = [[(new Date()).toString(), {}]];
    onFrame({ lines: lines });

    this.n += this.direction;
    if (this.n < 0 || this.n >= 10) {
      this.direction *= -1;
    }
  }

  FunnyMovie.prototype.pause = function() {
    return false;
  }

  FunnyMovie.prototype.resume = function() {
    return false;
  }

  FunnyMovie.prototype.seek = function(time) {
    return false;
  }

  exports.FunnyMovie = FunnyMovie;

})(window.asciinema = window.asciinema || {});

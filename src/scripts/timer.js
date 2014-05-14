(function(exports) {
  var dom = React.DOM;

  exports.Timer = React.createClass({ displayName: 'Timer',
    // props.currentTime
    // props.totalTime

    render: function() {
      return (
        dom.span({ className: "timer" },
          dom.span({ className: "time-elapsed" }, this.elapsedTime()),
          dom.span({ className: "time-remaining" }, this.remainingTime())
        )
      )
    },

    remainingTime: function() {
      var t = this.props.totalTime - this.props.currentTime;
      return "-" + this.formatTime(t);
    },

    elapsedTime: function() {
      return this.formatTime(this.props.currentTime);
    },

    formatTime: function(seconds) {
      if (seconds < 0) {
        seconds = 0;
      }

      return "" + this.minutes(seconds) + ":" + this.seconds(seconds);
    },

    minutes: function(s) {
      var minutes = Math.floor(s / 60)
      return this.pad2(minutes);
    },

    seconds: function(s) {
      var seconds = Math.floor(s % 60)
      return this.pad2(seconds);
    },

    pad2: function(number) {
      if (number < 10) {
        return '0' + number;
      } else {
        return number;
      }
    }

  });

})(window.asciinema = window.asciinema || {});

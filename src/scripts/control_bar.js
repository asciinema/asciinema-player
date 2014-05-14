/** @jsx React.DOM */

(function(exports) {
  var dom = React.DOM;

  var PlaybackControlButton = React.createClass({ displayName: 'PlayButton',
    // props: playing, onPauseClick, onResumeClick

    render: function() {
      var icon;

      if (this.props.playing) {
        icon = asciinema.PauseIcon();
      } else {
        icon = asciinema.PlayIcon();
      }

      return dom.span({ className: "playback-button", onClick: this.handleClick }, icon);
    },

    handleClick: function(event) {
      event.preventDefault();

      if (this.props.playing) {
        this.props.onPauseClick();
      } else {
        this.props.onResumeClick();
      }
    }

  });

  var FullscreenToggleButton = React.createClass({ displayName: 'FullscreenToggleButton',
    // props: fullscreen, onClick

    render: function() {
      var icon;

      if (this.props.fullscreen) {
        icon = asciinema.ShrinkIcon();
      } else {
        icon = asciinema.ExpandIcon();
      }

      return dom.span({ className: "fullscreen-button", onClick: this.handleClick }, icon);
    },

    handleClick: function(event) {
      event.preventDefault();
      this.props.onClick();
    },

  });

  exports.ControlBar = React.createClass({ displayName: 'ControlBar',
    // props: playing, fullscreen, currentTime, totalTime, onPauseClick,
    //        onResumeClick, onSeekClick, toggleFullscreen

    render: function() {
      return (
        dom.div({ className: "control-bar" },

          PlaybackControlButton({
            playing:       this.props.playing,
            onPauseClick:  this.props.onPauseClick,
            onResumeClick: this.props.onResumeClick
          }),

          asciinema.Timer({
            currentTime: this.props.currentTime,
            totalTime:   this.props.totalTime
          }),

          FullscreenToggleButton({
            fullscreen: this.props.fullscreen,
            onClick:    this.props.toggleFullscreen,
          }),

          asciinema.ProgressBar({
            value:   this.props.currentTime / this.props.totalTime,
            onClick: this.handleSeek
          })

        )
      )
    },

    handleSeek: function(value) {
      this.props.onSeekClick(value * this.props.totalTime);
    },

    shouldComponentUpdate: function(nextProps, nextState) {
      return nextProps.playing != this.props.playing ||
        nextProps.currentTime != this.props.currentTime ||
        nextProps.totalTime != this.props.totalTime ||
        nextProps.fullscreen != this.props.fullscreen;
    },

  });

})(window.asciinema = window.asciinema || {});

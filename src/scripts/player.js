(function(exports) {
  var dom = React.DOM;

  var Player = React.createClass({ displayName: 'Player',
    // props: movie, autoPlay, fontSize, theme, loop

    getInitialState: function() {
      var lines = this.props.movie.snapshot || [];
      var cursor = { x: 0, y: 0, visible: false };
      var fontSize = this.props.fontSize || 'small';

      return {
        lines:       lines,
        cursor:      cursor,
        fontSize:    fontSize,
        fullscreen:  false,
        loading:     false,
        state:       'not-started',
        currentTime: 0,
        totalTime:   this.props.movie.totalTime,
      }
    },

    componentWillMount: function() {
      if (this.props.autoPlay) {
        this.start();
      }
    },

    componentDidMount: function() {
      if (screenfull.enabled) {
        document.addEventListener(screenfull.raw.fullscreenchange, function() {
          this.setState({ fullscreen: screenfull.isFullscreen });
        }.bind(this));
      }

      window.addEventListener('resize', function() {
        this.setState({
          windowHeight: window.innerHeight,
          playerHeight: this.refs.player.getDOMNode().offsetHeight
        });
      }.bind(this), true);

      requestAnimationFrame(this.applyChanges);
    },

    render: function() {
      var overlay;

      if (this.state.loading) {
        overlay = asciinema.LoadingOverlay();
      } else if (!this.props.autoPlay && this.isNotStarted()) {
        overlay = asciinema.StartOverlay({ start: this.start });
      }

      return (
        dom.div({ className: 'asciinema-player-wrapper' },
          dom.div({ ref: 'player', className: this.playerClassName(), style: this.playerStyle() },

            asciinema.Terminal({
              width:          this.props.movie.width,
              height:         this.props.movie.height,
              fontSize:       this.fontSize(),
              lines:          this.state.lines,
              cursor:         this.state.cursor,
              cursorBlinking: this.isPlaying(),
            }),

            asciinema.ControlBar({
              playing:          this.isPlaying(),
              onPauseClick:     this.pause,
              onResumeClick:    this.resume,
              onSeekClick:      this.seek,
              currentTime:      this.state.currentTime,
              totalTime:        this.state.totalTime,
              fullscreen:       this.state.fullscreen,
              toggleFullscreen: this.toggleFullscreen,
            }),

            overlay
          )
        )
      );
    },

    playerClassName: function() {
      return 'asciinema-player ' + this.themeClassName();
    },

    themeClassName: function() {
      return 'asciinema-theme-' + (this.props.theme || 'tango');
    },

    fontSize: function() {
      if (this.state.fullscreen) {
        return 'small';
      } else {
        return this.state.fontSize;
      }
    },

    playerStyle: function() {
      if (this.state.fullscreen && this.state.windowHeight && this.state.playerHeight) {
        var space = this.state.windowHeight - this.state.playerHeight;

        if (space > 0) {
          return { marginTop: (space / 2) + 'px' };
        }
      }

      return {};
    },

    setLoading: function(loading) {
      this.setState({ loading: loading });
    },

    start: function() {
      this.setState({ state: 'playing' });
      this.movieController = this.props.movie.start(this.onFrame, this.onFinish, this.setTime, this.setLoading, this.props.loop);
    },

    onFinish: function() {
      this.setState({ state: 'finished' });
    },

    setTime: function(time) {
      this.setState({ currentTime: time });
    },

    pause: function() {
      if (this.movieController.pause && this.movieController.pause()) {
        this.setState({ state: 'paused' });
      }
    },

    resume: function() {
      if (this.isFinished()) {
        this.start();
      } else {
        if (this.movieController.resume && this.movieController.resume()) {
          this.setState({ state: 'playing' });
        }
      }
    },

    seek: function(time) {
      if (this.movieController.seek && this.movieController.seek(time)) {
        this.setState({ state: 'playing', currentTime: time });
      }
    },

    toggleFullscreen: function() {
      if (screenfull.enabled) {
        screenfull.toggle(this.getDOMNode());
      }
    },

    onFrame: function(changes) {
      this.changes = this.changes || {};
      asciinema.mergeChanges(this.changes, changes);
    },

    applyChanges: function() {
      requestAnimationFrame(this.applyChanges);

      // if (!this.dirty) {
      //   return;
      // }

      var changes = this.changes || {};
      var newState = {};

      if (changes.lines) {
        var lines = [];

        for (var n in this.state.lines) {
          lines[n] = this.state.lines[n];
        }

        for (var n in changes.lines) {
          lines[n] = changes.lines[n];
        }

        newState.lines = lines;
      }

      if (changes.cursor) {
        var cursor = {
          x: this.state.cursor.x,
          y: this.state.cursor.y,
          visible: this.state.cursor.visible
        };

        for (var key in changes.cursor) {
          cursor[key] = changes.cursor[key];
        }

        newState.cursor = cursor;
      }

      this.setState(newState);
      this.changes = {};
    },

    isNotStarted: function() {
      return this.state.state === 'not-started';
    },

    isPlaying: function() {
      return this.state.state === 'playing';
    },

    isFinished: function() {
      return this.state.state === 'finished';
    },
  });

  exports.mergeChanges = function(dest, src) {
    if (src.lines) {
      dest.lines = dest.lines || {};

      for (var n in src.lines) {
        dest.lines[n] = src.lines[n];
      }
    }

    if (src.cursor) {
      dest.cursor = dest.cursor || {};

      for (var key in src.cursor) {
        dest.cursor[key] = src.cursor[key];
      }
    }
  }

  exports.CreatePlayer = function(parentId, width, height, dataUrl, totalTime, options) {
    var options = options || {};
    var source = new asciinema.HttpArraySource(dataUrl, options.speed);
    var movie = new asciinema.Movie(width, height, source, options.snapshot, totalTime);

    React.renderComponent(
      Player({
        movie: movie,
        autoPlay: options.autoPlay,
        loop: options.loop,
        fontSize: options.fontSize,
        theme: options.theme
      }),
      document.getElementById(parentId)
    );
  }

})(window.asciinema = window.asciinema || {});

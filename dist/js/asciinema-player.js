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

(function(exports) {
  var dom = React.DOM;

  exports.Cursor = React.createClass({ displayName: 'Cursor',
    // props: fg, bg, char, inverse

    render: function() {
      return dom.span({ className: this.className() }, this.props.char);
    },

    className: function() {
      if (this.props.inverse) {
        return "cursor fg-" + this.props.fg + " bg-" + this.props.bg;
      } else {
        return "cursor fg-" + this.props.bg + " bg-" + this.props.fg;
      }
    },
  });

})(window.asciinema = window.asciinema || {});

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

(function(exports) {

  function HttpArraySource(url, speed) {
    this.url   = url;
    this.speed = speed || 1;
  }

  HttpArraySource.prototype.start = function(onFrame, onFinish, setLoading) {
    var controller;

    if (this.data) {
      controller = this.createController(onFrame, onFinish);
    } else {
      this.fetchData(setLoading, function() {
        controller = this.createController(onFrame, onFinish);
      }.bind(this));
    }

    return {
      time: function() {
        if (controller && controller.time) {
          return controller.time();
        }
      },

      pause: function() {
        if (controller && controller.pause) {
          return controller.pause();
        }
      },

      resume: function() {
        if (controller && controller.resume) {
          return controller.resume();
        }
      },

      seek: function(time) {
        if (controller && controller.seek) {
          return controller.seek(time);
        }
      }
    }
  }

  HttpArraySource.prototype.fetchData = function(setLoading, onResult) {
    setLoading(true);

    var request = $.ajax({ url: this.url, dataType: 'json' });

    request.done(function(data) {
      setLoading(false);
      this.data = data;
      onResult();
    }.bind(this));

    request.fail(function(jqXHR, textStatus) {
      setLoading(false);
      console.error(this.url, textStatus);
    });
  }

  HttpArraySource.prototype.createController = function(onFrame, onFinish) {
    arraySource = new asciinema.NavigableArraySource(this.data, this.speed);

    return arraySource.start(onFrame, onFinish);
  }

  exports.HttpArraySource = HttpArraySource;

})(window.asciinema = window.asciinema || {});

/** @jsx React.DOM */

(function(exports) {
  var dom = React.DOM;

  exports.PlayIcon = React.createClass({ displayName: 'PlayIcon',

    render: function() {
      return (
        dom.svg({ version: "1.1", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 12 12", className: "icon" },
          dom.path({ d: "M1,0 L11,6 L1,12 Z" })
        )
      )
    },

  });

  exports.PauseIcon = React.createClass({ displayName: 'PauseIcon',

    render: function() {
      return (
        dom.svg({ version: "1.1", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 12 12", className: "icon" },
          dom.path({ d: "M1,0 L4,0 L4,12 L1,12 Z" }),
          dom.path({ d: "M8,0 L11,0 L11,12 L8,12 Z" })
        )
      )
    },

  });

  exports.ExpandIcon = React.createClass({ displayName: 'ExpandIcon',

    render: function() {
      return (
        dom.svg({ version: "1.1", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 12 12", className: "icon" },
          dom.path({ d: "M0,0 L5,0 L3,2 L5,4 L4,5 L2,3 L0,5 Z" }),
          dom.path({ d: "M12,12 L12,7 L10,9 L8,7 L7,8 L9,10 L7,12 Z" })
        )
      )
    },

  });

  exports.ShrinkIcon = React.createClass({ displayName: 'ShrinkIcon',

    render: function() {
      return (
        dom.svg({ version: "1.1", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 12 12", className: "icon" },
          dom.path({ d: "M5,5 L5,0 L3,2 L1,0 L0,1 L2,3 L0,5 Z" }),
          dom.path({ d: "M7,7 L12,7 L10,9 L12,11 L11,12 L9,10 L7,12 Z" })
        )
      )
    },

  });

})(window.asciinema = window.asciinema || {});

(function(exports) {
  var dom = React.DOM;

  exports.Line = React.createClass({ displayName: 'Line',
    // props: parts, cursorX, cursorInverted

    render: function() {
      var lineLength = 0;
      var cursorX = this.props.cursorX;

      var parts = this.props.parts.map(function(part, index) {
        var attrs = {};
        // clone attrs, so we can adjust it below
        for (key in part[1]) {
          attrs[key] = part[1][key];
        }

        var partProps = { text: part[0], attrs: attrs };
        var partLength = part[0].length;

        if (cursorX !== null) {
          if (lineLength <= cursorX && cursorX < lineLength + partLength) {
            partProps.cursorX = cursorX - lineLength;
            partProps.cursorInverted = this.props.cursorInverted;

            // TODO: remove this hack and update terminal.c to do this instead
            if (attrs.inverse) {
              delete attrs.inverse;
            } else {
              attrs.inverse = true;
            }
          }
        }

        lineLength += partLength;

        return asciinema.Part(partProps);
      }.bind(this));

      return dom.span({ className: "line" }, parts);
    },

  });
})(window.asciinema = window.asciinema || {});

(function(exports) {

  function Movie(width, height, source, snapshot, totalTime) {
    this.width     = width;
    this.height    = height;
    this.source    = source;
    this.snapshot  = snapshot;
    this.totalTime = totalTime;
  }

  Movie.prototype.start = function(onFrame, onFinish, setTime, setLoading) {
    var timeIntervalId;

    function onSourceFinish() {
      clearInterval(timeIntervalId);
      onFinish();
    }

    var controller = this.source.start(onFrame, onSourceFinish, setLoading);

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

(function(exports) {
  var dom = React.DOM;

  exports.LoadingOverlay = React.createClass({ displayName: 'LoadingOverlay',

    render: function() {
      return (
        dom.div({ className: "loading" },
          dom.div({ className: "loader" })
        )
      );
    }

  });

  exports.StartOverlay = React.createClass({ displayName: 'StartOverlay',
    // props: start

    render: function() {
      return (
        dom.div({ className: "start-prompt", onClick: this.onClick },
          dom.div({ className: "play-button" },
            dom.div(null,
              dom.span(null, 
                asciinema.PlayIcon()
              )
            )
          )
        )
      );
    },

    onClick: function(event) {
      event.preventDefault();
      this.props.start();
    },

  });
})(window.asciinema = window.asciinema || {});

(function(exports) {
  var dom = React.DOM;

  exports.Part = React.createClass({ displayName: 'Part',
    // props: text, attrs, cursorX, cursorInverted

    render: function() {
      return dom.span({ className: this.className() }, this.children());
    },

    children: function() {
      var text = this.props.text;
      var cursorX = this.props.cursorX;

      if (cursorX !== undefined) {
        var elements = [];

        if (cursorX > 0) {
          elements = elements.concat([text.slice(0, cursorX)])
        }

        var cursor = asciinema.Cursor({
          fg:      this.fgColor() || 'fg',
          bg:      this.bgColor() || 'bg',
          char:    text[cursorX],
          inverse: this.props.cursorInverted,
        });

        elements = elements.concat([cursor]);

        if (cursorX + 1 < text.length) {
          elements = elements.concat([text.slice(cursorX + 1)]);
        }

        return elements;
      } else {
        return this.props.text;
      }
    },

    fgColor: function() {
      var fg = this.props.attrs.fg;

      if (this.props.attrs.bold && fg !== undefined && fg < 8) {
        fg += 8;
      }

      return fg;
    },

    bgColor: function() {
      var bg = this.props.attrs.bg;

      if (this.props.attrs.blink && bg !== undefined && bg < 8) {
        bg += 8;
      }

      return bg;
    },

    className: function() {
      var classes = [];
      var attrs = this.props.attrs;

      var fg = this.fgColor();
      var bg = this.bgColor();

      if (attrs.inverse) {
        var fgClass, bgClass;

        if (bg !== undefined) {
          fgClass = 'fg-' + bg;
        } else {
          fgClass = 'fg-bg';
        }

        if (fg !== undefined) {
          bgClass = 'bg-' + fg;
        } else {
          bgClass = 'bg-fg';
        }

        classes = classes.concat([fgClass, bgClass]);
      } else {
        if (fg !== undefined) {
          classes = classes.concat(['fg-' + fg]);
        }

        if (bg !== undefined) {
          classes = classes.concat(['bg-' + bg]);
        }
      }

      if (attrs.bold) {
        classes = classes.concat(['bright']);
      }

      if (attrs.underline) {
        classes = classes.concat(['underline']);
      }

      return classes.join(' ');
    }

  });
})(window.asciinema = window.asciinema || {});

(function(exports) {
  var dom = React.DOM;

  exports.Player = React.createClass({ displayName: 'Player',
    // props: movie, autoPlay, fontSize, theme

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
      return 'asciinema-theme-' + (this.props.theme || 'default');
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
      this.movieController = this.props.movie.start(this.onFrame, this.onFinish, this.setTime, this.setLoading);
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

  exports.createPlayer = function(parent) {
    var source = new asciinema.HttpArraySource("/demo/7443-stdout.json", 1);
    var snapshot = [[["$ # Wow! it must have some special characters to do that.                       ",{}]],[["$ cat -A file                                                                   ",{}]],[["Printing with ^[[1m^[[5m^[[31m^[[4mstyle!^[[m^O$                                ",{}]],[["$ # Hm, well that's not very explanatory...                                     ",{}]],[["$ teseq --color file                                                            ",{}]],[["|",{}],["Printing with ",{"fg":6,"inverse":true}],["|                                                                ",{}]],[[": Esc [ 1 m",{"fg":3}],["                                                                     ",{}]],[["\u0026 SGR: SELECT GRAPHIC RENDITION",{"fg":5}],["                                                 ",{}]],[["\" Set bold text.",{"fg":2}],["                                                                ",{}]],[[": Esc [ 5 m",{"fg":3}],["                                                                     ",{}]],[["\u0026 SGR: SELECT GRAPHIC RENDITION",{"fg":5}],["                                                 ",{}]],[["\" Set slowly blinking text.",{"fg":2}],["                                                     ",{}]],[[": Esc [ 31 m",{"fg":3}],["                                                                    ",{}]],[["\u0026 SGR: SELECT GRAPHIC RENDITION",{"fg":5}],["                                                 ",{}]],[["\" Set foreground color red.",{"fg":2}],["                                                     ",{}]],[[": Esc [ 4 m",{"fg":3}],["                                                                     ",{}]],[["\u0026 SGR: SELECT GRAPHIC RENDITION",{"fg":5}],["                                                 ",{}]],[["\" Set underlined text.",{"fg":2}],["                                                          ",{}]],[["|",{}],["style!",{"fg":6,"inverse":true}],["|                                                                        ",{}]],[[": Esc [ m",{"fg":3}],["                                                                       ",{}]],[["\u0026 SGR: SELECT GRAPHIC RENDITION",{"fg":5}],["                                                 ",{}]],[["\" Clear graphic rendition to defaults.",{"fg":2}],["                                          ",{}]],[[". SI/^O LF/^J",{"fg":1}],["                                                                   ",{}]],[["$ # Oh, cool, now I know how it does it!",{}],[" ",{"inverse":true}],["                                       ",{}]]];
    var movie = new asciinema.Movie(80, 24, source, snapshot, 52);

    React.renderComponent(
      asciinema.Player({ autoPlay: false, movie: movie }),
      parent
    );
  }

})(window.asciinema = window.asciinema || {});

(function(exports) {
  var dom = React.DOM;

  exports.ProgressBar = React.createClass({ displayName: 'ProgressBar',
    // props.value
    // props.onClick

    render: function() {
      var width = 100 * this.props.value;

      return (
        dom.span({ className: "progress-bar" },
          dom.span({ className: "bar", ref: "bar", onMouseDown: this.handleClick },
            dom.span({ className: "gutter" },
              dom.span({ style: { width: width + "%" } })
            )
          )
        )
      )
    },

    handleClick: function(event) {
      event.preventDefault();

      var target = event.target || event.srcElement,
        style = target.currentStyle || window.getComputedStyle(target, null),
        borderLeftWidth = parseInt(style['borderLeftWidth'], 10),
        borderTopWidth = parseInt(style['borderTopWidth'], 10),
        rect = target.getBoundingClientRect(),
        offsetX = event.clientX - borderLeftWidth - rect.left,
        offsetY = event.clientY - borderTopWidth - rect.top;

      var barWidth = this.refs.bar.getDOMNode().offsetWidth;
      this.props.onClick(offsetX / barWidth);
    }

  });

})(window.asciinema = window.asciinema || {});

(function(exports) {
  var dom = React.DOM;

  exports.Terminal = React.createClass({ displayName: 'Terminal',
    // props: width, height, fontSize, lines, cursor, cursorBlinking

    getInitialState: function() {
      return { cursorInverted: false };
    },

    render: function() {
      var cursor = this.props.cursor;

      var lines = this.props.lines.map(function(line, index) {
        if (cursor.visible && cursor.y == index) {
          return asciinema.Line({
            parts:          line,
            cursorX:        cursor.x,
            cursorInverted: this.props.cursorBlinking && this.state.cursorInverted,
          });
        } else {
          return asciinema.Line({ parts: line });
        }

      }.bind(this));

      return dom.pre({ className: this.className(), style: this.style() }, lines);
    },

    className: function() {
      return "terminal " + this.fontClassName();
    },

    fontClassName: function() {
      return 'font-' + this.props.fontSize;
    },

    style: function() {
      if (this.state.charDimensions) {
        var dimensions = this.state.charDimensions[this.props.fontSize];
        var width  = this.props.width  * dimensions.width  + 'px';
        var height = this.props.height * dimensions.height + 'px';
        return { width: width, height: height };
      } else {
        return {};
      }
    },

    componentDidMount: function() {
      this.calculateCharDimensions();
      this.startBlinking();
    },

    componentDidUpdate: function(prevProps, prevState) {
      if (prevProps.lines != this.props.lines || prevProps.cursor != this.props.cursor) {
        this.restartBlinking();
      }
    },

    componentWillUnmount: function() {
      this.stopBlinking();
    },

    shouldComponentUpdate: function(nextProps, nextState) {
      return nextProps.lines != this.props.lines ||
             nextProps.cursor != this.props.cursor ||
             nextProps.fontSize != this.props.fontSize ||
             nextState.cursorInverted != this.state.cursorInverted ||
             nextState.charDimensions != this.state.charDimensions;
    },

    calculateCharDimensions: function() {
      var $tmpChild = $('<span class="font-sample"><span class="line"><span class="char">M</span></span></span>');
      this.getDOMNode().appendChild($tmpChild[0]);
      var $span = $tmpChild.find('.char');

      var charDimensions = {};

      $tmpChild.addClass('font-small');
      charDimensions.small = { width: $span.width(), height: $tmpChild.height() };

      $tmpChild.removeClass('font-small');
      $tmpChild.addClass('font-medium');
      charDimensions.medium = { width: $span.width(), height: $tmpChild.height() };

      $tmpChild.removeClass('font-medium');
      $tmpChild.addClass('font-big');
      charDimensions.big = { width: $span.width(), height: $tmpChild.height() };

      $tmpChild.remove();

      this.setState({ charDimensions: charDimensions });
    },

    startBlinking: function() {
      this.cursorBlinkInvervalId = setInterval(this.flip, 500);
    },

    stopBlinking: function() {
      clearInterval(this.cursorBlinkInvervalId);
    },

    restartBlinking: function() {
      this.stopBlinking();
      this.reset();
      this.startBlinking();
    },

    reset: function() {
      this.setState({ cursorInverted: false });
    },

    flip: function() {
      this.setState({ cursorInverted: !this.state.cursorInverted });
    },

  });
})(typeof exports === 'undefined' ? (this.asciinema = this.asciinema || {}) : exports);

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

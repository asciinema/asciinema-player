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
      return "asciinema-terminal " + this.fontClassName();
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
      var $tmpChild = $('<span class="font-sample"><span class="line"><span class="char">MMMMMMMMMM</span></span></span>');
      this.getDOMNode().appendChild($tmpChild[0]);
      var $span = $tmpChild.find('.char');

      var charDimensions = {};

      $tmpChild.addClass('font-small');
      charDimensions.small = { width: $span.width() / 10, height: $tmpChild.height() };

      $tmpChild.removeClass('font-small');
      $tmpChild.addClass('font-medium');
      charDimensions.medium = { width: $span.width() / 10, height: $tmpChild.height() };

      $tmpChild.removeClass('font-medium');
      $tmpChild.addClass('font-big');
      charDimensions.big = { width: $span.width() / 10, height: $tmpChild.height() };

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

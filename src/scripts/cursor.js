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

(function(exports) {
  var dom = React.DOM;

  exports.ProgressBar = React.createClass({ displayName: 'ProgressBar',
    // props.value
    // props.onClick

    render: function() {
      var width = 100 * this.props.value;

      return (
        dom.span({ className: "progressbar" },
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

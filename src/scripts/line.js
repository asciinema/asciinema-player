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
